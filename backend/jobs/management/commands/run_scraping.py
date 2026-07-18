"""
Commande de planification légère — pas de Celery/Redis nécessaire.

Lance la recherche d'offres pour tous les profils complets (postes ciblés
renseignés), un par un, avec gestion propre du quota et des erreurs
individuelles (un profil qui échoue n'arrête pas les autres).

Planification (cron, Linux/Mac) — 3 fois par jour à 8h, 13h, 19h :
    0 8,13,19 * * * cd /chemin/vers/backend && /chemin/vers/venv/bin/python manage.py run_scraping >> /chemin/vers/logs/scraping.log 2>&1
"""
import logging

from django.core.management.base import BaseCommand

from jobs.models import UserProfile
from jobs.scraping_service import run_scrape_for_profile

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Lance la recherche d'offres + calcul des correspondances pour tous les profils complets."

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            type=str,
            default=None,
            help="Limiter l'exécution à un seul utilisateur (par username), utile pour tester."
        )

    def handle(self, *args, **options):
        profiles = UserProfile.objects.exclude(target_roles=[])

        username = options.get('username')
        if username:
            profiles = profiles.filter(user__username=username)

        if not profiles.exists():
            self.stdout.write(self.style.WARNING(
                "Aucun profil avec des postes ciblés renseignés. Rien à faire."
            ))
            return

        total_profiles = profiles.count()
        self.stdout.write(f"Lancement pour {total_profiles} profil(s)...")

        for profile in profiles:
            username_label = profile.user.username
            try:
                summary = run_scrape_for_profile(profile)
            except Exception as exc:
                # Un échec sur un profil ne doit jamais bloquer les autres.
                logger.exception(f"Erreur scraping pour {username_label}: {exc}")
                self.stdout.write(self.style.ERROR(f"✗ {username_label} : erreur ({exc})"))
                continue

            if not summary['configured']:
                self.stdout.write(self.style.WARNING(
                    f"⚠ {username_label} : aucune source configurée (ADZUNA_APP_ID/KEY manquants)."
                ))
                continue

            if summary.get('rate_limited'):
                self.stdout.write(self.style.WARNING(
                    f"⚠ {username_label} : quota Adzuna atteint en cours de route, "
                    f"{summary['new_jobs']} nouvelle(s) offre(s) récupérée(s) avant l'arrêt."
                ))
            else:
                self.stdout.write(self.style.SUCCESS(
                    f"✓ {username_label} : {summary['new_jobs']} nouvelle(s) offre(s), "
                    f"{summary['matches_created']} nouvelle(s) correspondance(s)."
                ))

        self.stdout.write(self.style.SUCCESS("Terminé."))
