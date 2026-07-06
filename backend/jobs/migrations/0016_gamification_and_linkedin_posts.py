import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0015_notify_interview_offers'),
    ]

    operations = [
        migrations.CreateModel(
            name='DailyActionCompletion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action_type', models.CharField(max_length=30)),
                ('completed_for_date', models.DateField()),
                ('completed_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='daily_completions', to='jobs.userprofile'
                )),
            ],
        ),
        migrations.AlterUniqueTogether(
            name='dailyactioncompletion',
            unique_together={('user', 'action_type', 'completed_for_date')},
        ),
        migrations.CreateModel(
            name='LinkedInPost',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content', models.TextField()),
                ('status', models.CharField(
                    choices=[('idee', 'Idée'), ('brouillon', 'Brouillon'), ('publie', 'Publié')],
                    default='brouillon', max_length=20
                )),
                ('scheduled_day', models.CharField(
                    blank=True, max_length=20,
                    choices=[
                        ('lundi', 'Lundi'), ('mardi', 'Mardi'), ('mercredi', 'Mercredi'),
                        ('jeudi', 'Jeudi'), ('vendredi', 'Vendredi'), ('samedi', 'Samedi'), ('dimanche', 'Dimanche'),
                    ]
                )),
                ('topics', models.JSONField(blank=True, default=list, help_text='Compétences du profil détectées dans ce post')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='linkedin_posts', to='jobs.userprofile'
                )),
            ],
            options={
                'ordering': ['-updated_at'],
            },
        ),
    ]
