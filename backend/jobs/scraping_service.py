"""
Orchestration : interroge les sources actives pour le profil donné,
enregistre les offres, calcule les correspondances.

Conçu pour être appelé soit directement depuis une vue DRF (test immédiat,
sans Celery/Redis), soit plus tard depuis une tâche Celery planifiée
(jobs/tasks.py) sans aucun changement de cette fonction.
"""
import logging

from django.utils.dateparse import parse_datetime
from django.utils import timezone

from scrapers import ACTIVE_SCRAPERS
from jobs.models import JobListing, JobMatch, ScrapeCursor
from jobs.matching import extract_job_skills, compute_match

logger = logging.getLogger(__name__)

# Budget d'appels API HTTP par lancement (toutes pages/combinaisons
# confondues). Quota gratuit Adzuna confirmé : 25/min, 250/jour, 1000/semaine,
# 2500/mois. À 20 appels par lancement, on reste très confortable même avec
# plusieurs lancements automatiques par jour (voir management command
# `run_scraping` + crontab pour la planification).
MAX_API_CALLS_PER_RUN = 20
RESULTS_PER_PAGE = 50
MAX_PAGES_PER_QUERY = 2  # jusqu'à 100 offres par combinaison poste x lieu, par lancement


def _seniority_keyword(years_experience: int) -> str:
    """Ajoute un mot-clé de niveau à la requête pour affiner les résultats
    renvoyés par la source elle-même (pas seulement le score local)."""
    if years_experience is None:
        return ''
    if years_experience <= 1:
        return ' junior'
    if years_experience >= 6:
        return ' senior'
    return ''  # niveau "confirmé" : pas de mot-clé fiable, on laisse neutre


