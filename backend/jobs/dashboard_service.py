"""
Service du tableau de bord décisionnel.

Principe directeur : chaque élément affiché doit aider à répondre à
"qu'est-ce que je fais aujourd'hui ?". Aucune priorité n'est générée
par un modèle de langage ici — tout est calculé de façon déterministe
à partir de données réellement présentes en base, pour qu'une priorité
affichée soit toujours vérifiable et jamais une supposition.
"""
from django.utils import timezone

from jobs.matching import aggregate_skill_gaps
from jobs.models import JobMatch, JobListing, CompanyContact, DailyActionCompletion
from jobs.snapshots import get_pulse_delta, get_employability_delta

RECENT_WINDOW_DAYS = 7


def compute_priorities(profile, limit: int = 3) -> list:
    """
    Jusqu'à `limit` priorités du jour, classées par ordre d'apparition
    ci-dessous (offres excellentes en premier, puis compétence la plus
    bloquante, puis relances réseau en attente).
    """
    priorities = []
    since_yesterday = timezone.now() - timezone.timedelta(days=1)

    new_excellent = JobMatch.objects.filter(
        user=profile, match_score__gte=90, created_at__gte=since_yesterday
    ).count()
    if new_excellent > 0:
        priorities.append({
            'type': 'offers',
            'title': f"{new_excellent} nouvelle{'s' if new_excellent > 1 else ''} offre"
                     f"{'s' if new_excellent > 1 else ''} à plus de 90 % de correspondance",
            'subtitle': 'Découvertes depuis hier',
            'route': '/offres',
        })

    gaps = aggregate_skill_gaps(JobMatch.objects.filter(user=profile), limit=1)
    if gaps:
        top_gap = gaps[0]
        priorities.append({
            'type': 'skill',
            'title': f"Ajouter {top_gap['skill']} à votre profil",
            'subtitle': f"Compétence manquante dans {top_gap['count']} de vos offres correspondantes",
            'route': '/analyse-ecart',
        })

    to_contact = CompanyContact.objects.filter(user=profile, status='a_contacter').count()
    if to_contact > 0:
        priorities.append({
            'type': 'network',
            'title': f"{to_contact} entreprise{'s' if to_contact > 1 else ''} à approcher",
            'subtitle': 'Identifiées depuis vos offres correspondantes',
            'route': '/contacts',
        })

    # Les priorités cochées aujourd'hui restent visibles mais marquées
    # "complétée" — elles ne disparaissent pas du jour au lendemain
    # avant minuit, pour que l'utilisateur voie sa progression du jour.
    today = timezone.now().date()
    completed_today = set(
        DailyActionCompletion.objects.filter(user=profile, completed_for_date=today)
        .values_list('action_type', flat=True)
    )
    for p in priorities:
        p['completed'] = p['type'] in completed_today

    return priorities[:limit]


def compute_recent_activity(profile, limit: int = 8) -> list:
    """
    Événements réels des derniers jours : nouvelles offres publiées par
    une entreprise suivie, et changements de statut de candidature.
    Jamais d'événement supposant une donnée qu'on n'a pas (consultation
    de profil, message reçu) — ces signaux n'existent pas dans Clutchr.
    """
    since = timezone.now() - timezone.timedelta(days=RECENT_WINDOW_DAYS)
    events = []

    tracked_companies = list(
        CompanyContact.objects.filter(user=profile).values_list('company_name', flat=True)
    )
    if tracked_companies:
        recent_listings = (
            JobListing.objects.filter(company_name__in=tracked_companies, scraped_date__gte=since)
            .order_by('-scraped_date')[:limit]
        )
        for listing in recent_listings:
            events.append({
                'type': 'new_listing',
                'description': f"{listing.company_name} a publié une nouvelle offre : {listing.title}",
                'timestamp': listing.scraped_date.isoformat(),
                'route': '/offres',
            })

    status_changes = (
        JobMatch.objects.filter(user=profile, status_updated_at__gte=since)
        .exclude(status_updated_at__isnull=True)
        .select_related('job')
        .order_by('-status_updated_at')[:limit]
    )
    for match in status_changes:
        events.append({
            'type': 'status_change',
            'description': f"{match.job.title} chez {match.job.company_name} — "
                            f"statut mis à jour : {match.get_kanban_status_display()}",
            'timestamp': match.status_updated_at.isoformat(),
            'route': '/suivi',
        })

    events.sort(key=lambda e: e['timestamp'], reverse=True)
    return events[:limit]


