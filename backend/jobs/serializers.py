"""
Django REST Framework serializers for Clutchr API
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from jobs.models import UserProfile, JobListing, JobMatch, CompanyContact, TechTrend, Contact, Notification, LinkedInPost


class UserSerializer(serializers.ModelSerializer):
    """Basic user info serializer"""
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id']


class UserRegisterSerializer(serializers.ModelSerializer):
    """Serializer for user registration"""
    
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)
    
    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password_confirm', 'first_name', 'last_name']
    
    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError("Passwords don't match")
        return data
    
    def create(self, validated_data):
        validated_data.pop('password_confirm')
        user = User.objects.create_user(**validated_data)
        UserProfile.objects.create(user=user)
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    """Full user profile with extracted data"""

    user = UserSerializer(read_only=True)
    has_linkedin_pdf = serializers.SerializerMethodField()
    has_cv_pdf = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            'id', 'user', 'avatar', 'bio', 'phone',
            'linkedin_text', 'cv_text', 'has_linkedin_pdf', 'has_cv_pdf',
            'structured_profile',
            'extracted_skills', 'target_roles', 'target_locations', 'industries',
            'years_experience', 'current_role', 'current_company', 'target_salary_min',
            'target_salary_max', 'contract_type', 'remote_preference',
            'notify_new_matches', 'notify_trending_skills', 'notify_interview_offers',
            'profile_complete', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'extracted_skills', 'profile_complete', 'created_at', 'updated_at',
            'has_linkedin_pdf', 'has_cv_pdf', 'structured_profile',
        ]

    def get_has_linkedin_pdf(self, obj):
        return bool(obj.linkedin_pdf_file)

    def get_has_cv_pdf(self, obj):
        return bool(obj.cv_pdf_file)


class JobListingSerializer(serializers.ModelSerializer):
    """Job listing details"""
    
    avg_salary = serializers.SerializerMethodField()
    
    class Meta:
        model = JobListing
        fields = [
            'id', 'source', 'title', 'company_name', 'location', 'remote_type',
            'description', 'required_skills',
            'salary_min', 'salary_max', 'currency', 'avg_salary',
            'job_url', 'company_url', 'posted_date', 'is_active'
        ]
        read_only_fields = ['id', 'created_at']
    
    def get_avg_salary(self, obj):
        return obj.avg_salary()


class JobMatchSerializer(serializers.ModelSerializer):
    """Job match with full details"""

    job = JobListingSerializer(read_only=True)
    viewed = serializers.SerializerMethodField()

    class Meta:
        model = JobMatch
        fields = [
            'id', 'job',
            'match_score', 'match_level',
            'skill_match_score', 'location_fit', 'salary_fit', 'experience_fit',
            'matched_skills', 'skill_gaps', 'skill_gaps_count',
            'is_notified', 'user_saved', 'user_applied',
            'kanban_status', 'notes', 'status_updated_at', 'labels', 'viewed',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'match_score', 'match_level', 'skill_gaps_count', 'created_at']

    def get_viewed(self, obj):
        return obj.viewed_at is not None


class CompanyContactSerializer(serializers.ModelSerializer):
    """
    Suivi d'entreprise à approcher. Ne contient aucune donnée de personne :
    le lien de recherche LinkedIn est généré côté frontend à partir du
    nom de l'entreprise, jamais stocké ni scrapé.
    """
    source_job_title = serializers.SerializerMethodField()
    matching_offers_count = serializers.SerializerMethodField()

    class Meta:
        model = CompanyContact
        fields = [
            'id', 'company_name', 'status', 'notes',
            'source_job', 'source_job_title', 'matching_offers_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_source_job_title(self, obj):
        return obj.source_job.title if obj.source_job else None

    def get_matching_offers_count(self, obj):
        """Nombre réel d'offres correspondantes (vos JobMatch) chez cette entreprise — pas une estimation."""
        return JobMatch.objects.filter(
            user=obj.user, job__company_name=obj.company_name
        ).count()


class ContactSerializer(serializers.ModelSerializer):
    """
    Personne individuelle saisie manuellement par l'utilisateur après
    une recherche LinkedIn. Aucun champ ici n'est jamais rempli
    automatiquement par scraping — c'est la promesse du module Réseau.
    """

    class Meta:
        model = Contact
        fields = [
            'id', 'name', 'role', 'company_name', 'linkedin_url', 'status',
            'notes', 'next_followup_date', 'company_contact', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class TechTrendSerializer(serializers.ModelSerializer):
    class Meta:
        model = TechTrend
        fields = [
            'id', 'rank', 'owner', 'repo_name', 'full_name', 'description',
            'language', 'stars_total', 'stars_period', 'period', 'url', 'scraped_at'
        ]


class LoginSerializer(serializers.Serializer):
    """Login serializer (email/username + password)"""
    
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)


class ProfileImportSerializer(serializers.Serializer):
    """Serializer for profile import (PDF upload)"""
    
    linkedin_pdf = serializers.FileField(required=False, help_text="LinkedIn profile PDF export")
    cv_pdf = serializers.FileField(required=False, help_text="CV/resume PDF")
    target_roles = serializers.ListField(
        child=serializers.CharField(),
        required=True,
        help_text="['Python Developer', 'Backend Engineer']"
    )
    target_locations = serializers.ListField(
        child=serializers.CharField(),
        required=True,
        help_text="['Paris', 'Lyon', 'Remote']"
    )
    years_experience = serializers.IntegerField(required=True, min_value=0)
    
    def validate_linkedin_pdf(self, value):
        if value and value.size > 10 * 1024 * 1024:  # 10MB limit
            raise serializers.ValidationError("File too large. Max 10MB.")
        return value
    
    def validate_cv_pdf(self, value):
        if value and value.size > 10 * 1024 * 1024:  # 10MB limit
            raise serializers.ValidationError("File too large. Max 10MB.")
        return value


class SkillGapAnalysisSerializer(serializers.Serializer):
    """Analysis of skill gaps between user and job"""
    
    user_skills = serializers.DictField()
    job_skills = serializers.ListField(child=serializers.CharField())
    matched_skills = serializers.DictField(read_only=True)
    skill_gaps = serializers.DictField(read_only=True)
    gap_count = serializers.IntegerField(read_only=True)
    learning_time_estimate = serializers.CharField(read_only=True)


class NotificationSerializer(serializers.ModelSerializer):
    """Notification in-app, jamais créée depuis le frontend."""

    class Meta:
        model = Notification
        fields = ['id', 'notification_type', 'title', 'message', 'route', 'is_read', 'created_at']
        read_only_fields = fields


class LinkedInPostSerializer(serializers.ModelSerializer):
    """Post LinkedIn sauvegardé — aucune publication automatique, Clutchr n'a pas d'intégration LinkedIn."""

    class Meta:
        model = LinkedInPost
        fields = ['id', 'content', 'status', 'scheduled_day', 'topics', 'created_at', 'updated_at']
        read_only_fields = ['id', 'topics', 'created_at', 'updated_at']
