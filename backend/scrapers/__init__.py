from .adzuna import AdzunaScraper
from .france_travail import FranceTravailScraper

# Registre des sources actives. Pour activer une nouvelle source plus tard,
# créez sa classe (héritant de BaseJobScraper) et ajoutez-la ici.
ACTIVE_SCRAPERS = [
    AdzunaScraper,
    FranceTravailScraper,
]

__all__ = ['AdzunaScraper', 'FranceTravailScraper', 'ACTIVE_SCRAPERS']
