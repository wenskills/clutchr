"""
Modèles Clutchr
"""
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator


class UserProfile(models.Model):
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    
    # Profil data
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.TextField(max_length=500, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    
    # LinkedIn/CV data (extracted)
    linkedin_text = models.TextField(blank=True, help_text="Extracted from LinkedIn PDF export")
    cv_text = models.TextField(blank=True, help_text="Extracted from CV/resume PDF")

    linkedin_pdf_file = models.FileField(upload_to='profile_documents/linkedin/', null=True, blank=True)
    cv_pdf_file = models.FileField(upload_to='profile_documents/cv/', null=True, blank=True)

    structured_profile = models.JSONField(default=dict, blank=True)
    
    extracted_skills = models.JSONField(default=dict, help_text="{'Python': 5, 'Django': 3}")
    
    # Préférences
    target_roles = models.JSONField(default=list, help_text="['Python Developer', 'Backend Engineer']")
    target_locations = models.JSONField(default=list, help_text="['Paris', 'Lyon', 'Remote']")
    industries = models.JSONField(default=list, help_text="['Tech', 'Fintech']")
    
    # Career info
    years_experience = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    current_role = models.CharField(max_length=255, blank=True)
    current_company = models.CharField(max_length=255, blank=True)
    target_salary_min = models.IntegerField(
        null=True, blank=True,
        help_text="Salaire annuel minimum souhaité (€), utilisé pour le calcul de correspondance"
    )
    target_salary_max = models.IntegerField(
        null=True, blank=True,
        help_text="Salaire annuel maximum envisagé (€), purement indicatif"
    )

    CONTRACT_TYPE_CHOICES = [
        ('', 'Indifférent'),
        ('cdi', 'CDI'),
        ('cdd', 'CDD'),
        ('alternance', 'Alternance'),
        ('stage', 'Stage'),
        ('freelance', 'Freelance'),
    ]
    contract_type = models.CharField(max_length=20, choices=CONTRACT_TYPE_CHOICES, blank=True, default='')

    REMOTE_PREFERENCE_CHOICES = [
        ('', 'Indifférent'),
        ('full', 'Télétravail complet'),
        ('hybrid', 'Hybride'),
        ('onsite', 'Présentiel'),
    ]
    remote_preference = models.CharField(max_length=20, choices=REMOTE_PREFERENCE_CHOICES, blank=True, default='')

    notify_new_matches = models.BooleanField(default=True)
    notify_trending_skills = models.BooleanField(default=True)
    notify_interview_offers = models.BooleanField(
        default=True, help_text="Notifie lors d'un passage en statut Entretien ou Offre reçue"
    )
   
    profile_complete = models.BooleanField(default=False)
    last_analyzed = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['user', '-updated_at']),
        ]
    
    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} Profile"
    
    def is_profile_complete(self):
        return bool(
            self.extracted_skills and
            self.target_roles and
            self.target_locations
        )


class JobListing(models.Model):
    
    SOURCE_CHOICES = [
        ('adzuna', 'Adzuna'),
        ('francetravail', 'France Travail'),
        ('indeed', 'Indeed'),
        ('glassdoor', 'Glassdoor'),
        ('wtj', 'Welcome to the Jungle'),
        ('linkedin', 'LinkedIn'),
    ]
    
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    source_id = models.CharField(max_length=255, unique=True, help_text="Unique ID from job board")
    
    # Job details
    title = models.CharField(max_length=255)
    company_name = models.CharField(max_length=255)
    location = models.CharField(max_length=255)
    remote_type = models.CharField(
        max_length=20,
        choices=[('onsite', 'On-site'), ('hybrid', 'Hybrid'), ('remote', 'Remote'), ('unknown', 'Unknown')],
        default='unknown'
    )
    
    description = models.TextField()
    required_skills = models.JSONField(default=list, help_text="['Python', 'Django', 'PostgreSQL']")
    
    salary_min = models.IntegerField(null=True, blank=True)
    salary_max = models.IntegerField(null=True, blank=True)
    currency = models.CharField(max_length=3, default='EUR')
    
    job_url = models.URLField()
    company_url = models.URLField(blank=True)
    
    posted_date = models.DateTimeField()
    scraped_date = models.DateTimeField(auto_now_add=True)
    
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-posted_date']
        indexes = [
            models.Index(fields=['source', 'source_id']),
            models.Index(fields=['company_name', 'location']),
            models.Index(fields=['-posted_date']),
        ]
    
    def __str__(self):
        return f"{self.title} @ {self.company_name}"
    
    def avg_salary(self):
        """Get average salary if available"""
        if self.salary_min and self.salary_max:
            return (self.salary_min + self.salary_max) // 2
        return None


