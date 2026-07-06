from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0010_advanced_filters'),
    ]

    operations = [
        migrations.AlterField(
            model_name='jobmatch',
            name='kanban_status',
            field=models.CharField(
                choices=[
                    ('nouveau', 'Nouveau'),
                    ('pas_interesse', 'Pas intéressé'),
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
    ]
