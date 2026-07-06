"""
Service d'analyse du pipeline de candidatures.

Toute statistique ici est calculée à partir de JobMatchStatusEvent —
l'historique réel des changements de statut — jamais à partir du seul
statut courant (qui ne garderait pas trace, par exemple, d'un entretien
obtenu avant un refus final). Aucune statistique de marché externe
("cette entreprise répond en moyenne en 11 jours") n'est utilisée : on
ne dispose pas de cette donnée et il serait malhonnête de l'inventer.
"""
from django.utils import timezone

from jobs.models import JobMatch, JobMatchStatusEvent

RESPONSE_STATUSES = ('entretien', 'offre', 'refuse')
INTERVIEW_STATUSES = ('entretien', 'offre')
STUCK_THRESHOLD_DAYS = 10


def compute_pipeline_kpis(profile) -> dict:
    """
    Taux de réponse, entretiens obtenus, offres reçues et délai moyen de
    réponse — tous calculés depuis l'historique réel des candidatures,
    pas depuis une estimation de marché.
    """
    events = JobMatchStatusEvent.objects.filter(match__user=profile)

    postule_match_ids = set(events.filter(to_status='postule').values_list('match_id', flat=True))
    responded_match_ids = set(
        events.filter(to_status__in=RESPONSE_STATUSES).values_list('match_id', flat=True)
    )
    interview_match_ids = set(
        events.filter(to_status__in=INTERVIEW_STATUSES).values_list('match_id', flat=True)
    )
    offer_match_ids = set(events.filter(to_status='offre').values_list('match_id', flat=True))

    responded_count = len(postule_match_ids & responded_match_ids)
    response_rate = (
        round(responded_count / len(postule_match_ids) * 100, 1) if postule_match_ids else None
    )

    delays = []
    for match_id in postule_match_ids:
        postule_event = (
            events.filter(match_id=match_id, to_status='postule').order_by('occurred_at').first()
        )
        if not postule_event:
            continue
        next_event = (
            events.filter(match_id=match_id, occurred_at__gt=postule_event.occurred_at)
            .order_by('occurred_at').first()
        )
        if next_event:
            delays.append((next_event.occurred_at - postule_event.occurred_at).total_seconds() / 86400)

    return {
        'response_rate': response_rate,
        'responded_count': responded_count,
        'postule_count': len(postule_match_ids),
        'interviews_count': len(interview_match_ids),
        'offers_count': len(offer_match_ids),
        'avg_response_delay_days': round(sum(delays) / len(delays), 1) if delays else None,
    }


def compute_followup_suggestions(profile, threshold_days: int = STUCK_THRESHOLD_DAYS) -> list:
    """
    Candidatures "Postulé" sans changement de statut depuis au moins
    `threshold_days` jours — une relance est probablement pertinente.
    Basé uniquement sur status_updated_at, jamais sur une probabilité
    de réponse inventée.
    """
    stuck = (
        JobMatch.objects.filter(user=profile, kanban_status='postule', status_updated_at__isnull=False)
        .select_related('job')
    )
    now = timezone.now()
    suggestions = []

    for match in stuck:
        days_since = (now - match.status_updated_at).days
        if days_since >= threshold_days:
            suggestions.append({
                'match_id': match.id,
                'job_title': match.job.title,
                'company_name': match.job.company_name,
                'days_since': days_since,
            })

    suggestions.sort(key=lambda s: s['days_since'], reverse=True)
    return suggestions


MIN_SAMPLE_SIZE = 3  # sous ce seuil, un motif n'est pas assez fiable pour être affiché


def analyze_interview_gap(profile) -> list:
    """
    Analyse pourquoi les candidatures "Postulé" ne progressent pas,
    uniquement à partir de motifs réellement observables dans les
    données de l'utilisateur — jamais une statistique de marché
    ("18% de réponse chez les ESN") qu'on ne possède pas. Renvoie une
    liste vide tant que l'échantillon est trop petit pour être fiable.
    """
    from django.db.models import Avg

    stuck = JobMatch.objects.filter(user=profile, kanban_status='postule').select_related('job')
    progressed = JobMatch.objects.filter(user=profile, kanban_status__in=['entretien', 'offre'])

    insights = []
    stuck_count = stuck.count()

    if stuck_count >= MIN_SAMPLE_SIZE:
        gap_counts = {}
        for m in stuck:
            for skill in (m.skill_gaps or {}).keys():
                gap_counts[skill] = gap_counts.get(skill, 0) + 1

        if gap_counts:
            top_skill, count = max(gap_counts.items(), key=lambda x: x[1])
            share = round(count / stuck_count * 100)
            if share >= 40:
                insights.append({
                    'type': 'skill_gap',
                    'message': f"{share}% de vos candidatures sans réponse manquent la compétence "
                               f"« {top_skill} ».",
                })

        under_count = stuck.filter(experience_fit='under').count()
        under_share = round(under_count / stuck_count * 100)
        if under_share >= 30:
            insights.append({
                'type': 'experience',
                'message': f"{under_share}% de vos candidatures sans réponse demandaient plus "
                           f"d'expérience que ce que vous avez renseigné.",
            })

    if stuck_count >= MIN_SAMPLE_SIZE and progressed.count() >= MIN_SAMPLE_SIZE:
        avg_stuck = stuck.aggregate(avg=Avg('match_score'))['avg']
        avg_progressed = progressed.aggregate(avg=Avg('match_score'))['avg']
        if avg_stuck is not None and avg_progressed is not None and avg_progressed > avg_stuck:
            diff = round(avg_progressed - avg_stuck, 1)
            insights.append({
                'type': 'score_comparison',
                'message': f"Vos candidatures ayant mené à un entretien avaient un score de "
                           f"correspondance en moyenne {diff} points plus élevé que celles restées "
                           f"sans réponse.",
            })

    return insights


def compute_score_bucket_analytics(profile) -> list:
    """
    Taux de réponse par tranche de score de correspondance — calculé
    uniquement sur vos candidatures réelles ("Postulé" et au-delà),
    jamais une moyenne de marché.
    """
    buckets = [
        ('90-100%', 90, 101),
        ('75-89%', 75, 90),
        ('60-74%', 60, 75),
        ('< 60%', 0, 60),
    ]
    results = []
    for label, low, high in buckets:
        applied = JobMatch.objects.filter(
            user=profile, match_score__gte=low, match_score__lt=high,
            kanban_status__in=['postule', 'entretien', 'offre', 'refuse'],
        )
        total = applied.count()
        if total == 0:
            continue
        responded = applied.filter(kanban_status__in=['entretien', 'offre']).count()
        results.append({
            'bucket': label,
            'total': total,
            'response_rate': round(responded / total * 100, 1),
        })
    return results


def compute_timeline(profile, limit: int = 50) -> list:
    """
    Historique chronologique de tous les événements de candidature
    (changements de statut), du plus récent au plus ancien.
    """
    events = (
        JobMatchStatusEvent.objects.filter(match__user=profile)
        .select_related('match__job')
        .order_by('-occurred_at')[:limit]
    )
    return [
        {
            'job_title': e.match.job.title,
            'company_name': e.match.job.company_name,
            'to_status': e.to_status,
            'occurred_at': e.occurred_at.isoformat(),
        }
        for e in events
    ]