class JobMatch(models.Model):
    
    MATCH_LEVEL_CHOICES = [
        ('perfect', 'Perfect Match (90%+)'),
        ('excellent', 'Excellent (75-89%)'),
        ('good', 'Good Match (60-74%)'),
        ('potential', 'Potential (50-59%)'),
        ('low', 'Low Match (<50%)'),
    ]

    KANBAN_STATUS_CHOICES = [
        ('nouveau', 'Nouveau'),
        ('pas_interesse', 'Pas intéressé'),
        ('interesse', 'Intéressé'),
        ('postule', 'Postulé'),
        ('entretien', 'Entretien'),
        ('offre', 'Offre reçue'),
        ('refuse', 'Refusé'),
        ('abandonne', 'Abandonné'),
    ]
    
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='matches')
    job = models.ForeignKey(JobListing, on_delete=models.CASCADE, related_name='matches')
    
    # Scoring
    match_score = models.FloatField(
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Overall match score 0-100"
    )
    match_level = models.CharField(max_length=20, choices=MATCH_LEVEL_CHOICES)
    
    skill_match_score = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(100)])
    location_fit = models.CharField(max_length=50, default='unknown')
    salary_fit = models.CharField(max_length=50, default='unknown')
    experience_fit = models.CharField(max_length=50, default='unknown')
    
    matched_skills = models.JSONField(default=dict, help_text="{'Python': True, 'Django': True}")
    skill_gaps = models.JSONField(default=dict, help_text="{'Kubernetes': False, 'AWS': False}")
    skill_gaps_count = models.IntegerField(default=0)
    
    is_notified = models.BooleanField(default=False)
    user_saved = models.BooleanField(default=False)
    user_applied = models.BooleanField(default=False)

    # Suivi de candidature
    kanban_status = models.CharField(max_length=20, choices=KANBAN_STATUS_CHOICES, default='nouveau')
    notes = models.TextField(blank=True, max_length=3000)
    status_updated_at = models.DateTimeField(null=True, blank=True)
    viewed_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Quand l'offre a été ouverte au moins une fois — pour l'effet visuel 'déjà consultée', persisté en base plutôt que perdu au changement de page."
    )
    labels = models.JSONField(
        default=list, blank=True,
        help_text="Étiquettes libres façon GitLab : [{'name': 'Urgent', 'color': '#F59E0B'}]"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-match_score']
        unique_together = ('user', 'job')
        indexes = [
            models.Index(fields=['user', '-match_score']),
            models.Index(fields=['-match_score']),
        ]
    
    def __str__(self):
        return f"{self.user.user.username} → {self.job.title} ({self.match_score}%)"


class SkillDemand(models.Model):
    
    skill = models.CharField(max_length=255, unique=True)
    
    frequency = models.FloatField(default=0, help_text="% of jobs requiring this")
    trend = models.FloatField(default=0, help_text="YoY change %")
    
    avg_salary_impact = models.IntegerField(null=True, blank=True, help_text="€ salary boost")
    related_skills = models.JSONField(default=list, help_text="['Django', 'FastAPI', 'SQLAlchemy']")
    
    last_updated = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-frequency']
        indexes = [
            models.Index(fields=['skill']),
            models.Index(fields=['-frequency']),
        ]
    
    def __str__(self):
        return f"{self.skill} ({self.frequency:.1f}% demand, {self.trend:+.1f}% trend)"


class TrendSnapshot(models.Model):
    
    date = models.DateField(auto_now_add=True)
    role = models.CharField(max_length=255)
    location = models.CharField(max_length=255)
    
    # Top data
    top_skills = models.JSONField(
        default=list,
        help_text="[{'skill': 'Python', 'freq': 0.95, 'trend': 5}]"
    )
    top_companies = models.JSONField(
        default=list,
        help_text="[{'name': 'Stripe', 'hiring_velocity': 10}]"
    )
    
    total_jobs = models.IntegerField(default=0)
    avg_salary = models.IntegerField(default=0)
    emerging_skills = models.JSONField(default=list, help_text="Skills with trend > 10%")
    
    class Meta:
        ordering = ['-date']
        unique_together = ('date', 'role', 'location')
        indexes = [
            models.Index(fields=['-date']),
        ]
    
    def __str__(self):
        return f"Trends: {self.role} in {self.location} ({self.date})"


class JobMatchStatusEvent(models.Model):
    
    match = models.ForeignKey(JobMatch, on_delete=models.CASCADE, related_name='status_events')
    from_status = models.CharField(max_length=20)
    to_status = models.CharField(max_length=20)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['occurred_at']
        indexes = [
            models.Index(fields=['match', 'occurred_at']),
        ]

    def __str__(self):
        return f"{self.match_id}: {self.from_status} -> {self.to_status} ({self.occurred_at})"


class CompanyContact(models.Model):

    STATUS_CHOICES = [
        ('a_contacter', 'À contacter'),
        ('contacte', 'Contacté'),
        ('reponse_recue', 'Réponse reçue'),
        ('sans_reponse', 'Sans réponse'),
    ]

    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='contacts')
    company_name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='a_contacter')
    notes = models.TextField(blank=True, max_length=2000)

    source_job = models.ForeignKey(
        JobListing, on_delete=models.SET_NULL, null=True, blank=True, related_name='contacts'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        unique_together = ('user', 'company_name')
        indexes = [
            models.Index(fields=['user', '-updated_at']),
        ]

    def __str__(self):
        return f"{self.company_name} ({self.get_status_display()}) — {self.user.user.username}"


class Contact(models.Model):

    STATUS_CHOICES = [
        ('a_trouver', 'À trouver'),
        ('a_contacter', 'À contacter'),
        ('invitation_envoyee', 'Invitation envoyée'),
        ('reponse_recue', 'Réponse reçue'),
        ('conversation', 'Conversation'),
        ('entretien_obtenu', 'Entretien obtenu'),
    ]

    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='people')
    company_contact = models.ForeignKey(
        CompanyContact, on_delete=models.SET_NULL, null=True, blank=True, related_name='people'
    )

    name = models.CharField(max_length=255)
    role = models.CharField(max_length=255, blank=True)
    company_name = models.CharField(max_length=255, blank=True)
    linkedin_url = models.URLField(blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='a_trouver')
    notes = models.TextField(blank=True, max_length=3000)
    next_followup_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.name} ({self.get_status_display()}) — {self.company_name}"


