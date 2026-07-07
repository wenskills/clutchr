"""
Résolution nom de ville -> code commune INSEE, via l'API officielle
gratuite geo.api.gouv.fr (zéro authentification, zéro inscription).
"""
import logging

import requests

logger = logging.getLogger(__name__)

COMMUNES_URL = "https://geo.api.gouv.fr/communes"

# Cache mémoire simple (process-local) : pas besoin de re-résoudre la
# même ville à chaque appel dans un même cycle de scraping.
_commune_code_cache: dict = {}


def resolve_commune_code(city_name: str) -> str | None:
    """
    Renvoie le code INSEE de la commune la plus probable pour ce nom,
    ou None si introuvable/ambigu. Ne lève jamais d'exception côté
    appelant : une erreur réseau renvoie simplement None.
    """
    if not city_name or not city_name.strip():
        return None

    name = city_name.strip()

    # Si c'est déjà un code (4-5 chiffres), pas besoin de résoudre.
    if name.isdigit() and 4 <= len(name) <= 5:
        return name

    cache_key = name.lower()
    if cache_key in _commune_code_cache:
        return _commune_code_cache[cache_key]

    try:
        response = requests.get(
            COMMUNES_URL,
            params={'nom': name, 'boost': 'population', 'limit': 1, 'fields': 'code,nom'},
            timeout=5,
        )
        response.raise_for_status()
        results = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning(f"Résolution INSEE échouée pour '{name}': {exc}")
        return None

    code = results[0].get('code') if results else None
    _commune_code_cache[cache_key] = code
    return code
