import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('jobs', '0013_status_events_and_contacts'),
    ]

    operations = [
        migrations.CreateModel(
            name='TwoFactorAuth',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('secret', models.CharField(max_length=64)),
                ('enabled', models.BooleanField(default=False)),
                ('recovery_codes', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('enabled_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='two_factor_auth', to=settings.AUTH_USER_MODEL
                )),
            ],
        ),
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notification_type', models.CharField(
                    choices=[
                        ('new_excellent_match', 'Nouvelle offre excellente'),
                        ('interview_reached', 'Entretien obtenu'),
                        ('offer_received', 'Offre reçue'),
                        ('followup_reminder', 'Relance suggérée'),
                    ],
                    max_length=30
                )),
                ('title', models.CharField(max_length=255)),
                ('message', models.CharField(blank=True, max_length=500)),
                ('route', models.CharField(blank=True, help_text='Route frontend à ouvrir au clic', max_length=255)),
                ('is_read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notifications', to='jobs.userprofile'
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['user', 'is_read', '-created_at'], name='jobs_notif_user_read_idx'),
        ),
    ]
