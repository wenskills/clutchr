from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0009_career_pulse_and_skill_snapshots'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='target_salary_max',
            field=models.IntegerField(
                blank=True, null=True,
                help_text='Salaire annuel maximum envisagé (€), purement indicatif'
            ),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='contract_type',
            field=models.CharField(
                blank=True, default='', max_length=20,
                choices=[
                    ('', 'Indifférent'),
                    ('cdi', 'CDI'),
                    ('cdd', 'CDD'),
                    ('alternance', 'Alternance'),
                    ('stage', 'Stage'),
                    ('freelance', 'Freelance'),
                ],
            ),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='remote_preference',
            field=models.CharField(
                blank=True, default='', max_length=20,
                choices=[
                    ('', 'Indifférent'),
                    ('full', 'Télétravail complet'),
                    ('hybrid', 'Hybride'),
                    ('onsite', 'Présentiel'),
                ],
            ),
        ),
    ]
