"""
Contenu LinkedIn: analyse, reformulation et idées de posts,
propulsé par Gemini
"""
import json
import logging
import re
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

GEMINI_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Comme sur ATlaS : on retente plusieurs fois avant d'abandonner — Gemini
# a des pannes ponctuelles (503) qui se résolvent souvent en quelques secondes.
MAX_RETRIES = 3
RETRY_DELAYS = [1, 2, 4]  # secondes, backoff exponentiel


class ContentAIError(Exception):
    """Levée quand Gemini n'est pas configuré ou ne répond pas correctement
    après toutes les tentatives."""
    pass


def _call_gemini(prompt: str, expect_json: bool = False) -> str:
    api_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not api_key:
        raise ContentAIError(
            "GEMINI_API_KEY n'est pas configurée côté serveur (.env backend)."
        )

    model = getattr(settings, 'GEMINI_MODEL', 'gemini-2.5-flash')
    url = GEMINI_URL_TEMPLATE.format(model=model)

    body = {"contents": [{"parts": [{"text": prompt}]}]}
    if expect_json:
        body["generationConfig"] = {"response_mime_type": "application/json"}

    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post(
                url,
                headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                json=body,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            try:
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError):
                logger.error(f"Réponse Gemini inattendue: {data}")
                raise ContentAIError("Réponse inattendue du service IA.")

        except requests.RequestException as exc:
            last_error = exc
            is_last_attempt = attempt == MAX_RETRIES - 1
            logger.warning(
                f"Tentative {attempt + 1}/{MAX_RETRIES} échouée pour Gemini: {exc}"
                f"{' — abandon.' if is_last_attempt else ' — nouvelle tentative...'}"
            )
            if not is_last_attempt:
                time.sleep(RETRY_DELAYS[attempt])

    logger.error(f"Erreur appel Gemini après {MAX_RETRIES} tentatives: {last_error}")
    raise ContentAIError(
        f"Le service IA est temporairement indisponible après {MAX_RETRIES} tentatives. "
        "Réessayez dans quelques instants."
    )


