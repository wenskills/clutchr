import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0012_pdf_storage_and_structured_profile'),
    ]

    operations = [
        migrations.CreateModel(
            name='JobMatchStatusEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('from_status', models.CharField(max_length=20)),
                ('to_status', models.CharField(max_length=20)),
                ('occurred_at', models.DateTimeField(auto_now_add=True)),
                ('match', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='status_events', to='jobs.jobmatch'
                )),
            ],
            options={
                'ordering': ['occurred_at'],
            },
        ),
        migrations.AddIndex(
            model_name='jobmatchstatusevent',
            index=models.Index(fields=['match', 'occurred_at'], name='jobs_statusev_match_occ_idx'),
        ),
        migrations.CreateModel(
            name='Contact',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('role', models.CharField(blank=True, max_length=255)),
                ('company_name', models.CharField(blank=True, max_length=255)),
                ('linkedin_url', models.URLField(blank=True)),
                ('status', models.CharField(
                    choices=[
                        ('a_trouver', 'À trouver'),
                        ('a_contacter', 'À contacter'),
                        ('invitation_envoyee', 'Invitation envoyée'),
                        ('reponse_recue', 'Réponse reçue'),
                        ('conversation', 'Conversation'),
                        ('entretien_obtenu', 'Entretien obtenu'),
                    ],
                    default='a_trouver', max_length=30
                )),
                ('notes', models.TextField(blank=True, max_length=3000)),
                ('next_followup_date', models.DateField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company_contact', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='people', to='jobs.companycontact'
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='contacts', to='jobs.userprofile'
                )),
            ],
            options={
                'ordering': ['-updated_at'],
            },
        ),
    ]