def compute_opportunity_stats(profile) -> dict:
    """Statistiques réelles sur les offres correspondantes, sans estimation."""
    since_yesterday = timezone.now() - timezone.timedelta(days=1)
    matches = JobMatch.objects.filter(user=profile)

    return {
        'excellent_count': matches.filter(match_score__gte=90).count(),
        'new_since_yesterday': matches.filter(created_at__gte=since_yesterday).count(),
        'total': matches.count(),
        'employability_delta_7d': get_employability_delta(profile, days_ago=7),
    }


def compute_companies_hiring_today(profile, limit: int = 5) -> list:
    """
    Entreprises suivies (Réseau & Contacts) ayant publié au moins une
    nouvelle offre aujourd'hui. Liste vide si aucune entreprise suivie
    ou aucune nouvelle offre — jamais une estimation.
    """
    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    tracked_companies = list(
        CompanyContact.objects.filter(user=profile).values_list('company_name', flat=True)
    )
    if not tracked_companies:
        return []

    names = (
        JobListing.objects.filter(company_name__in=tracked_companies, scraped_date__gte=today_start)
        .order_by().values_list('company_name', flat=True).distinct()[:limit]
    )
    return list(names)


def compute_profile_completeness(profile) -> dict:
    """
    Complétude réelle du profil, sur des critères vérifiables (pas un
    pourcentage arbitraire). Chaque critère pèse pour une part égale.
    """
    criteria = {
        'skills': bool(profile.extracted_skills),
        'target_roles': bool(profile.target_roles),
        'target_locations': bool(profile.target_locations),
        'documents': bool((profile.linkedin_text or '').strip() or (profile.cv_text or '').strip()),
        'salary_target': profile.target_salary_min is not None,
        'bio': bool((profile.bio or '').strip()),
    }
    completed = sum(criteria.values())
    total = len(criteria)
    missing = [key for key, done in criteria.items() if not done]

    return {
        'percentage': round(completed / total * 100),
        'completed': completed,
        'total': total,
        'missing': missing,
    }


CAREER_STAGES = [
    {'key': 'explorer', 'label': 'Explorer', 'description': "Vous découvrez le marché et construisez votre profil."},
    {'key': 'builder', 'label': 'Builder', 'description': "Votre profil est prêt. Il est temps de postuler."},
    {'key': 'candidate', 'label': 'Candidate', 'description': "Vous êtes en lice. Continuez à postuler et relancer."},
    {'key': 'professional', 'label': 'Professional', 'description': "Vous passez des entretiens. Vous êtes pris au sérieux."},
    {'key': 'expert', 'label': 'Expert', 'description': "Vous avez décroché une offre. Le marché vous valide."},
]


def compute_career_stage(profile) -> dict:
    """
    Étape de progression de carrière — déterminée par ce qui a
    réellement été accompli (compétences, candidatures, entretiens,
    offres), jamais par le temps écoulé depuis l'inscription.
    """
    matches = JobMatch.objects.filter(user=profile)
    has_offer = matches.filter(kanban_status='offre').exists()
    has_interview = matches.filter(kanban_status__in=['entretien', 'offre']).exists()
    has_applied = matches.filter(kanban_status__in=['postule', 'entretien', 'offre', 'refuse']).exists()
    profile_ready = bool(profile.extracted_skills) and profile.profile_complete

    if has_offer:
        stage_key = 'expert'
    elif has_interview:
        stage_key = 'professional'
    elif has_applied:
        stage_key = 'candidate'
    elif profile_ready:
        stage_key = 'builder'
    else:
        stage_key = 'explorer'

    stage_index = next(i for i, s in enumerate(CAREER_STAGES) if s['key'] == stage_key)
    return {
        'current': CAREER_STAGES[stage_index],
        'stage_index': stage_index,
        'all_stages': CAREER_STAGES,
    }
