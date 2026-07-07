"""
Interface commune à toutes les sources d'offres d'emploi.
"""
from abc import ABC, abstractmethod
from typing import TypedDict, Optional


class NormalizedJob(TypedDict):
    source: str
    source_id: str
    title: str
    company_name: str
    location: str
    remote_type: str
    description: str
    required_skills: list
    salary_min: Optional[int]
    salary_max: Optional[int]
    currency: str
    job_url: str
    company_url: str
    posted_date: str  # ISO 8601


class BaseJobScraper(ABC):
    """Toute source d'offres doit exposer cette méthode unique."""

    source_name: str = 'unknown'

    @abstractmethod
    def search(self, query: str, location: str = '', results_limit: int = 20, page: int = 1,
               filters: dict = None) -> list[NormalizedJob]:
        """
        Cherche des offres et renvoie une liste de dicts normalisés
        (forme NormalizedJob), prêts à être insérés via JobListing.
        `page` permet de paginer au-delà des premiers résultats.

        `filters` est un dict optionnel à clés communes entre sources
        (ex: {'contract_type': 'cdi', 'salary_min': 35000}). Chaque
        implémentation applique ce qu'elle supporte réellement et
        ignore silencieusement le reste (jamais d'exception pour une
        clé non supportée) — voir adzuna.py / france_travail.py pour le
        détail de ce qui est mappé.

        Ne doit jamais lever d'exception pour une erreur réseau/API :
        logguer et renvoyer une liste vide pour ne pas casser l'appelant.
        """
        raise NotImplementedError

    def is_configured(self) -> bool:
        """Indique si les identifiants nécessaires sont présents."""
        return True


# Valeurs de "lieu" qui signifient en réalité "pas de lieu précis" (toute
# la France, télétravail...). Partagé entre tous les scrapers pour éviter
# que deux listes divergent silencieusement au fil des modifications.
NATIONWIDE_PLACEHOLDERS = {'france', 'partout', 'toute la france', 'national', 'télétravail', 'remote'}


def is_nationwide_placeholder(location: str) -> bool:
    """True si `location` ne désigne pas un lieu précis (ex: "France")."""
    return bool(location) and location.strip().lower() in NATIONWIDE_PLACEHOLDERS
