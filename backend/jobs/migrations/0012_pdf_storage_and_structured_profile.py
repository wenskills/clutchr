from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('jobs', '0011_pas_interesse_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='linkedin_pdf_file',
            field=models.FileField(blank=True, null=True, upload_to='profile_documents/linkedin/'),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='cv_pdf_file',
            field=models.FileField(blank=True, null=True, upload_to='profile_documents/cv/'),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='structured_profile',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
