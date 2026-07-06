from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0017_fix_contact_related_name_collision'),
    ]

    operations = [
        migrations.AddField(
            model_name='scrapecursor',
            name='query_key',
            field=models.CharField(
                blank=True, default='', max_length=255,
                help_text='role|location normalisés'
            ),
        ),
        migrations.AlterUniqueTogether(
            name='scrapecursor',
            unique_together={('user', 'source', 'query_key')},
        ),
    ]
