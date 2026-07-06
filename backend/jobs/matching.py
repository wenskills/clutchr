"""
Moteur de correspondance profil <-> offre.

Principe : on ne note QUE ce qu'on peut réellement évaluer avec les
données disponibles. S'il manque une info (salaire, expérience requise,
compétences détectables dans la description), on ne fabrique pas un
score à 0 par défaut — on retire cette composante et on redistribue
son poids entre les critères qu'on peut effectivement mesurer.
"""
import re

from utils.skill_extractor import SkillExtractor

_extractor = SkillExtractor()

# Poids "idéaux" quand toutes les données sont disponibles.
WEIGHT_SKILL = 0.45
WEIGHT_LOCATION = 0.15
WEIGHT_EXPERIENCE = 0.20
WEIGHT_SALARY = 0.20

# Motifs de détection du niveau d'expérience dans une description d'offre
_EXPERIENCE_YEARS_PATTERN = re.compile(
    r"(\d{1,2})\s*(?:\+\s*)?(?:ans?|années?)\s+d['e]\s*exp[eé]rience", re.IGNORECASE
)
_EXPERIENCE_RANGE_PATTERN = re.compile(
    r"(\d{1,2})\s*[-àa]\s*(\d{1,2})\s*(?:ans?|années?)\s+d['e]\s*exp[eé]rience", re.IGNORECASE
)
_SENIORITY_KEYWORDS = {
    'junior': (0, 2),
    'débutant': (0, 1),
    'debutant': (0, 1),
    'confirmé': (3, 5),
    'confirme': (3, 5),
    'senior': (5, 99),
    'expert': (7, 99),
    'lead': (6, 99),
}


def extract_job_skills(description: str) -> list:
    """Extrait les compétences mentionnées dans une description d'offre."""
    found = _extractor.extract_from_text(description or '')
    return sorted(found.keys())


def extract_required_experience(description: str):
    """
    Tente d'estimer la fourchette d'années d'expérience demandée par
    l'offre, à partir de motifs textuels courants en français.
    Renvoie (min_years, max_years) ou None si rien n'a pu être détecté
    (dans ce cas, le critère expérience est simplement exclu du score,
    pas pénalisé).
    """
    if not description:
        return None

    text = description.lower()

    range_match = _EXPERIENCE_RANGE_PATTERN.search(text)
    if range_match:
        lo, hi = int(range_match.group(1)), int(range_match.group(2))
        return (min(lo, hi), max(lo, hi))

    years_match = _EXPERIENCE_YEARS_PATTERN.search(text)
    if years_match:
        years = int(years_match.group(1))
        return (years, years + 2)

    for keyword, bracket in _SENIORITY_KEYWORDS.items():
        if keyword in text:
            return bracket

    return None


def compute_skill_match(user_skills: dict, job_required_skills: list):
    """
    Compare les compétences du profil aux compétences détectées dans
    l'offre. Si l'extraction n'a rien trouvé dans la description (ça
    arrive : descriptions courtes, formulations non standard...), le
    critère est marqué "non évaluable" plutôt que noté 0 — une offre
    pertinente ne doit pas être punie simplement parce que sa
    description ne contient pas un mot-clé de notre liste.
    """
    job_skills_set = {s.lower() for s in job_required_skills}
    user_skills_set = {s.lower(): s for s in user_skills.keys()}

    if not job_skills_set:
        return {'score': None, 'matched': {}, 'gaps': {}, 'evaluable': False}

    matched = {}
    gaps = {}
    for skill_lower in job_skills_set:
        if skill_lower in user_skills_set:
            matched[user_skills_set[skill_lower]] = True
        else:
            original = next((s for s in job_required_skills if s.lower() == skill_lower), skill_lower)
            gaps[original] = False

    score = (len(matched) / len(job_skills_set)) * 100
    return {'score': round(score, 1), 'matched': matched, 'gaps': gaps, 'evaluable': True}


