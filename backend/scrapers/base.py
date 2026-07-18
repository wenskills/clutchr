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
    source_name: str = 'unknown'

    @abstractmethod
    def search(self, query: str, location: str = '', results_limit: int = 20, page: int = 1,
               filters: dict = None) -> list[NormalizedJob]:
        raise NotImplementedError

    def is_configured(self) -> bool:
        """Indique si les identifiants nécessaires sont présents."""
        return True

NATIONWIDE_PLACEHOLDERS = {'france', 'partout', 'toute la france', 'national', 'télétravail', 'remote'}


def is_nationwide_placeholder(location: str) -> bool:
    """True si `location` ne désigne pas un lieu précis (ex: "France")."""
    return bool(location) and location.strip().lower() in NATIONWIDE_PLACEHOLDERS
