"""
Ressources d'apprentissage réelles via l'API officielle YouTube Data
v3 (gratuite, quota journalier généreux pour ce volume d'usage).

Pas de scraping : YouTube protège activement son site contre ça, et
l'API officielle couvre exactement le besoin (recherche par mot-clé,
gratuite, avec clé API comme pour Gemini).
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"


def search_learning_resources(skill_name: str, max_results: int = 4) -> list:
    """
    Cherche des vidéos pédagogiques en français pour une compétence
    donnée. Renvoie une liste vide (sans exception) si la clé n'est
    pas configurée ou si l'appel échoue — l'absence de ressources
    n'empêche jamais d'afficher le reste de la roadmap.
    """
    api_key = getattr(settings, 'YOUTUBE_API_KEY', '')
    if not api_key:
        logger.info("YOUTUBE_API_KEY non configurée — ressources vidéo non disponibles.")
        return []

    params = {
        'part': 'snippet',
        'q': f"{skill_name} tutoriel français",
        'type': 'video',
        'maxResults': max_results,
        'relevanceLanguage': 'fr',
        'safeSearch': 'strict',
        'key': api_key,
    }

    try:
        response = requests.get(YOUTUBE_SEARCH_URL, params=params, timeout=8)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning(f"Recherche YouTube échouée pour '{skill_name}': {exc}")
        return []

    try:
        data = response.json()
    except ValueError:
        logger.warning(f"Réponse YouTube non-JSON pour '{skill_name}'.")
        return []

    resources = []
    for item in data.get('items', []):
        video_id = item.get('id', {}).get('videoId')
        snippet = item.get('snippet', {})
        if not video_id:
            continue
        resources.append({
            'title': snippet.get('title', ''),
            'channel': snippet.get('channelTitle', ''),
            'url': f"https://www.youtube.com/watch?v={video_id}",
            'thumbnail': snippet.get('thumbnails', {}).get('medium', {}).get('url', ''),
        })

    return resources
