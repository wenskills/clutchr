"""
Skill extraction
"""
import re
from collections import Counter
import logging

logger = logging.getLogger(__name__)


class SkillExtractor:
    
    # Tech skills taxonomie
    TECH_SKILLS = {
        "Languages": [
            "Python", "JavaScript", "TypeScript", "Java", "Go", "Rust",
            "C++", "C#", "PHP", "Ruby", "Kotlin", "Swift", "SQL"
        ],
        "Backend": [
            "Django", "FastAPI", "Flask", "Spring Boot", "Node.js", "Express",
            "Ruby on Rails", "Laravel", "ASP.NET", "Gin", "NestJS"
        ],
        "Frontend": [
            "React", "Angular", "Vue.js", "Svelte", "Next.js", "Nuxt.js",
            "HTML", "CSS", "Tailwind", "Bootstrap", "Material UI"
        ],
        "Databases": [
            "PostgreSQL", "MySQL", "MongoDB", "Redis", "Cassandra",
            "Elasticsearch", "DynamoDB", "Firebase", "SQLite"
        ],
        "DevOps/Cloud": [
            "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Terraform",
            "CI/CD", "GitHub Actions", "GitLab CI", "Jenkins", "Ansible",
            "Docker Compose", "Helm"
        ],
        "Data": [
            "SQL", "Pandas", "NumPy", "Scikit-learn", "TensorFlow", "PyTorch",
            "Spark", "Hadoop", "dbt", "Airflow", "Data Warehouse"
        ],
        "Other": [
            "Git", "REST API", "GraphQL", "WebSocket", "Microservices",
            "Agile", "Scrum", "Linux", "Vi", "Vim", "AWS", "LLM", "RAG",
            "SOLID", "Design Patterns"
        ]
    }
    
    def __init__(self):
        self.all_skills = set()
        for category, skills in self.TECH_SKILLS.items():
            self.all_skills.update(skills)
    
    def extract_from_text(self, text):
        text_lower = text.lower()
        found_skills = {}
        
        for skill in self.all_skills:
            skill_lower = skill.lower()
            # Count occurrences (simple regex to avoid partial matches)
            pattern = r'\b' + re.escape(skill_lower) + r'\b'
            matches = re.findall(pattern, text_lower)
            if matches:
                found_skills[skill] = len(matches)
        
        return found_skills
    
    def extract_from_cv(self, cv_text):
        skills = self.extract_from_text(cv_text)
        
        # Boost weight for skills in explicit "Skills" section
        lines = cv_text.split('\n')
        in_skills_section = False
        
        for line in lines:
            if 'skills' in line.lower():
                in_skills_section = True
            elif any(section in line.lower() for section in ['experience', 'education', 'projects']):
                in_skills_section = False
            
            if in_skills_section:
                for skill in skills:
                    if skill.lower() in line.lower():
                        # Double weight for skills in skills section
                        skills[skill] = skills.get(skill, 1) * 2
        
        return skills
    
    def rank_skills(self, skills_dict):
        return sorted(skills_dict.items(), key=lambda x: x[1], reverse=True)
    
    def get_skill_categories(self, skills_list):
        categorized = {}
        
        for category, category_skills in self.TECH_SKILLS.items():
            matched = [s for s in skills_list if s in category_skills]
            if matched:
                categorized[category] = matched
        
        return categorized
