import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0007_add_francetravail_source'),
    ]

    operations = [
        migrations.CreateModel(
            name='ScrapeCursor',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source', models.CharField(max_length=20)),
                ('next_page', models.IntegerField(default=1)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='scrape_cursors', to='jobs.userprofile'
                )),
            ],
        ),
        migrations.AlterUniqueTogether(
            name='scrapecursor',
            unique_together={('user', 'source')},
        ),
    ]
