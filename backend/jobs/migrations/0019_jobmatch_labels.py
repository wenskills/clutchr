from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0018_scrapecursor_per_query'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobmatch',
            name='labels',
            field=models.JSONField(
                blank=True, default=list,
                help_text="Étiquettes libres façon GitLab : [{'name': 'Urgent', 'color': '#F59E0B'}]"
            ),
        ),
    ]
