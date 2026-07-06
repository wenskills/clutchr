from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='UserProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('avatar', models.ImageField(blank=True, null=True, upload_to='avatars/')),
                ('bio', models.TextField(blank=True, max_length=500)),
                ('phone', models.CharField(blank=True, max_length=20)),
                ('linkedin_text', models.TextField(blank=True, help_text='Extracted from LinkedIn PDF export')),
                ('cv_text', models.TextField(blank=True, help_text='Extracted from CV/resume PDF')),
                ('extracted_skills', models.JSONField(default=dict, help_text="{'Python': 5, 'Django': 3}")),
                ('target_roles', models.JSONField(default=list, help_text="['Python Developer', 'Backend Engineer']")),
                ('target_locations', models.JSONField(default=list, help_text="['Paris', 'Lyon', 'Remote']")),
                ('industries', models.JSONField(default=list, help_text="['Tech', 'Fintech']")),
                ('years_experience', models.IntegerField(default=0, validators=[django.core.validators.MinValueValidator(0)])),
                ('current_role', models.CharField(blank=True, max_length=255)),
                ('current_company', models.CharField(blank=True, max_length=255)),
                ('notify_new_matches', models.BooleanField(default=True)),
                ('notify_trending_skills', models.BooleanField(default=True)),
                ('profile_complete', models.BooleanField(default=False)),
                ('last_analyzed', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='profile', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-updated_at'],
            },
        ),
        migrations.CreateModel(
            name='JobListing',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source', models.CharField(choices=[('indeed', 'Indeed'), ('glassdoor', 'Glassdoor'), ('wtj', 'Welcome to the Jungle'), ('linkedin', 'LinkedIn')], max_length=20)),
                ('source_id', models.CharField(help_text='Unique ID from job board', max_length=255, unique=True)),
                ('title', models.CharField(max_length=255)),
                ('company_name', models.CharField(max_length=255)),
                ('location', models.CharField(max_length=255)),
                ('remote_type', models.CharField(choices=[('onsite', 'On-site'), ('hybrid', 'Hybrid'), ('remote', 'Remote'), ('unknown', 'Unknown')], default='unknown', max_length=20)),
                ('description', models.TextField()),
                ('required_skills', models.JSONField(default=list, help_text="['Python', 'Django', 'PostgreSQL']")),
                ('salary_min', models.IntegerField(blank=True, null=True)),
                ('salary_max', models.IntegerField(blank=True, null=True)),
                ('currency', models.CharField(default='EUR', max_length=3)),
                ('job_url', models.URLField()),
                ('company_url', models.URLField(blank=True)),
                ('posted_date', models.DateTimeField()),
                ('scraped_date', models.DateTimeField(auto_now_add=True)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'ordering': ['-posted_date'],
            },
        ),
        migrations.CreateModel(
            name='SkillDemand',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('skill', models.CharField(max_length=255, unique=True)),
                ('frequency', models.FloatField(default=0, help_text='% of jobs requiring this')),
                ('trend', models.FloatField(default=0, help_text='YoY change %')),
                ('avg_salary_impact', models.IntegerField(blank=True, help_text='€ salary boost', null=True)),
                ('related_skills', models.JSONField(default=list, help_text="['Django', 'FastAPI', 'SQLAlchemy']")),
                ('last_updated', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-frequency'],
            },
        ),
        migrations.CreateModel(
            name='TrendSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(auto_now_add=True)),
                ('role', models.CharField(max_length=255)),
                ('location', models.CharField(max_length=255)),
                ('top_skills', models.JSONField(default=list, help_text="[{'skill': 'Python', 'freq': 0.95, 'trend': 5}]")),
                ('top_companies', models.JSONField(default=list, help_text="[{'name': 'Stripe', 'hiring_velocity': 10}]")),
                ('total_jobs', models.IntegerField(default=0)),
                ('avg_salary', models.IntegerField(default=0)),
                ('emerging_skills', models.JSONField(default=list, help_text='Skills with trend > 10%')),
            ],
            options={
                'ordering': ['-date'],
            },
        ),
        migrations.CreateModel(
            name='JobMatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('match_score', models.FloatField(help_text='Overall match score 0-100', validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('match_level', models.CharField(choices=[('perfect', 'Perfect Match (90%+)'), ('excellent', 'Excellent (75-89%)'), ('good', 'Good Match (60-74%)'), ('potential', 'Potential (50-59%)'), ('low', 'Low Match (<50%)')], max_length=20)),
                ('skill_match_score', models.FloatField(validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ('location_fit', models.CharField(default='unknown', max_length=50)),
                ('salary_fit', models.CharField(default='unknown', max_length=50)),
                ('matched_skills', models.JSONField(default=dict, help_text="{'Python': True, 'Django': True}")),
                ('skill_gaps', models.JSONField(default=dict, help_text="{'Kubernetes': False, 'AWS': False}")),
                ('skill_gaps_count', models.IntegerField(default=0)),
                ('is_notified', models.BooleanField(default=False)),
                ('user_saved', models.BooleanField(default=False)),
                ('user_applied', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('job', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='matches', to='jobs.joblisting')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='matches', to='jobs.userprofile')),
            ],
            options={
                'ordering': ['-match_score'],
            },
        ),
        migrations.AddIndex(
            model_name='userprofile',
            index=models.Index(fields=['user', '-updated_at'], name='jobs_userpr_user_id_d0b0b0_idx'),
        ),
        migrations.AddIndex(
            model_name='joblisting',
            index=models.Index(fields=['source', 'source_id'], name='jobs_joblis_source_3f1b3e_idx'),
        ),
        migrations.AddIndex(
            model_name='joblisting',
            index=models.Index(fields=['company_name', 'location'], name='jobs_joblis_company_8c1a2d_idx'),
        ),
        migrations.AddIndex(
            model_name='joblisting',
            index=models.Index(fields=['-posted_date'], name='jobs_joblis_posted__5e6f7a_idx'),
        ),
        migrations.AddIndex(
            model_name='skilldemand',
            index=models.Index(fields=['skill'], name='jobs_skilld_skill_1a2b3c_idx'),
        ),
        migrations.AddIndex(
            model_name='skilldemand',
            index=models.Index(fields=['-frequency'], name='jobs_skilld_frequen_4d5e6f_idx'),
        ),
        migrations.AddIndex(
            model_name='trendsnapshot',
            index=models.Index(fields=['-date'], name='jobs_trends_date_7g8h9i_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='trendsnapshot',
            unique_together={('date', 'role', 'location')},
        ),
        migrations.AddIndex(
            model_name='jobmatch',
            index=models.Index(fields=['user', '-match_score'], name='jobs_jobmat_user_id_j1k2l3_idx'),
        ),
        migrations.AddIndex(
            model_name='jobmatch',
            index=models.Index(fields=['-match_score'], name='jobs_jobmat_match_s_m4n5o6_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='jobmatch',
            unique_together={('user', 'job')},
        ),
    ]
