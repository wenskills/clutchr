"""
Momentum — la vitesse à laquelle la carrière avance, distincte du
Career Pulse (qui mesure l'état du profil et son adéquation au
marché, pas l'activité récente).

Aucun des axes actuels du Pulse (employabilité, compétences, réseau,
documents, visibilité) ne répond directement à "j'ai postulé
aujourd'hui" ou "j'ai contacté un recruteur" — ce sont des mesures de
qualité de profil, pas d'activité. Plutôt que d'inventer un faux delta
de Pulse pour ces actions, Momentum les mesure honnêtement, à part.

Calculé uniquement à partir d'événements réels horodatés. Pas de
points fabriqués, pas de combo, pas de série à entretenir par culpabilité.
"""
from datetime import timedelta

from django.utils import timezone

from jobs.models import (
    JobMatchStatusEvent, CompanyContact, Contact, DailyActionCompletion, LinkedInPost,
)

WINDOW_DAYS = 7
PIPELINE_PROGRESS_STATUSES = ('interesse', 'postule', 'entretien', 'offre')


def compute_momentum(profile, days: int = WINDOW_DAYS) -> dict:
    window_start = timezone.now() - timedelta(days=days)

    weighted_score = 0
    active_dates = set()

    for e in JobMatchStatusEvent.objects.filter(match__user=profile, occurred_at__gte=window_start):
        active_dates.add(e.occurred_at.date())
        weighted_score += 3 if e.to_status in PIPELINE_PROGRESS_STATUSES else 1

    for c in CompanyContact.objects.filter(user=profile, updated_at__gte=window_start):
        active_dates.add(c.updated_at.date())
        weighted_score += 2

    for p in Contact.objects.filter(user=profile, updated_at__gte=window_start):
        active_dates.add(p.updated_at.date())
        weighted_score += 2

    for d in DailyActionCompletion.objects.filter(user=profile, completed_at__gte=window_start):
        active_dates.add(d.completed_at.date())
        weighted_score += 2

    for post in LinkedInPost.objects.filter(user=profile, updated_at__gte=window_start):
        active_dates.add(post.updated_at.date())
        weighted_score += 2

    score = min(100, weighted_score * 2)
    days_active = len(active_dates)

    if days_active == 0:
        state, label = 'inactif', "Pas d'activité récente"
    elif score < 25:
        state, label = 'ralenti', 'Élan ralenti'
    elif score < 60:
        state, label = 'stable', 'Élan stable'
    else:
        state, label = 'acceleration', 'En accélération'

    return {
        'score': score,
        'state': state,
        'label': label,
        'active_days_last_7': days_active,
    }
