from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0019_jobmatch_labels'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobmatch',
            name='viewed_at',
            field=models.DateTimeField(
                blank=True, null=True,
                help_text="Quand l'offre a été ouverte au moins une fois — pour l'effet visuel 'déjà consultée', persisté en base plutôt que perdu au changement de page."
            ),
        ),
    ]