class TechTrend(models.Model):
    
    rank = models.IntegerField()
    owner = models.CharField(max_length=255)
    repo_name = models.CharField(max_length=255)
    full_name = models.CharField(max_length=510)
    description = models.TextField(blank=True)
    language = models.CharField(max_length=100, blank=True)
    stars_total = models.IntegerField(default=0)
    stars_period = models.IntegerField(default=0, help_text="Étoiles gagnées sur la période")
    period = models.CharField(max_length=20, default='daily')
    url = models.URLField(blank=True)
    scraped_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['period', 'rank']
        unique_together = ('full_name', 'period')

    def __str__(self):
        return f"#{self.rank} {self.full_name} (+{self.stars_period} {self.period})"


class ScrapeCursor(models.Model):
    
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='scrape_cursors')
    source = models.CharField(max_length=20)
    query_key = models.CharField(max_length=255, default='', blank=True, help_text="role|location normalisés")
    next_page = models.IntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'source', 'query_key')

    def __str__(self):
        return f"{self.user.user.username} / {self.source} / {self.query_key} -> page {self.next_page}"


class CareerPulseSnapshot(models.Model):
   
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='pulse_snapshots')
    captured_at = models.DateField(auto_now_add=True)

    pulse_score = models.FloatField(null=True, blank=True)
    employability_score = models.FloatField(null=True, blank=True)
    skills_score = models.FloatField(null=True, blank=True)
    network_score = models.FloatField(null=True, blank=True)
    documents_score = models.FloatField(null=True, blank=True)
    visibility_score = models.FloatField(null=True, blank=True)

    matches_count = models.IntegerField(default=0)
    skills_count = models.IntegerField(default=0)

    class Meta:
        ordering = ['-captured_at']
        unique_together = ('user', 'captured_at')
        indexes = [
            models.Index(fields=['user', '-captured_at']),
        ]

    def __str__(self):
        return f"{self.user.user.username} — {self.captured_at} — Pulse {self.pulse_score}"


