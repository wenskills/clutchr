from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0006_jobmatch_kanban_tracking'),
    ]

    operations = [
        migrations.AlterField(
            model_name='joblisting',
            name='source',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('adzuna', 'Adzuna'),
                    ('francetravail', 'France Travail'),
                    ('indeed', 'Indeed'),
                    ('glassdoor', 'Glassdoor'),
                    ('wtj', 'Welcome to the Jungle'),
                    ('linkedin', 'LinkedIn'),
                ],
            ),
        ),
    ]
