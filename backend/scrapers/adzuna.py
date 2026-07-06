"""
Connecteur Adzuna — source d'offres réellement fonctionnelle (API publique
gratuite, couverture France incluse).

Indeed (API de recherche dépréciée, accès partenaire ATS uniquement) et
Glassdoor (aucune API publique, anti-bot agressif) ne sont PAS viables
pour ce cas d'usage en l'état — voir notes dans scrapers/base.py.
Adzuna sert de source par défaut tant qu'une autre intégration partenaire
n'est pas disponible.

Configuration requise (.env) :
    ADZUNA_APP_ID=...
    ADZUNA_APP_KEY=...
Inscription gratuite : https://developer.adzuna.com/
"""
import logging
from datetime import datetime, timezone

import requests
from django.conf import settings

from .base import BaseJobScraper, NormalizedJob, is_nationwide_placeholder

logger = logging.getLogger(__name__)


class AdzunaScraper(BaseJobScraper):
    source_name = 'adzuna'

    BASE_URL = 'https://api.adzuna.com/v1/api/jobs'
    MAX_RESULTS_PER_PAGE = 50  # plafond réel de l'API Adzuna

    def __init__(self):
        self.app_id = getattr(settings, 'ADZUNA_APP_ID', '')
        self.app_key = getattr(settings, 'ADZUNA_APP_KEY', '')
        self.country = getattr(settings, 'ADZUNA_COUNTRY', 'fr')
        # Renseigné après chaque appel à search() : nombre TOTAL de résultats
        # qu'Adzuna a pour cette requête (toutes pages confondues), pas
        # seulement ceux renvoyés dans cet appel.
        self.last_total_count = 0
        self.rate_limited = False

    def is_configured(self) -> bool:
        return bool(self.app_id and self.app_key)

    # Adzuna ne distingue pas Alternance/Stage/Freelance — seulement
    # CDI ("permanent") et CDD ("contract"). Les autres valeurs de
    # contract_type sont ignorées ici plutôt que mappées à un paramètre
    # incorrect.
    ADZUNA_CONTRACT_MAP = {'cdi': 'permanent', 'cdd': 'contract'}

    def search(self, query: str, location: str = '', results_limit: int = 50, page: int = 1,
               filters: dict = None) -> list:
        if not self.is_configured():
            logger.warning("Adzuna non configuré (ADZUNA_APP_ID / ADZUNA_APP_KEY manquants).")
            return []

        params = {
            'app_id': self.app_id,
            'app_key': self.app_key,
            'what': query,
            'results_per_page': min(results_limit, self.MAX_RESULTS_PER_PAGE),
            'content-type': 'application/json',
            # Sans ce paramètre, Adzuna trie par pertinence par défaut —
            # revisiter la page 1 après épuisement du curseur montrerait
            # alors toujours le même classement, jamais les offres les
            # plus récentes (même correctif que sort=1 pour France Travail).
            'sort_by': 'date',
        }
        # "France", "Partout", etc. veulent dire "pas de lieu précis" —
        # les passer tels quels à Adzuna restreint inutilement la recherche
        # (même correctif que pour France Travail).
        if location and not is_nationwide_placeholder(location):
            params['where'] = location

        filters = filters or {}
        contract_type = filters.get('contract_type')
        if contract_type and contract_type in self.ADZUNA_CONTRACT_MAP:
            params[self.ADZUNA_CONTRACT_MAP[contract_type]] = 1
        if filters.get('salary_min'):
            params['salary_min'] = filters['salary_min']
        if filters.get('salary_max'):
            params['salary_max'] = filters['salary_max']

        url = f"{self.BASE_URL}/{self.country}/search/{page}"

        try:
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 429:
                logger.warning(
                    f"Quota Adzuna atteint (429) pour '{query}' / '{location}' (page {page}). "
                    "Arrêt de cette recherche, les autres lancements reprendront plus tard."
                )
                self.rate_limited = True
                return []
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.error(f"Erreur appel Adzuna pour '{query}' / '{location}' (page {page}): {exc}")
            return []

        try:
            data = response.json()
        except ValueError:
            logger.error("Réponse Adzuna non-JSON.")
            return []

        self.last_total_count = data.get('count', 0)

        results = data.get('results', [])
        normalized = []
        for job in results:
            try:
                normalized.append(self._normalize(job))
            except Exception as exc:  # défensif : un job malformé ne doit pas tout casser
                logger.warning(f"Job Adzuna ignoré (parsing échoué): {exc}")
                continue

        return normalized

    def _normalize(self, job: dict) -> NormalizedJob:
        company = job.get('company') or {}
        location = job.get('location') or {}
        category = job.get('category') or {}

        created = job.get('created')
        try:
            posted_date = (
                datetime.fromisoformat(created.replace('Z', '+00:00')).isoformat()
                if created else datetime.now(timezone.utc).isoformat()
            )
        except ValueError:
            posted_date = datetime.now(timezone.utc).isoformat()

        contract_time = (job.get('contract_time') or '').lower()
        remote_type = 'remote' if 'remote' in (job.get('title', '') + job.get('description', '')).lower() else 'unknown'

        return {
            'source': 'adzuna',
            'source_id': str(job.get('id', '')),
            'title': job.get('title', '').strip() or 'Poste sans titre',
            'company_name': company.get('display_name', 'Entreprise non précisée'),
            'location': location.get('display_name', ''),
            'remote_type': remote_type,
            'description': job.get('description', ''),
            'required_skills': [],  # extrait ensuite via SkillExtractor sur la description
            'salary_min': int(job['salary_min']) if job.get('salary_min') else None,
            'salary_max': int(job['salary_max']) if job.get('salary_max') else None,
            'currency': 'EUR',
            'job_url': job.get('redirect_url', ''),
            'company_url': '',
            'posted_date': posted_date,
        }