def compute_location_fit(target_locations: list, job_location: str, remote_type: str) -> str:
    """Renvoie 'remote' | 'match' | 'partial' | 'unknown'."""
    if remote_type == 'remote':
        return 'remote'
    if not target_locations or not job_location:
        return 'unknown'

    job_location_lower = job_location.lower()
    for loc in target_locations:
        loc_lower = loc.lower().strip()
        if loc_lower in ('télétravail', 'remote', 'distanciel') and remote_type == 'remote':
            return 'remote'
        if loc_lower and loc_lower in job_location_lower:
            return 'match'

    return 'partial'


def compute_salary_fit(target_salary_min, job_salary_min, job_salary_max):
    """Renvoie ('match'|'below'|'unknown', évaluable: bool)."""
    if target_salary_min is None or (job_salary_min is None and job_salary_max is None):
        return 'unknown', False

    job_reference = job_salary_max or job_salary_min
    if job_reference >= target_salary_min:
        return 'match', True
    return 'below', True


def compute_experience_fit(user_years: int, required_range):
    """
    Compare l'expérience de l'utilisateur à la fourchette détectée dans
    l'offre. Renvoie ('match'|'under'|'over'|'unknown', évaluable: bool).

    - 'under' : l'offre demande plus d'années que vous n'en avez (écart > 1 an)
    - 'over'  : vous avez largement plus d'expérience que demandé (écart > 5 ans,
                ce n'est pas forcément négatif mais peut indiquer une offre trop junior)
    - 'match' : dans la fourchette, ou proche (tolérance 1 an)
    """
    if required_range is None or user_years is None:
        return 'unknown', False

    lo, hi = required_range
    if lo - 1 <= user_years <= hi + 1:
        return 'match', True
    if user_years < lo - 1:
        return 'under', True
    return 'over', True


def compute_match(user_profile, job_listing) -> dict:
    """
    Calcule le score global de correspondance entre un UserProfile et un
    JobListing, en ne pondérant que les critères réellement évaluables.
    """
    skill_result = compute_skill_match(user_profile.extracted_skills or {}, job_listing.required_skills or [])

    location_fit = compute_location_fit(
        user_profile.target_locations or [], job_listing.location, job_listing.remote_type
    )

    salary_fit, salary_evaluable = compute_salary_fit(
        getattr(user_profile, 'target_salary_min', None), job_listing.salary_min, job_listing.salary_max
    )

    required_experience = extract_required_experience(job_listing.description)
    experience_fit, experience_evaluable = compute_experience_fit(
        user_profile.years_experience, required_experience
    )

    location_score = 100.0 if location_fit in ('match', 'remote') else (40.0 if location_fit == 'partial' else 0.0)
    salary_score = 100.0 if salary_fit == 'match' else 0.0
    experience_score = {
        'match': 100.0, 'over': 70.0, 'under': 20.0,
    }.get(experience_fit, 0.0)

    # Redistribution honnête des poids selon les données réellement disponibles.
    weights = {'location': WEIGHT_LOCATION}
    if skill_result['evaluable']:
        weights['skill'] = WEIGHT_SKILL
    if salary_evaluable:
        weights['salary'] = WEIGHT_SALARY
    if experience_evaluable:
        weights['experience'] = WEIGHT_EXPERIENCE

    total_weight = sum(weights.values()) or 1.0
    weights = {k: v / total_weight for k, v in weights.items()}

    overall = location_score * weights['location']
    if skill_result['evaluable']:
        overall += skill_result['score'] * weights['skill']
    if salary_evaluable:
        overall += salary_score * weights['salary']
    if experience_evaluable:
        overall += experience_score * weights['experience']

    overall = round(overall, 1)

    if overall >= 90:
        level = 'perfect'
    elif overall >= 75:
        level = 'excellent'
    elif overall >= 60:
        level = 'good'
    elif overall >= 50:
        level = 'potential'
    else:
        level = 'low'

    return {
        'match_score': overall,
        'match_level': level,
        'skill_match_score': skill_result['score'] if skill_result['evaluable'] else 0.0,
        'location_fit': location_fit,
        'salary_fit': salary_fit,
        'experience_fit': experience_fit,
        'matched_skills': skill_result['matched'],
        'skill_gaps': skill_result['gaps'],
        'skill_gaps_count': len(skill_result['gaps']),
    }


