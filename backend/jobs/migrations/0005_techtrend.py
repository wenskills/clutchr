from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0004_jobmatch_experience_fit'),
    ]

    operations = [
        migrations.CreateModel(
            name='TechTrend',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rank', models.IntegerField()),
                ('owner', models.CharField(max_length=255)),
                ('repo_name', models.CharField(max_length=255)),
                ('full_name', models.CharField(max_length=510)),
                ('description', models.TextField(blank=True)),
                ('language', models.CharField(blank=True, max_length=100)),
                ('stars_total', models.IntegerField(default=0)),
                ('stars_period', models.IntegerField(default=0, help_text='Étoiles gagnées sur la période')),
                ('period', models.CharField(default='daily', max_length=20)),
                ('url', models.URLField(blank=True)),
                ('scraped_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['period', 'rank'],
            },
        ),
        migrations.AlterUniqueTogether(
            name='techtrend',
            unique_together={('full_name', 'period')},
        ),
    ]
