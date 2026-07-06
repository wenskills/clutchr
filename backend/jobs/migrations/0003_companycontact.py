import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0002_target_salary_and_adzuna_source'),
    ]

    operations = [
        migrations.CreateModel(
            name='CompanyContact',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('company_name', models.CharField(max_length=255)),
                ('status', models.CharField(
                    choices=[
                        ('a_contacter', 'À contacter'),
                        ('contacte', 'Contacté'),
                        ('reponse_recue', 'Réponse reçue'),
                        ('sans_reponse', 'Sans réponse'),
                    ],
                    default='a_contacter', max_length=20
                )),
                ('notes', models.TextField(blank=True, max_length=2000)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('source_job', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='contacts', to='jobs.joblisting'
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='contacts', to='jobs.userprofile'
                )),
            ],
            options={
                'ordering': ['-updated_at'],
            },
        ),
        migrations.AddIndex(
            model_name='companycontact',
            index=models.Index(fields=['user', '-updated_at'], name='jobs_compan_user_id_c1d2e3_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='companycontact',
            unique_together={('user', 'company_name')},
        ),
    ]
