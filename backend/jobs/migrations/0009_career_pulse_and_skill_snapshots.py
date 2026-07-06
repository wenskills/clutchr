import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0008_scrapecursor'),
    ]

    operations = [
        migrations.CreateModel(
            name='CareerPulseSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('captured_at', models.DateField(auto_now_add=True)),
                ('pulse_score', models.FloatField(blank=True, null=True)),
                ('employability_score', models.FloatField(blank=True, null=True)),
                ('skills_score', models.FloatField(blank=True, null=True)),
                ('network_score', models.FloatField(blank=True, null=True)),
                ('documents_score', models.FloatField(blank=True, null=True)),
                ('visibility_score', models.FloatField(blank=True, null=True)),
                ('matches_count', models.IntegerField(default=0)),
                ('skills_count', models.IntegerField(default=0)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='pulse_snapshots', to='jobs.userprofile'
                )),
            ],
            options={
                'ordering': ['-captured_at'],
            },
        ),
        migrations.AddIndex(
            model_name='careerpulsesnapshot',
            index=models.Index(fields=['user', '-captured_at'], name='jobs_career_user_id_p1n2t3_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='careerpulsesnapshot',
            unique_together={('user', 'captured_at')},
        ),
        migrations.CreateModel(
            name='SkillTrendSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('skill', models.CharField(max_length=255)),
                ('share', models.FloatField(help_text='Pourcentage des offres mentionnant cette compétence')),
                ('count', models.IntegerField(default=0)),
                ('captured_at', models.DateField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='skill_trend_snapshots', to='jobs.userprofile'
                )),
            ],
            options={
                'ordering': ['-captured_at'],
            },
        ),
        migrations.AddIndex(
            model_name='skilltrendsnapshot',
            index=models.Index(fields=['user', 'skill', '-captured_at'], name='jobs_skillt_user_id_s4k5l6_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='skilltrendsnapshot',
            unique_together={('user', 'skill', 'captured_at')},
        ),
    ]
