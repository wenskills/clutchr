"""
Service de snapshots — fondation du tableau de bord décisionnel.

Toute métrique présentée comme une évolution dans le temps ("+4 cette
semaine", "Kubernetes +23%") doit reposer sur une valeur réellement
enregistrée à une date passée, jamais sur une estimation arbitraire.
Ce module calcule et persiste un point par jour et par utilisateur ;
la comparaison entre deux points devient alors un fait, pas une
supposition.

Idempotence : appeler plusieurs fois dans la même journée met juste à
jour le point du jour (update_or_create sur la date), ça n'en crée
jamais plusieurs.
"""
from django.db import models as django_models
from django.utils import timezone

from jobs.models import CareerPulseSnapshot, SkillTrendSnapshot, JobMatch, CompanyContact

# Poids de la pondération du Career Pulse. Toujours redistribués sur les
# composantes réellement calculables — jamais de composante comptée à 0
# faute de donnée (voir compute_career_pulse).
PULSE_WEIGHTS = {
    'employability': 0.30,   # qualité moyenne des correspondances
    'skills': 0.20,          # compétences détectées sur le profil
    'network': 0.20,         # avancement du pipeline de contacts
    'documents': 0.15,       # complétude du profil (CV/LinkedIn importés)
    'visibility': 0.15,      # présence de posts LinkedIn analysés
}

SKILLS_TARGET_COUNT = 15  # au-delà, le sous-score "compétences" est plein
NETWORK_TARGET_COUNT = 5  # contacts au-delà du statut "à contacter"


def _employability_score(profile) -> float | None:
    """Moyenne des scores de correspondance sur les offres déjà collectées."""
    matches = JobMatch.objects.filter(user=profile)
    if not matches.exists():
        return None
    total = matches.aggregate(avg=django_models.Avg('match_score'))['avg']
    return round(total, 1) if total is not None else None


def _skills_score(profile) -> float:
    count = len(profile.extracted_skills or {})
    return round(min(count / SKILLS_TARGET_COUNT, 1.0) * 100, 1)


def _network_score(profile) -> float | None:
    active = CompanyContact.objects.filter(user=profile).exclude(status='a_contacter').count()
    if CompanyContact.objects.filter(user=profile).count() == 0:
        return None
    return round(min(active / NETWORK_TARGET_COUNT, 1.0) * 100, 1)


def _documents_score(profile) -> float:
    has_linkedin = bool((profile.linkedin_text or '').strip())
    has_cv = bool((profile.cv_text or '').strip())
    if has_linkedin and has_cv:
        return 100.0
    if has_linkedin or has_cv:
        return 50.0
    return 0.0


def _visibility_score(profile) -> float | None:
    """
    Réservé au module Contenu LinkedIn une fois l'historique des posts
    analysés mis en place (non disponible aujourd'hui : les analyses ne
    sont pas encore sauvegardées). Renvoie None tant que la donnée
    n'existe pas, plutôt qu'un chiffre arbitraire.
    """
    return None


def compute_career_pulse(profile) -> dict:
    """
    Calcule le Career Pulse et son détail par composante. Une composante
    sans donnée suffisante est retirée du calcul et son poids redistribué
    sur les composantes disponibles — jamais comptée comme 0.
    """
    raw_scores = {
        'employability': _employability_score(profile),
        'skills': _skills_score(profile),
        'network': _network_score(profile),
        'documents': _documents_score(profile),
        'visibility': _visibility_score(profile),
    }

    available = {k: v for k, v in raw_scores.items() if v is not None}
    if not available:
        return {'pulse_score': None, 'breakdown': raw_scores}

    total_weight = sum(PULSE_WEIGHTS[k] for k in available)
    pulse_score = sum(v * PULSE_WEIGHTS[k] for k, v in available.items()) / total_weight

    return {'pulse_score': round(pulse_score, 1), 'breakdown': raw_scores}


def capture_pulse_snapshot(profile) -> CareerPulseSnapshot:
    """Calcule et enregistre (ou met à jour) le point du jour."""
    result = compute_career_pulse(profile)
    breakdown = result['breakdown']

    snapshot, _ = CareerPulseSnapshot.objects.update_or_create(
        user=profile,
        captured_at=timezone.now().date(),
        defaults={
            'pulse_score': result['pulse_score'],
            'employability_score': breakdown['employability'],
            'skills_score': breakdown['skills'],
            'network_score': breakdown['network'],
            'documents_score': breakdown['documents'],
            'visibility_score': breakdown['visibility'],
            'matches_count': JobMatch.objects.filter(user=profile).count(),
            'skills_count': len(profile.extracted_skills or {}),
        }
    )
    return snapshot


