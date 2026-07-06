from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0014_two_factor_and_notifications'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='notify_interview_offers',
            field=models.BooleanField(
                default=True,
                help_text="Notifie lors d'un passage en statut Entretien ou Offre reçue"
            ),
        ),
    ]
