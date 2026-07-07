"""
Connecteur France Travail (ex Pôle Emploi) — API officielle française,
gratuite, en libre accès après inscription sur francetravail.io.

Contrairement à Adzuna (simple clé d'API), France Travail utilise OAuth2
(client_credentials) : il faut d'abord échanger client_id/client_secret
contre un jeton d'accès temporaire, puis l'utiliser en Bearer sur l'API
de recherche d'offres.

Le paramètre "lieu" de cette API attend un code commune INSEE, pas un
nom de ville libre — la résolution est faite automatiquement via
utils/geocoding.py (API gouv.fr, gratuite, sans clé).

Configuration requise (.env) :
    FRANCETRAVAIL_CLIENT_ID=...
    FRANCETRAVAIL_CLIENT_SECRET=...
Inscription gratuite : https://francetravail.io/inscription
"""
import logging
import re
import time

import requests
from django.conf import settings

from .base import BaseJobScraper, is_nationwide_placeholder
from utils.geocoding import resolve_commune_code

logger = logging.getLogger(__name__)


class FranceTravailScraper(BaseJobScraper):
    source_name = 'francetravail'

    TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire"
    SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search"
    SCOPE = "api_offresdemploiv2 o2dsoffre"

    def __init__(self):
        self.client_id = getattr(settings, 'FRANCETRAVAIL_CLIENT_ID', '')
        self.client_secret = getattr(settings, 'FRANCETRAVAIL_CLIENT_SECRET', '')
        self._access_token = None
        self._token_expires_at = 0
        self.last_total_count = 0

    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def _get_access_token(self):
        """Récupère un jeton OAuth2, en le mettant en cache jusqu'à expiration."""
        if self._access_token and time.time() < self._token_expires_at:
            return self._access_token

        try:
            response = requests.post(
                self.TOKEN_URL,
                data={
                    'grant_type': 'client_credentials',
                    'client_id': self.client_id,
                    'client_secret': self.client_secret,
                    'scope': self.SCOPE,
                },
                headers={'Content-Type': 'application/x-www-form-urlencoded'},
                timeout=10,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.error(f"Erreur authentification France Travail: {exc}")
            return None

        data = response.json()
        self._access_token = data.get('access_token')
        # 'expires_in' est en secondes ; marge de sécurité de 30s.
        self._token_expires_at = time.time() + max(data.get('expires_in', 1500) - 30, 60)
        return self._access_token

    def search(self, query: str, location: str = '', results_limit: int = 20, page: int = 1,
               filters: dict = None) -> list:
        if not self.is_configured():
            logger.warning(
                "France Travail non configuré (FRANCETRAVAIL_CLIENT_ID / "
                "FRANCETRAVAIL_CLIENT_SECRET manquants)."
            )
            return []

        token = self._get_access_token()
        if not token:
            return []

        # Pagination réelle via le paramètre 'range' (p-d). La doc Swagger
        # confirme p ≤ 3000 et d ≤ 3149 : on peut donc vraiment avancer
        # page après page, pas seulement lire les 50 premiers résultats
        # à chaque lancement.
        page_size = min(results_limit, 50)
        range_start = (page - 1) * page_size
        if range_start > 3000:
            return []
        range_end = min(range_start + page_size - 1, 3149)

        params = {'motsCles': query, 'sort': 1}  # 1 = date de création décroissante

        if location and not is_nationwide_placeholder(location):
            commune_code = resolve_commune_code(location)
            if commune_code:
                params['commune'] = commune_code
            else:
                logger.warning(
                    f"Impossible de résoudre '{location}' en code INSEE — "
                    "recherche France Travail élargie à toute la France pour cette requête."
                )

        # Seuls CDI et CDD sont confirmés par la documentation Swagger de
        # cette API (exemple officiel : typeContrat=CDI). Les codes pour
        # Alternance/Stage/Freelance ne sont pas documentés avec certitude
        # ailleurs dans la doc fournie — on préfère ne pas envoyer un code
        # deviné qui retournerait silencieusement zéro résultat, et on
        # laisse ces cas être couverts par les mots-clés de la requête.
        filters = filters or {}
        contract_type = filters.get('contract_type')
        if contract_type in ('cdi', 'cdd'):
            params['typeContrat'] = contract_type.upper()
        if filters.get('salary_min'):
            params['salaireMin'] = filters['salary_min']
            params['periodeSalaire'] = 'A'  # Annuel — requis par l'API dès que salaireMin est fourni

        params['range'] = f'{range_start}-{range_end}'

        try:
            response = requests.get(
                self.SEARCH_URL,
                params=params,
                headers={'Authorization': f'Bearer {token}'},
                timeout=10,
            )
            # 204 = aucun résultat (corps vide, ce n'est pas une erreur).
            if response.status_code == 204:
                return []
            # 206 = succès partiel (pagination), tout à fait normal ici.
            if response.status_code not in (200, 206):
                response.raise_for_status()
        except requests.RequestException as exc:
            logger.error(f"Erreur appel France Travail pour '{query}' / '{location}': {exc}")
            return []

        # Content-Range format: "offres p-d/t" — t = total réel disponible,
        # utile pour la transparence (même logique que pour Adzuna).
        content_range = response.headers.get('Content-Range', '')
        if '/' in content_range:
            try:
                self.last_total_count = int(content_range.rsplit('/', 1)[-1])
            except ValueError:
                self.last_total_count = 0
        else:
            self.last_total_count = 0

        try:
            data = response.json()
        except ValueError:
            logger.error(
                f"Réponse France Travail non-JSON. "
                f"Statut HTTP: {response.status_code} | "
                f"Corps (300 premiers caractères): {response.text[:300]!r}"
            )
            return []

        results = data.get('resultats', data.get('results', []))
        normalized = []
        for offre in results:
            try:
                normalized.append(self._normalize(offre))
            except Exception as exc:
                logger.warning(f"Offre France Travail ignorée (parsing échoué): {exc}")
                continue

        return normalized

    def _normalize(self, offre: dict):
        entreprise = offre.get('entreprise') or {}
        lieu = offre.get('lieuTravail') or {}
        origine = offre.get('origineOffre') or {}

        salary_min, salary_max = self._parse_salary(offre.get('salaire') or {})

        job_url = origine.get('urlOrigine') or (
            f"https://candidat.francetravail.fr/offres/recherche/detail/{offre.get('id', '')}"
        )

        # France Travail fournit des compétences structurées
        # (competences[].libelle) — bien plus fiable que de les redeviner
        # depuis le texte de la description avec notre extracteur générique.
        skills = [
            c.get('libelle', '').strip()
            for c in (offre.get('competences') or [])
            if c.get('libelle')
        ]

        return {
            'source': 'francetravail',
            'source_id': str(offre.get('id', '')),
            'title': offre.get('intitule', '').strip() or 'Poste sans titre',
            'company_name': entreprise.get('nom') or 'Entreprise non précisée',
            'location': lieu.get('libelle', ''),
            'remote_type': 'unknown',
            'description': offre.get('description', ''),
            'required_skills': skills,
            'salary_min': salary_min,
            'salary_max': salary_max,
            'currency': 'EUR',
            'job_url': job_url,
            'company_url': '',
            'posted_date': offre.get('dateCreation') or '',
        }

    @staticmethod
    def _parse_salary(salaire: dict):
        """
        Le salaire France Travail est un texte libre, ex:
        "Mensuel de 2200.00 Euros à 2500.00 Euros sur 12 mois".
        On tente d'extraire deux nombres ; sinon on renvoie (None, None)
        plutôt que d'inventer une valeur.
        """
        libelle = salaire.get('libelle', '') if salaire else ''
        if not libelle:
            return None, None

        numbers = re.findall(r'(\d+(?:[.,]\d+)?)', libelle)
        if not numbers:
            return None, None

        try:
            values = [float(n.replace(',', '.')) for n in numbers]
        except ValueError:
            return None, None

        # Mensuel -> on annualise grossièrement (x12) pour rester comparable
        # à Adzuna (qui donne des salaires annuels). Approximatif mais
        # documenté, pas caché.
        multiplier = 12 if 'mensuel' in libelle.lower() else 1

        if len(values) == 1:
            v = int(values[0] * multiplier)
            return v, v
        return int(min(values) * multiplier), int(max(values) * multiplier)
