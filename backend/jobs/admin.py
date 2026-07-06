from django.contrib import admin
from jobs.models import UserProfile, JobListing, JobMatch, SkillDemand, TrendSnapshot


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'years_experience', 'profile_complete', 'created_at']
    list_filter = ['profile_complete']
    search_fields = ['user__username', 'user__email']


@admin.register(JobListing)
class JobListingAdmin(admin.ModelAdmin):
    list_display = ['title', 'company_name', 'location', 'source', 'posted_date', 'is_active']
    list_filter = ['source', 'is_active', 'remote_type']
    search_fields = ['title', 'company_name']


@admin.register(JobMatch)
class JobMatchAdmin(admin.ModelAdmin):
    list_display = ['user', 'job', 'match_score', 'match_level', 'created_at']
    list_filter = ['match_level']


@admin.register(SkillDemand)
class SkillDemandAdmin(admin.ModelAdmin):
    list_display = ['skill', 'frequency', 'trend', 'avg_salary_impact']
    search_fields = ['skill']


@admin.register(TrendSnapshot)
class TrendSnapshotAdmin(admin.ModelAdmin):
    list_display = ['role', 'location', 'date', 'total_jobs', 'avg_salary']
    list_filter = ['date']