def _parse_json_response(text: str) -> dict:
    """Gemini renvoie parfois le JSON entouré de ```json ... ``` malgré la consigne."""
    cleaned = re.sub(r'^```json\s*|\s*```$', '', text.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.error(f"JSON Gemini non parsable: {text[:300]}")
        raise ContentAIError("Le service IA a renvoyé une réponse mal formée.")


def analyze_post(content: str) -> dict:
    """
    Analyse un brouillon de post LinkedIn : score global + sous-scores
    (hook, lisibilité, impact) + suggestions concrètes.
    """
    if not content or not content.strip():
        raise ContentAIError("Le contenu est vide.")

    prompt = f"""Tu es un expert en contenu LinkedIn francophone. Analyse ce brouillon de post :

---
{content}
---

Réponds UNIQUEMENT avec un objet JSON valide (sans texte autour, sans ```), de cette forme exacte :
{{
  "score_global": <entier 0-100>,
  "hook": {{"score": <0-100>, "commentaire": "<une phrase>"}},
  "lisibilite": {{"score": <0-100>, "commentaire": "<une phrase>"}},
  "impact": {{"score": <0-100>, "commentaire": "<une phrase>"}},
  "suggestions": ["<suggestion concrète 1>", "<suggestion concrète 2>", "<suggestion concrète 3>"]
}}"""

    raw = _call_gemini(prompt, expect_json=True)
    return _parse_json_response(raw)


def reformulate(content: str, instruction: str = "rends ce texte plus percutant") -> str:
    """Reformule un passage selon une instruction (raccourcir, percuter, etc.)."""
    if not content or not content.strip():
        raise ContentAIError("Le contenu est vide.")

    prompt = (
        f"Réécris ce post LinkedIn en français pour {instruction}. "
        f"Garde le même message de fond, change uniquement la forme. "
        f"Réponds UNIQUEMENT avec le texte reformulé, sans aucun commentaire ni guillemets autour.\n\n"
        f"---\n{content}\n---"
    )
    return _call_gemini(prompt).strip()


def generate_post_ideas(profile, skill_gaps=None, tech_trends=None, kanban_summary=None) -> list:
    """
    Génère des idées de posts LinkedIn à partir de TOUTES les données
    disponibles sur le site : profil, compétences, lacunes détectées
    dans les offres ciblées, tendances tech GitHub, et activité de
    candidature — pas seulement le profil brut.
    """
    skills = list((profile.extracted_skills or {}).keys())[:8]
    roles = profile.target_roles or []
    gap_skills = [g['skill'] for g in (skill_gaps or [])[:5]]
    trend_languages = list({t['language'] for t in (tech_trends or []) if t.get('language')})[:5]

    context_lines = [
        f"- Compétences principales : {', '.join(skills) or 'non renseignées'}",
        f"- Postes ciblés : {', '.join(roles) or 'non renseignés'}",
    ]
    if gap_skills:
        context_lines.append(f"- Compétences à mettre en avant en cours d'acquisition : {', '.join(gap_skills)}")
    if trend_languages:
        context_lines.append(f"- Technologies en tendance actuellement (GitHub) : {', '.join(trend_languages)}")
    if kanban_summary:
        context_lines.append(f"- Activité de recherche d'emploi en cours : {kanban_summary}")

    prompt = f"""Tu es un expert en contenu LinkedIn francophone. Voici un profil complet :
{chr(10).join(context_lines)}

Propose 5 idées de posts LinkedIn pertinentes et variées pour cette personne, en français.
Varie les angles : partage d'apprentissage, opinion sur une tendance tech, retour d'expérience
de recherche d'emploi, conseil technique, story personnelle.

Réponds UNIQUEMENT avec un objet JSON valide (sans texte autour, sans ```), de cette forme exacte :
{{
  "idees": [
    {{"titre": "<titre court>", "angle": "<une phrase décrivant l'angle>", "type": "<technique|carrière|opinion|story>"}}
  ]
}}"""

    raw = _call_gemini(prompt, expect_json=True)
    parsed = _parse_json_response(raw)
    return parsed.get('idees', [])


def generate_learning_roadmap(profile, skill_gaps=None, tech_trends=None, objective=None) -> dict:
    """
    Construit une feuille de route d'apprentissage en phases, à partir :
    - des compétences déjà acquises (profil),
    - des lacunes les plus fréquentes dans les offres déjà collectées
      (calculées dans matching.py, pas une donnée externe nouvelle),
    - des tendances tech GitHub (langages qui montent),
    - d'un objectif explicite optionnel (poste cible, délai souhaité),
    pour prioriser quoi apprendre en tenant compte du marché réel.
    """
    known_skills = list((profile.extracted_skills or {}).keys())[:10]
    gap_skills = [g['skill'] for g in (skill_gaps or [])[:8]]
    trend_languages = list({t['language'] for t in (tech_trends or []) if t.get('language')})[:6]

    objective_line = ''
    if objective and objective.get('target_role'):
        parts = [f"Poste visé : {objective['target_role']}"]
        if objective.get('target_salary'):
            parts.append(f"salaire cible {objective['target_salary']} €")
        if objective.get('target_location'):
            parts.append(f"à {objective['target_location']}")
        if objective.get('timeframe_months'):
            parts.append(f"dans un délai souhaité de {objective['timeframe_months']} mois")
        objective_line = f"\nObjectif explicite : {', '.join(parts)}.\nAdapte le rythme et les priorités des phases à ce délai."

    prompt = f"""Tu es un conseiller en évolution de carrière tech, francophone.

Profil :
- Compétences déjà maîtrisées : {', '.join(known_skills) or 'non renseignées'}
- Compétences manquantes les plus demandées dans les offres ciblées par cette personne : {', '.join(gap_skills) or 'aucune lacune détectée pour le moment'}
- Technologies en forte tendance actuellement (GitHub Trending) : {', '.join(trend_languages) or 'non disponible'}{objective_line}

Construis une feuille de route d'apprentissage en 3 ou 4 phases progressives, qui comble les
lacunes en priorité tout en tenant compte des tendances du marché. Sois concret et réaliste
sur les durées.

Réponds UNIQUEMENT avec un objet JSON valide (sans texte autour, sans ```), de cette forme exacte :
{{
  "phases": [
    {{
      "titre": "<nom de la phase, ex: Fondations>",
      "duree_estimee": "<ex: 2-3 semaines>",
      "competences_visees": ["<compétence 1>", "<compétence 2>"],
      "description": "<2-3 phrases expliquant le contenu de cette phase et pourquoi>",
      "ressources_suggerees": ["<type de ressource ou suggestion concrète>"]
    }}
  ]
}}"""

    raw = _call_gemini(prompt, expect_json=True)
    return _parse_json_response(raw)


def generate_role_suggestions(profile, top_matched_titles=None, tracked_companies=None) -> list:
    """
    Suggère des postes (titres de poste) supplémentaires à cibler, en
    s'appuyant sur TOUTES les données disponibles : compétences du
    profil, postes déjà ciblés, titres des offres qui ont le mieux
    matché (signal réel de ce qui colle à son profil), et entreprises
    qu'elle suit activement dans son Kanban (signal d'intérêt réel,
    pas juste déclaré). Chaque suggestion est accompagnée d'une
    justification et d'un score de potentiel, pour qu'elle puisse
    choisir lesquelles ajouter à ses postes ciblés.
    """
    skills = list((profile.extracted_skills or {}).keys())[:12]
    current_roles = profile.target_roles or []
    matched_titles = (top_matched_titles or [])[:10]
    companies = (tracked_companies or [])[:8]

    context_lines = [
        f"- Compétences : {', '.join(skills) or 'non renseignées'}",
        f"- Postes déjà ciblés actuellement : {', '.join(current_roles) or 'aucun'}",
        f"- Années d'expérience : {profile.years_experience or 0}",
    ]
    if matched_titles:
        context_lines.append(
            f"- Intitulés des offres qui ont le mieux correspondu à son profil jusqu'ici : {', '.join(matched_titles)}"
        )
    if companies:
        context_lines.append(
            f"- Entreprises qu'elle suit activement (intéressée/a postulé) : {', '.join(companies)}"
        )

    prompt = f"""Tu es un conseiller en carrière tech francophone. Voici un profil complet :
{chr(10).join(context_lines)}

Propose 5 intitulés de postes ADDITIONNELS (différents de ceux déjà ciblés) que cette personne
pourrait envisager, en t'appuyant sur ses compétences réelles et les signaux d'intérêt observés
(offres qui ont bien matché, entreprises suivies). Sois concret : des intitulés de poste réels
du marché français, pas des catégories vagues.

Réponds UNIQUEMENT avec un objet JSON valide (sans texte autour, sans ```), de cette forme exacte :
{{
  "suggestions": [
    {{
      "poste": "<intitulé précis>",
      "potentiel": <entier 0-100>,
      "justification": "<1-2 phrases expliquant pourquoi ce poste correspond, basé sur les données ci-dessus>"
    }}
  ]
}}"""

    raw = _call_gemini(prompt, expect_json=True)
    parsed = _parse_json_response(raw)
    return parsed.get('suggestions', [])


def structure_profile_text(linkedin_text: str, cv_text: str) -> dict:
    """
    Structure le texte brut extrait du CV et/ou de l'export LinkedIn en
    sections exploitables (résumé, expériences, formations). Le résultat
    sert de base de travail : l'utilisateur peut ensuite l'éditer
    librement dans l'interface, ce qui n'affecte pas ce module.
    """
    combined = f"--- Export LinkedIn ---\n{linkedin_text}\n\n--- CV ---\n{cv_text}".strip()
    if not combined:
        raise ContentAIError("Aucun texte à structurer.")

    # Les documents sources peuvent être longs ; on borne la taille
    # envoyée au modèle pour rester dans une fenêtre de contexte
    # raisonnable et limiter le coût de l'appel.
    combined = combined[:12000]

    prompt = f"""Tu analyses un CV et/ou un profil LinkedIn en français. Voici le texte brut extrait
(la mise en page d'origine est perdue, fais de ton mieux pour identifier les sections) :

---
{combined}
---

Réponds UNIQUEMENT avec un objet JSON valide (sans texte autour, sans ```), de cette forme exacte :
{{
  "titre": "<intitulé de poste actuel ou recherché, ex: Développeuse Full-Stack>",
  "resume": "<résumé professionnel en 2-4 phrases, ou chaîne vide si rien d'identifiable>",
  "experiences": [
    {{
      "poste": "<intitulé>",
      "entreprise": "<nom>",
      "periode": "<ex: septembre 2025 - aujourd'hui>",
      "description": "<résumé des missions en 1-3 phrases>"
    }}
  ],
  "formations": [
    {{
      "diplome": "<ex: Master Ingénierie du développement logiciel>",
      "etablissement": "<nom de l'établissement>",
      "periode": "<ex: 2024 - 2026>"
    }}
  ]
}}

Si une section n'a aucune information identifiable dans le texte, renvoie un tableau vide pour
elle plutôt que d'inventer une entrée."""

    raw = _call_gemini(prompt, expect_json=True)
    return _parse_json_response(raw)


def generate_outreach_message(contact, message_type: str, job_context: str = '') -> str:
    """
    Rédige un message d'invitation, de relance ou un angle d'approche
    pour un contact saisi manuellement. Clutchr ne dispose d'aucune
    donnée de profil LinkedIn réelle au-delà de ce que l'utilisateur a
    lui-même renseigné (nom, poste, entreprise) — le message s'appuie
    uniquement sur ce contexte déclaré, jamais sur des informations
    devinées ou scrapées.
    """
    instructions = {
        'invitation': (
            "Rédige un message d'invitation LinkedIn court (sous 300 caractères, "
            "limite imposée par LinkedIn), professionnel mais chaleureux, qui donne "
            "une raison précise de se connecter."
        ),
        'relance': (
            "Rédige un message de relance poli et direct, qui rappelle le contact "
            "initial sans être insistant, et propose une prochaine étape concrète."
        ),
        'angle_approche': (
            "Propose un angle d'approche : 2-3 phrases expliquant la meilleure façon "
            "d'amorcer la conversation avec cette personne, en fonction de son rôle."
        ),
    }
    instruction = instructions.get(message_type, instructions['invitation'])

    context_lines = [
        f"- Nom du contact : {contact.name}",
        f"- Poste : {contact.role or 'non précisé'}",
        f"- Entreprise : {contact.company_name or 'non précisée'}",
    ]
    if job_context:
        context_lines.append(f"- Offre visée : {job_context}")

    prompt = f"""Tu rédiges un message professionnel en français pour LinkedIn.

Contexte :
{chr(10).join(context_lines)}

{instruction}

Réponds UNIQUEMENT avec le texte du message, sans aucun commentaire ni guillemets autour."""

    return _call_gemini(prompt).strip()


def generate_interview_prep(job_title: str, company_name: str, job_description: str) -> dict:
    """
    Prépare un entretien à partir du titre, de l'entreprise et de la
    description de l'offre — connaissance générale du modèle, pas une
    recherche en temps réel sur l'entreprise (Gemini n'a pas accès à
    des informations à jour ou vérifiées sur une entreprise précise,
    le contenu reste donc générique et orienté sur le poste).
    """
    description_excerpt = (job_description or '')[:3000]

    prompt = f"""Tu prépares un·e candidat·e à un entretien d'embauche en français.

Poste : {job_title}
Entreprise : {company_name}
Description de l'offre :
---
{description_excerpt}
---

Propose une préparation d'entretien concrète et actionnable.

Réponds UNIQUEMENT avec un objet JSON valide (sans texte autour, sans ```), de cette forme exacte :
{{
  "questions_frequentes": ["<question probable 1>", "<question probable 2>", "<question probable 3>"],
  "technologies_a_reviser": ["<techno ou concept à revoir avant l'entretien>"],
  "points_a_mettre_en_avant": ["<expérience ou compétence à valoriser pour ce poste précis>"],
  "questions_a_poser": ["<question pertinente à poser au recruteur>"]
}}"""

    raw = _call_gemini(prompt, expect_json=True)
    return _parse_json_response(raw)
