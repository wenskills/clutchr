"""
Scraper GitHub Trending.
"""
import logging
import re
import time

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

TRENDING_URL = "https://github.com/trending"
USER_AGENT = "ClutchrTrendBot/1.0 (usage personnel, github.com/trending autorise par robots.txt)"


def fetch_trending_repos(language: str = '', since: str = 'daily', limit: int = 15) -> list:
    url = TRENDING_URL
    if language:
        url += f"/{language}"
    params = {"since": since}

    try:
        response = requests.get(
            url, params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=10
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.error(f"Erreur scraping GitHub Trending: {exc}")
        return []

    soup = BeautifulSoup(response.text, 'html.parser')
    articles = soup.select('article.Box-row')

    results = []
    for i, article in enumerate(articles[:limit]):
        try:
            results.append(_parse_repo_article(article, rank=i + 1, since=since))
        except Exception as exc:
            logger.warning(f"Repo GitHub Trending ignoré (parsing échoué): {exc}")
            continue

    return results


def _parse_repo_article(article, rank: int, since: str) -> dict:
    link = article.select_one('h2 a')
    href = (link.get('href') or '').strip('/') if link else ''
    owner, _, repo_name = href.partition('/')

    description_el = article.select_one('p')
    description = description_el.get_text(strip=True) if description_el else ''

    language_el = article.select_one('[itemprop="programmingLanguage"]')
    language = language_el.get_text(strip=True) if language_el else ''

    # "X stars today/this week/this month" — dernier <span> du bloc stats
    stars_period_el = article.select_one('span.d-inline-block.float-sm-right')
    stars_period_text = stars_period_el.get_text(strip=True) if stars_period_el else '0'
    stars_period = _parse_int(stars_period_text)

    stars_total_el = article.select_one('a[href$="/stargazers"]')
    stars_total_text = stars_total_el.get_text(strip=True) if stars_total_el else '0'
    stars_total = _parse_int(stars_total_text)

    return {
        'rank': rank,
        'owner': owner,
        'repo_name': repo_name,
        'full_name': href,
        'description': description,
        'language': language,
        'stars_total': stars_total,
        'stars_period': stars_period,
        'period': since,
        'url': f"https://github.com/{href}" if href else '',
    }


def _parse_int(text: str) -> int:
    digits = re.sub(r'[^\d]', '', text)
    return int(digits) if digits else 0


def polite_delay(seconds: float = 1.0):
    time.sleep(seconds)