class SkillTrendSnapshot(models.Model):
    
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='skill_trend_snapshots')
    skill = models.CharField(max_length=255)
    share = models.FloatField(help_text="Pourcentage des offres mentionnant cette compétence")
    count = models.IntegerField(default=0)
    captured_at = models.DateField(auto_now_add=True)

    class Meta:
        ordering = ['-captured_at']
        unique_together = ('user', 'skill', 'captured_at')
        indexes = [
            models.Index(fields=['user', 'skill', '-captured_at']),
        ]

    def __str__(self):
        return f"{self.user.user.username} — {self.skill} — {self.share}% ({self.captured_at})"


class TwoFactorAuth(models.Model):
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='two_factor_auth')
    secret = models.CharField(max_length=64)
    enabled = models.BooleanField(default=False)
    recovery_codes = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    enabled_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        status = 'activée' if self.enabled else 'en attente de confirmation'
        return f"2FA ({status}) — {self.user.username}"


class Notification(models.Model):

    TYPE_CHOICES = [
        ('new_excellent_match', 'Nouvelle offre excellente'),
        ('interview_reached', 'Entretien obtenu'),
        ('offer_received', 'Offre reçue'),
        ('followup_reminder', 'Relance suggérée'),
    ]

    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    title = models.CharField(max_length=255)
    message = models.CharField(max_length=500, blank=True)
    route = models.CharField(max_length=255, blank=True, help_text="Route frontend à ouvrir au clic")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read', '-created_at']),
        ]

    def __str__(self):
        return f"{self.title} — {self.user.user.username} ({'lue' if self.is_read else 'non lue'})"


class DailyActionCompletion(models.Model):
    
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='daily_completions')
    action_type = models.CharField(max_length=30)
    completed_for_date = models.DateField()
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'action_type', 'completed_for_date')

    def __str__(self):
        return f"{self.user.user.username} — {self.action_type} ({self.completed_for_date})"


class LinkedInPost(models.Model):

    STATUS_CHOICES = [
        ('idee', 'Idée'),
        ('brouillon', 'Brouillon'),
        ('publie', 'Publié'),
    ]
    DAY_CHOICES = [
        ('lundi', 'Lundi'), ('mardi', 'Mardi'), ('mercredi', 'Mercredi'),
        ('jeudi', 'Jeudi'), ('vendredi', 'Vendredi'), ('samedi', 'Samedi'), ('dimanche', 'Dimanche'),
    ]

    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='linkedin_posts')
    content = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='brouillon')
    scheduled_day = models.CharField(max_length=20, choices=DAY_CHOICES, blank=True)
    topics = models.JSONField(default=list, blank=True, help_text="Compétences du profil détectées dans ce post")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.user.user.username} — {self.get_status_display()} ({self.created_at.date()})"