def aggregate_skill_gaps(matches_queryset, limit: int = 15) -> list:
    """
    Agrège les compétences manquantes (déjà calculées par match) sur un
    ensemble de JobMatch, classées par fréquence. Réutilisé par la vue
    "Analyse d'écart" ET par les générateurs IA (idées de posts, feuille
    de route) pour rester cohérent — une seule source de vérité.
    """
    total = matches_queryset.count()
    if total == 0:
        return []

    counts = {}
    for match in matches_queryset:
        for skill in (match.skill_gaps or {}).keys():
            counts[skill] = counts.get(skill, 0) + 1

    ranked = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    return [
        {'skill': skill, 'count': count, 'share': round(count / total * 100, 1)}
        for skill, count in ranked
    ]


def simulate_skill_addition(profile, skills_to_add: list) -> dict:
    """
    Recalcule le matching sur les offres déjà collectées du profil en
    simulant l'ajout de compétences, SANS jamais persister quoi que ce
    soit. Réutilise exactement compute_match() — aucune logique de
    score dupliquée, donc aucun risque de divergence entre le score réel
    et le score simulé.

    L'impact salaire est calculé uniquement à partir des offres déjà
    collectées de l'utilisateur (comparaison "avec ces compétences
    demandées" vs "sans"), jamais à partir d'une statistique de marché
    externe qu'on ne possède pas.
    """
    import copy
    from jobs.models import JobMatch

    current_skills = profile.extracted_skills or {}
    simulated_skills = dict(current_skills)
    for skill in skills_to_add:
        simulated_skills.setdefault(skill, 1)

    # Copie superficielle en mémoire seulement : aucun .save() n'est
    # jamais appelé sur cet objet, le profil réel n'est jamais modifié.
    simulated_profile = copy.copy(profile)
    simulated_profile.extracted_skills = simulated_skills

    matches = JobMatch.objects.filter(user=profile).select_related('job')
    total = matches.count()
    if total == 0:
        return {
            'current_avg_score': None, 'simulated_avg_score': None,
            'current_accessible_count': 0, 'simulated_accessible_count': 0,
            'salary_impact': None, 'sample_size': 0,
        }

    current_scores = []
    simulated_scores = []
    accessible_threshold = 75.0

    salaries_with_skill = []
    salaries_without_skill = []

    for match in matches:
        current_scores.append(match.match_score)
        simulated_result = compute_match(simulated_profile, match.job)
        simulated_scores.append(simulated_result['match_score'])

        job_skills = set(match.job.required_skills or [])
        avg_salary = None
        if match.job.salary_min and match.job.salary_max:
            avg_salary = (match.job.salary_min + match.job.salary_max) / 2
        elif match.job.salary_min:
            avg_salary = match.job.salary_min

        if avg_salary:
            if job_skills & set(skills_to_add):
                salaries_with_skill.append(avg_salary)
            else:
                salaries_without_skill.append(avg_salary)

    salary_impact = None
    if salaries_with_skill and salaries_without_skill:
        salary_impact = round(
            (sum(salaries_with_skill) / len(salaries_with_skill)) -
            (sum(salaries_without_skill) / len(salaries_without_skill))
        )

    return {
        'current_avg_score': round(sum(current_scores) / total, 1),
        'simulated_avg_score': round(sum(simulated_scores) / total, 1),
        'current_accessible_count': sum(1 for s in current_scores if s >= accessible_threshold),
        'simulated_accessible_count': sum(1 for s in simulated_scores if s >= accessible_threshold),
        'salary_impact': salary_impact,
        'salary_sample_size': len(salaries_with_skill),
        'sample_size': total,
    }