def run_scrape_for_profile(profile) -> dict:
    """
    Lance une recherche d'offres pour un UserProfile en couvrant TOUS ses
    postes et lieux ciblés (dans la limite du budget d'appels API), avec
    pagination, puis (re)calcule les JobMatch correspondants.

    Chaque source garde en mémoire (ScrapeCursor) la page où elle s'est
    arrêtée la dernière fois : un nouveau lancement avance dans les
    résultats au lieu de toujours redemander les mêmes premiers — sauf
    si la source a été entièrement épuisée, auquel cas on recommence à
    la page 1 (pour capter les nouvelles offres publiées depuis).

    Renvoie un résumé incluant `total_available_on_source` : le nombre
    RÉEL d'offres que la source a pour ces recherches (toutes pages
    confondues), pour que l'écart avec ce qu'on importe soit transparent
    plutôt que silencieux.
    """
    summary = {
        'configured': False,
        'new_jobs': 0,
        'updated_jobs': 0,
        'matches_created': 0,
        'matches_updated': 0,
        'sources_used': [],
        'queries_run': 0,
        'total_available_on_source': 0,
        'queries_detail': [],  # [{query, location, total_found, fetched, page_start}]
        'rate_limited': False,
    }

    roles = profile.target_roles or ['développeur']
    locations = profile.target_locations or ['']
    seniority = _seniority_keyword(profile.years_experience)

    profile_filters = {
        'contract_type': profile.contract_type or None,
        'salary_min': profile.target_salary_min,
        'salary_max': profile.target_salary_max,
    }

    query_pairs = [(role, loc) for role in roles for loc in locations]

    touched_job_ids = []
    configured_scrapers = []

    for scraper_cls in ACTIVE_SCRAPERS:
        scraper = scraper_cls()
        if scraper.is_configured():
            configured_scrapers.append(scraper)

    if not configured_scrapers:
        return summary

    summary['configured'] = True
    # Budget réparti équitablement entre sources actives, pour qu'une
    # source listée en premier (Adzuna) ne consomme pas tout le quota
    # avant qu'une autre (France Travail) ait pu être interrogée.
    budget_per_scraper = max(MAX_API_CALLS_PER_RUN // len(configured_scrapers), 1)

    for scraper in configured_scrapers:
        if summary['rate_limited']:
            break
        summary['sources_used'].append(scraper.source_name)
        calls_used = 0

        for role, location in query_pairs:
            if calls_used >= budget_per_scraper or summary['rate_limited']:
                break

            # Curseur PAR COMBINAISON poste+lieu, pas partagé entre toutes
            # les requêtes : avec des recherches de niche (peu de résultats
            # par combinaison), une seule combinaison épuisée ne doit pas
            # remettre à zéro le curseur des autres combinaisons.
            query_key = f"{role}|{location}".lower().strip()
            cursor, _ = ScrapeCursor.objects.get_or_create(
                user=profile, source=scraper.source_name, query_key=query_key,
                defaults={'next_page': 1}
            )
            start_page = cursor.next_page
            exhausted_for_combo = False

            query = f"{role}{seniority}".strip()
            fetched_for_combo = 0
            total_found_for_combo = 0

            for page in range(start_page, start_page + MAX_PAGES_PER_QUERY):
                if calls_used >= budget_per_scraper:
                    break

                normalized_jobs = scraper.search(
                    query, location, results_limit=RESULTS_PER_PAGE, page=page,
                    filters=profile_filters,
                )
                calls_used += 1
                summary['queries_run'] += 1

                if getattr(scraper, 'rate_limited', False):
                    summary['rate_limited'] = True
                    break

                total_found_for_combo = getattr(scraper, 'last_total_count', 0)

                if not normalized_jobs:
                    exhausted_for_combo = True
                    break  # plus rien à cette page, inutile de continuer à paginer

                for nj in normalized_jobs:
                    if not nj.get('source_id') or not nj.get('job_url'):
                        continue

                    # Si la source fournit déjà des compétences structurées
                    # (France Travail), on les garde — sinon on retombe sur
                    # l'extraction générique depuis la description (Adzuna).
                    provided_skills = nj.get('required_skills') or []
                    required_skills = provided_skills if provided_skills else extract_job_skills(nj.get('description', ''))
                    posted_date = parse_datetime(nj.get('posted_date', '')) or timezone.now()

                    defaults = {
                        'title': nj['title'],
                        'company_name': nj['company_name'],
                        'location': nj['location'],
                        'remote_type': nj['remote_type'],
                        'description': nj['description'],
                        'required_skills': required_skills,
                        'salary_min': nj.get('salary_min'),
                        'salary_max': nj.get('salary_max'),
                        'currency': nj.get('currency', 'EUR'),
                        'job_url': nj['job_url'],
                        'company_url': nj.get('company_url', ''),
                        'posted_date': posted_date,
                        'is_active': True,
                    }

                    job, created = JobListing.objects.update_or_create(
                        source=nj['source'],
                        source_id=nj['source_id'],
                        defaults=defaults,
                    )
                    touched_job_ids.append(job.id)
                    fetched_for_combo += 1

                    if created:
                        summary['new_jobs'] += 1
                    else:
                        summary['updated_jobs'] += 1

                # Si cette page a renvoyé moins que le plafond, il n'y a pas de page suivante.
                if len(normalized_jobs) < RESULTS_PER_PAGE:
                    exhausted_for_combo = True
                    break

            summary['total_available_on_source'] += total_found_for_combo
            summary['queries_detail'].append({
                'query': query,
                'location': location or '(toute la France)',
                'total_found': total_found_for_combo,
                'fetched': fetched_for_combo,
                'page_start': start_page,
            })

            # Avance le curseur de CETTE combinaison, ou repart à la page 1
            # si elle est épuisée (le tri par date côté API fera apparaître
            # les offres les plus récentes à la prochaine visite de la page 1).
            cursor.next_page = 1 if exhausted_for_combo else start_page + MAX_PAGES_PER_QUERY
            cursor.save()

    # Calcule / met à jour les correspondances pour les offres touchées
    from jobs.models import Notification

    for job in JobListing.objects.filter(id__in=set(touched_job_ids)):
        result = compute_match(profile, job)
        match, match_created = JobMatch.objects.update_or_create(
            user=profile,
            job=job,
            defaults=result,
        )
        if match_created:
            summary['matches_created'] += 1
            if match.match_score >= 90 and profile.notify_new_matches:
                Notification.objects.create(
                    user=profile,
                    notification_type='new_excellent_match',
                    title=f"Nouvelle offre à {match.match_score:.0f}% de correspondance",
                    message=f"{job.title} chez {job.company_name}",
                    route='/offres',
                )
        else:
            summary['matches_updated'] += 1

    # Capture le point du jour pour le Career Pulse et les tendances de
    # compétences — idempotent, alimente l'historique même si l'utilisateur
    # ne consulte pas le tableau de bord (utile avec le scraping planifié).
    from jobs.snapshots import capture_pulse_snapshot, capture_skill_trend_snapshots
    capture_pulse_snapshot(profile)
    capture_skill_trend_snapshots(profile)

    return summary
