from django.db import migrations, models


def migrate_existing_statuses(apps, schema_editor):
    """
    Les matches déjà marqués 'enregistré' ou 'postulé' (anciens booléens)
    doivent apparaître dans la bonne colonne du Kanban, pas retomber à
    'Nouveau' silencieusement.
    """
    JobMatch = apps.get_model('jobs', 'JobMatch')
    JobMatch.objects.filter(user_applied=True).update(kanban_status='postule')
    JobMatch.objects.filter(user_applied=False, user_saved=True).update(kanban_status='interesse')


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0005_techtrend'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobmatch',
            name='kanban_status',
            field=models.CharField(
                choices=[
                    ('nouveau', 'Nouveau'),
                    ('interesse', 'Intéressé'),
                    ('postule', 'Postulé'),
                    ('entretien', 'Entretien'),
                    ('offre', 'Offre reçue'),
                    ('refuse', 'Refusé'),
                    ('abandonne', 'Abandonné'),
                ],
                default='nouveau', max_length=20
            ),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='notes',
            field=models.TextField(blank=True, max_length=3000),
        ),
        migrations.AddField(
            model_name='jobmatch',
            name='status_updated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(migrate_existing_statuses, noop_reverse),
    ]
