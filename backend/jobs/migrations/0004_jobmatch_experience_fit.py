from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0003_companycontact'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobmatch',
            name='experience_fit',
            field=models.CharField(default='unknown', max_length=50),
        ),
    ]
