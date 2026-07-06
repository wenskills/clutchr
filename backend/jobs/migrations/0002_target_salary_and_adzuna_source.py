from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='target_salary_min',
            field=models.IntegerField(
                blank=True, null=True,
                help_text='Salaire annuel minimum souhaité (€), utilisé pour le calcul de correspondance'
            ),
        ),
        migrations.AlterField(
            model_name='joblisting',
            name='source',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('adzuna', 'Adzuna'),
                    ('indeed', 'Indeed'),
                    ('glassdoor', 'Glassdoor'),
                    ('wtj', 'Welcome to the Jungle'),
                    ('linkedin', 'LinkedIn'),
                ],
            ),
        ),
    ]
