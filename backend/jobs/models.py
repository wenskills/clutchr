"""
Models for Clutchr job matching platform
"""
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator


class UserProfile(models.Model):
    """Extended user profile with Clutchr-specific data"""
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    
    # Profile data
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.TextField(max_length=500, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    
    # LinkedIn/CV data (extracted)
    linkedin_text = models.TextField(blank=True, help_text="Extracted from LinkedIn PDF export")
    cv_text = models.TextField(blank=True, help_text="Extracted from CV/resume PDF")

    # Fichiers PDF d'origine, conservés pour l'aperçu réel dans l'interface.
    # Le chemin de stockage n'est jamais exposé directement au frontend :
    # ces fichiers sont servis via un endpoint authentifié qui vérifie la
    # propriété du profil (voir UserProfileViewSet.document), jamais via
    # l'URL MEDIA statique brute.
    linkedin_pdf_file = models.FileField(upload_to='profile_documents/linkedin/', null=True, blank=True)
    cv_pdf_file = models.FileField(upload_to='profile_documents/cv/', null=True, blank=True)

    # Profil structuré (titre, résumé, expériences, formations) généré
    # par analyse du texte extrait. Modifiable manuellement ensuite —
    # ce champ représente la version éditée par l'utilisateur, pas
    # nécessairement la sortie brute de la dernière analyse.
    structured_profile = models.JSONField(default=dict, blank=True)
    
    # Parsed skills (as JSON)
    extracted_skills = models.JSONField(default=dict, help_text="{'Python': 5, 'Django': 3}")
    
    # Preferences
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

    # Settings
    notify_new_matches = models.BooleanField(default=True)
    notify_trending_skills = models.BooleanField(default=True)
    notify_interview_offers = models.BooleanField(
        default=True, help_text="Notifie lors d'un passage en statut Entretien ou Offre reçue"
    )
    
    # Metadata
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
        """Check if profile has minimum required data"""
        return bool(
            self.extracted_skills and
            self.target_roles and
            self.target_locations
        )


class JobListing(models.Model):
    """Job postings scraped from job boards"""
    
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
    
    # Full description & metadata
    description = models.TextField()
    required_skills = models.JSONField(default=list, help_text="['Python', 'Django', 'PostgreSQL']")
    
    # Compensation
    salary_min = models.IntegerField(null=True, blank=True)
    salary_max = models.IntegerField(null=True, blank=True)
    currency = models.CharField(max_length=3, default='EUR')
    
    # Links
    job_url = models.URLField()
    company_url = models.URLField(blank=True)
    
    # Timestamps
    posted_date = models.DateTimeField()
    scraped_date = models.DateTimeField(auto_now_add=True)
    
    # Status
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
    """Matching between user profile and job"""
    
    MATCH_LEVEL_CHOICES = [
        ('perfect', 'Perfect Match (90%+)'),
        ('excellent', 'Excellent (75-89%)'),
        ('good', 'Good Match (60-74%)'),
        ('potential', 'Potential (50-59%)'),
        ('low', 'Low Match (<50%)'),
    ]

    # Statuts du suivi de candidature (Kanban). 'nouveau' est l'état par
    # défaut d'un match qui vient d'être calculé — il ne représente pas
    # encore une décision de l'utilisateur.
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
    
    # Score breakdown
    skill_match_score = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(100)])
    location_fit = models.CharField(max_length=50, default='unknown')
    salary_fit = models.CharField(max_length=50, default='unknown')
    experience_fit = models.CharField(max_length=50, default='unknown')
    
    # Skill analysis
    matched_skills = models.JSONField(default=dict, help_text="{'Python': True, 'Django': True}")
    skill_gaps = models.JSONField(default=dict, help_text="{'Kubernetes': False, 'AWS': False}")
    skill_gaps_count = models.IntegerField(default=0)
    
    # Metadata
    is_notified = models.BooleanField(default=False)
    user_saved = models.BooleanField(default=False)
    user_applied = models.BooleanField(default=False)

    # Suivi de candidature (Kanban)
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
    
    # Timestamps
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
    """Track skill demand across job market"""
    
    skill = models.CharField(max_length=255, unique=True)
    
    # Frequency stats
    frequency = models.FloatField(default=0, help_text="% of jobs requiring this")
    trend = models.FloatField(default=0, help_text="YoY change %")
    
    # Career info
    avg_salary_impact = models.IntegerField(null=True, blank=True, help_text="€ salary boost")
    related_skills = models.JSONField(default=list, help_text="['Django', 'FastAPI', 'SQLAlchemy']")
    
    # Meta
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
    """Daily snapshot of market trends"""
    
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
    
    # Aggregate stats
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
    """
    Trace chaque changement de statut d'une candidature. Sans cet
    historique, une candidature passée par "Entretien" puis "Refusé"
    perdrait la preuve qu'elle a un jour atteint l'entretien — ce qui
    rendrait les statistiques de pipeline (taux de réponse, délai
    moyen) fausses. Jamais modifié après création, jamais supprimé
    individuellement (purgé uniquement avec la candidature parente).
    """
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
    """
    Suivi des entreprises à approcher pour du contact direct (recruteur,
    talent acquisition, RH...). Aucune donnée de personne n'est stockée
    ni scrapée ici : Clutchr génère uniquement un lien de recherche
    LinkedIn pré-rempli ; l'utilisateur navigue et contacte lui-même,
    depuis son propre compte.
    """

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

    # Offre qui a fait découvrir cette entreprise (optionnel, peut être null
    # si l'entreprise a été ajoutée manuellement)
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
    """
    Personne individuelle identifiée chez une entreprise suivie (vs
    CompanyContact, qui ne suit que la décision d'approcher l'entreprise
    elle-même). Aucune donnée n'est jamais générée automatiquement ici :
    chaque contact est saisi manuellement par l'utilisateur après une
    recherche LinkedIn — Clutchr ne scrape jamais de profils.
    """

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
    """
    Dépôts tendance GitHub (scraping HTML — voir scrapers/github_trending.py).
    Rafraîchi périodiquement, pas de lien direct avec un utilisateur :
    c'est une donnée de marché générale.
    """

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
    """
    Mémorise où en est chaque utilisateur dans les résultats de chaque
    source POUR CHAQUE combinaison poste+lieu, pour qu'un nouveau
    "Lancer une recherche" avance dans la liste plutôt que de toujours
    redemander les mêmes premiers résultats.

    Le curseur est scopé par combinaison (query_key) et non plus
    globalement par source : avec des recherches de niche (peu de
    résultats par combinaison), une seule combinaison épuisée ne doit
    pas remettre à zéro le curseur de toutes les autres.
    """
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
    """
    Point quotidien du Career Pulse et de ses composantes. Un seul
    enregistrement par utilisateur et par jour (idempotent) : relancer
    le calcul plusieurs fois la même journée met juste à jour ce point,
    n'en crée jamais un second.
    """
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
    """
    Présence quotidienne (%) d'une compétence dans les offres déjà
    collectées d'un utilisateur. Comparer deux points enregistrés donne
    une évolution réelle — jamais un pourcentage de tendance inventé.
    """
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
    """
    Authentification à deux facteurs (TOTP — Time-based One-Time
    Password, standard RFC 6238 utilisé par Google Authenticator, Authy,
    etc.). Le secret n'est jamais renvoyé après l'activation initiale ;
    seuls les codes de récupération à usage unique permettent de
    retrouver l'accès en cas de perte de l'appareil.
    """
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
    """
    Notification in-app. Pas d'envoi d'e-mail réel pour l'instant (ça
    demanderait un vrai serveur SMTP configuré, pas seulement la
    console de développement) — uniquement une cloche dans l'interface.
    """

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
    """
    Marque une priorité du jour comme traitée. Les priorités elles-mêmes
    sont recalculées à chaque chargement (jamais figées) — ce modèle ne
    fait que retenir, pour la date du jour, quels types d'action ont déjà
    été cochés, pour ne pas les re-proposer une fois traités.
    """
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='daily_completions')
    action_type = models.CharField(max_length=30)
    completed_for_date = models.DateField()
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'action_type', 'completed_for_date')

    def __str__(self):
        return f"{self.user.user.username} — {self.action_type} ({self.completed_for_date})"


class LinkedInPost(models.Model):
    """
    Post LinkedIn sauvegardé (idée, brouillon ou publié). Permet de
    calculer un vrai "Content Gap" (compétences jamais abordées dans
    aucun post) et un calendrier éditorial personnel — aucune
    publication automatique sur LinkedIn, Clutchr n'a aucune intégration
    avec leur API.
    """

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