def capture_skill_trend_snapshots(profile, limit: int = 20) -> int:
    """
    Enregistre la présence (%) des compétences les plus fréquentes dans
    les offres déjà collectées du profil, pour ce jour. Renvoie le
    nombre de lignes écrites.
    """
    matches = JobMatch.objects.filter(user=profile).select_related('job')
    total = matches.count()
    if total == 0:
        return 0

    counts: dict = {}
    for match in matches:
        for skill in (match.job.required_skills or []):
            counts[skill] = counts.get(skill, 0) + 1

    ranked = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    today = timezone.now().date()

    for skill, count in ranked:
        share = round(count / total * 100, 1)
        SkillTrendSnapshot.objects.update_or_create(
            user=profile,
            skill=skill,
            captured_at=today,
            defaults={'share': share, 'count': count},
        )

    return len(ranked)


def get_pulse_history(profile, days: int = 30) -> list:
    """Historique des N derniers jours, le plus ancien en premier."""
    cutoff = timezone.now().date() - timezone.timedelta(days=days)
    snapshots = (
        CareerPulseSnapshot.objects.filter(user=profile, captured_at__gte=cutoff)
        .order_by('captured_at')
    )
    return [
        {
            'date': s.captured_at.isoformat(),
            'pulse_score': s.pulse_score,
        }
        for s in snapshots
    ]


def get_pulse_delta(profile, days_ago: int = 7) -> float | None:
    """
    Différence entre le Career Pulse d'aujourd'hui et celui d'il y a
    `days_ago` jours. Renvoie None si on n'a pas encore de point assez
    ancien pour comparer honnêtement (plutôt que de comparer à zéro).
    """
    today_snapshot = CareerPulseSnapshot.objects.filter(
        user=profile, captured_at=timezone.now().date()
    ).first()
    if not today_snapshot or today_snapshot.pulse_score is None:
        return None

    target_date = timezone.now().date() - timezone.timedelta(days=days_ago)
    past_snapshot = (
        CareerPulseSnapshot.objects.filter(user=profile, captured_at__lte=target_date)
        .order_by('-captured_at')
        .first()
    )
    if not past_snapshot or past_snapshot.pulse_score is None:
        return None

    return round(today_snapshot.pulse_score - past_snapshot.pulse_score, 1)


def get_employability_delta(profile, days_ago: int = 7) -> float | None:
    """
    Différence du score d'employabilité (qualité moyenne des
    correspondances) entre aujourd'hui et il y a `days_ago` jours.
    Même logique de garde que get_pulse_delta : pas de point assez
    ancien -> None, jamais une comparaison à zéro.
    """
    today_snapshot = CareerPulseSnapshot.objects.filter(
        user=profile, captured_at=timezone.now().date()
    ).first()
    if not today_snapshot or today_snapshot.employability_score is None:
        return None

    target_date = timezone.now().date() - timezone.timedelta(days=days_ago)
    past_snapshot = (
        CareerPulseSnapshot.objects.filter(user=profile, captured_at__lte=target_date)
        .order_by('-captured_at')
        .first()
    )
    if not past_snapshot or past_snapshot.employability_score is None:
        return None

    return round(today_snapshot.employability_score - past_snapshot.employability_score, 1)


def get_skill_trend_deltas(profile, days_ago: int = 30, limit: int = 10) -> list:
    """
    Compétences dont la présence (%) a le plus évolué sur la période,
    calculée à partir de deux points réellement enregistrés. Une
    compétence sans point assez ancien pour comparer est exclue plutôt
    que de lui attribuer une évolution inventée.
    """
    today = timezone.now().date()
    target_date = today - timezone.timedelta(days=days_ago)

    current = {
        s.skill: s.share
        for s in SkillTrendSnapshot.objects.filter(user=profile, captured_at=today)
    }
    if not current:
        return []

    past = {}
    for skill in current:
        snapshot = (
            SkillTrendSnapshot.objects.filter(user=profile, skill=skill, captured_at__lte=target_date)
            .order_by('-captured_at')
            .first()
        )
        if snapshot:
            past[skill] = snapshot.share

    deltas = [
        {'skill': skill, 'current_share': current[skill], 'previous_share': past[skill],
         'delta': round(current[skill] - past[skill], 1)}
        for skill in current if skill in past
    ]
    deltas.sort(key=lambda d: abs(d['delta']), reverse=True)
    return deltas[:limit]


def pulse_state_label(delta_7d) -> dict:
    """
    Traduit le delta de Pulse en état qualitatif, pour afficher
    "Stable" / "En accélération" plutôt qu'un simple pourcentage brut.
    Reste honnête : si l'historique est insuffisant (delta_7d=None),
    l'état l'indique clairement plutôt que d'inventer une tendance.
    """
    if delta_7d is None:
        return {'state': 'demarrage', 'label': 'Démarrage'}
    if delta_7d > 2:
        return {'state': 'acceleration', 'label': 'En accélération'}
    if delta_7d < -2:
        return {'state': 'ralentissement', 'label': 'En ralentissement'}
    return {'state': 'stable', 'label': 'Stable'}
