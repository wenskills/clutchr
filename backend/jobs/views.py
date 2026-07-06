"""
REST API views for Clutchr
"""
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.http import FileResponse, Http404
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from django.db import models
from rest_framework.authtoken.models import Token

from jobs.models import (
    UserProfile, JobListing, JobMatch, CompanyContact, TechTrend,
    JobMatchStatusEvent, Contact, TwoFactorAuth, Notification,
    DailyActionCompletion, LinkedInPost
)
from jobs.serializers import (
    UserRegisterSerializer, UserProfileSerializer, JobListingSerializer,
    JobMatchSerializer, LoginSerializer, ProfileImportSerializer, CompanyContactSerializer,
    TechTrendSerializer, ContactSerializer, NotificationSerializer, LinkedInPostSerializer
)
from utils.pdf_parser import PDFParser
from utils.skill_extractor import SkillExtractor


class AuthViewSet(viewsets.ViewSet):
    """Authentication endpoints"""
    
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['post'])
    def register(self, request):
        """Register new user"""
        serializer = UserRegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            token, _ = Token.objects.get_or_create(user=user)
            return Response({
                'user_id': user.id,
                'username': user.username,
                'email': user.email,
                'token': token.key,
                'message': 'User registered successfully'
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def login(self, request):
        """Login user"""
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = authenticate(
                username=serializer.validated_data['username'],
                password=serializer.validated_data['password']
            )
            if user:
                two_factor = getattr(user, 'two_factor_auth', None)
                if two_factor and two_factor.enabled:
                    from jobs.auth_security import create_pending_login_token
                    return Response({
                        'requires_2fa': True,
                        'pending_token': create_pending_login_token(user.id),
                    }, status=status.HTTP_200_OK)

                token, _ = Token.objects.get_or_create(user=user)
                profile = UserProfile.objects.get(user=user)
                return Response({
                    'user_id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'first_name': user.first_name,
                    'token': token.key,
                    'profile_complete': profile.profile_complete,
                }, status=status.HTTP_200_OK)
            return Response(
                {'error': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='2fa-login')
    def two_factor_login(self, request):
        """
        Seconde étape de connexion quand la 2FA est activée : échange
        le jeton temporaire (obtenu après mot de passe valide) contre
        le vrai jeton d'accès, à condition de fournir un code TOTP
        valide ou un code de récupération à usage unique.
        """
        from jobs.auth_security import verify_pending_login_token, verify_totp_code

        pending_token = request.data.get('pending_token', '')
        code = request.data.get('code', '').strip()

        user_id = verify_pending_login_token(pending_token)
        if not user_id:
            return Response(
                {'error': 'Session de connexion expirée. Reconnectez-vous avec votre mot de passe.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        try:
            user = User.objects.get(id=user_id)
            two_factor = user.two_factor_auth
        except (User.DoesNotExist, TwoFactorAuth.DoesNotExist):
            return Response({'error': 'Configuration 2FA introuvable.'}, status=status.HTTP_400_BAD_REQUEST)

        valid = verify_totp_code(two_factor.secret, code)
        if not valid and code in two_factor.recovery_codes:
            valid = True
            two_factor.recovery_codes = [c for c in two_factor.recovery_codes if c != code]
            two_factor.save()

        if not valid:
            return Response({'error': 'Code invalide.'}, status=status.HTTP_401_UNAUTHORIZED)

        token, _ = Token.objects.get_or_create(user=user)
        profile = UserProfile.objects.get(user=user)
        return Response({
            'user_id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'token': token.key,
            'profile_complete': profile.profile_complete,
        }, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def logout(self, request):
        """Logout user (invalidate token)"""
        request.user.auth_token.delete()
        return Response({'message': 'Logged out successfully'})

    @action(detail=False, methods=['post'], url_path='2fa-setup', permission_classes=[IsAuthenticated])
    def two_factor_setup(self, request):
        """
        Démarre l'activation de la 2FA : génère un nouveau secret et son
        QR code, sans encore l'activer (l'activation réelle se fait via
        2fa-confirm, une fois qu'un code valide a été saisi — pour
        s'assurer que l'application d'authentification est bien
        configurée avant de verrouiller le compte derrière elle).
        """
        from jobs.auth_security import generate_secret, generate_qr_code_data_uri

        secret = generate_secret()
        two_factor, _ = TwoFactorAuth.objects.update_or_create(
            user=request.user, defaults={'secret': secret, 'enabled': False, 'recovery_codes': []}
        )
        qr_code = generate_qr_code_data_uri(secret, request.user.username)

        return Response({'secret': secret, 'qr_code': qr_code})

    @action(detail=False, methods=['post'], url_path='2fa-confirm', permission_classes=[IsAuthenticated])
    def two_factor_confirm(self, request):
        """Active la 2FA après vérification d'un premier code valide, et renvoie les codes de récupération."""
        from jobs.auth_security import verify_totp_code, generate_recovery_codes

        code = request.data.get('code', '').strip()
        try:
            two_factor = request.user.two_factor_auth
        except TwoFactorAuth.DoesNotExist:
            return Response(
                {'error': "Lancez d'abord la configuration via 2fa-setup."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not verify_totp_code(two_factor.secret, code):
            return Response({'error': 'Code invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        recovery_codes = generate_recovery_codes()
        two_factor.enabled = True
        two_factor.recovery_codes = recovery_codes
        two_factor.enabled_at = timezone.now()
        two_factor.save()

        return Response({'enabled': True, 'recovery_codes': recovery_codes})

    @action(detail=False, methods=['post'], url_path='2fa-disable', permission_classes=[IsAuthenticated])
    def two_factor_disable(self, request):
        """Désactive la 2FA. Demande le mot de passe actuel par sécurité."""
        password = request.data.get('password', '')
        if not request.user.check_password(password):
            return Response({'error': 'Mot de passe incorrect.'}, status=status.HTTP_401_UNAUTHORIZED)

        TwoFactorAuth.objects.filter(user=request.user).delete()
        return Response({'enabled': False})

    @action(detail=False, methods=['get'], url_path='2fa-status', permission_classes=[IsAuthenticated])
    def two_factor_status(self, request):
        """Indique si la 2FA est active sur ce compte."""
        two_factor = getattr(request.user, 'two_factor_auth', None)
        return Response({'enabled': bool(two_factor and two_factor.enabled)})

    @action(detail=False, methods=['post'])
    def password_reset(self, request):
        """
        Demande de réinitialisation de mot de passe.
        Renvoie toujours un message générique (ne révèle pas si l'e-mail existe).
        En dev, l'e-mail est affiché dans la console du serveur Django
        (EMAIL_BACKEND=console).
        """
        email = request.data.get('email', '').strip()
        generic_response = Response({
            'message': "Si un compte existe avec cet e-mail, un lien de réinitialisation a été envoyé."
        })

        if not email:
            return Response({'error': "L'e-mail est requis."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email).first()
        if not user:
            return generic_response

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:4200')
        reset_link = f"{frontend_url}/reinitialiser-mot-de-passe?uid={uid}&token={token}"

        send_mail(
            subject="Clutchr — Réinitialisation de votre mot de passe",
            message=(
                f"Bonjour {user.first_name or user.username},\n\n"
                f"Cliquez sur ce lien pour choisir un nouveau mot de passe :\n{reset_link}\n\n"
                "Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail."
            ),
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@clutchr.app'),
            recipient_list=[user.email],
            fail_silently=True,
        )

        return generic_response

    @action(detail=False, methods=['post'], url_path='password-reset-confirm')
    def password_reset_confirm(self, request):
        """Confirme la réinitialisation à partir du lien reçu par e-mail."""
        uid = request.data.get('uid', '')
        token = request.data.get('token', '')
        new_password = request.data.get('new_password', '')

        if not uid or not token or not new_password:
            return Response(
                {'error': 'Lien invalide ou mot de passe manquant.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(new_password) < 8:
            return Response(
                {'error': 'Le mot de passe doit contenir au moins 8 caractères.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user_pk = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_pk)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return Response({'error': 'Lien invalide ou expiré.'}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({'error': 'Lien invalide ou expiré.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        return Response({'message': 'Mot de passe mis à jour avec succès.'})

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def account_status(self, request):
        """État du compte pour l'écran Paramètres : type de connexion et 2FA."""
        two_factor = getattr(request.user, 'two_factor_auth', None)
        return Response({
            'email': request.user.email,
            'has_usable_password': request.user.has_usable_password(),
            'is_google_account': not request.user.has_usable_password(),
            'two_factor_enabled': bool(two_factor and two_factor.enabled),
        })

    @action(detail=False, methods=['post'], url_path='change-email', permission_classes=[IsAuthenticated])
    def change_email(self, request):
        """Change l'e-mail du compte. Demande le mot de passe actuel par sécurité."""
        new_email = (request.data.get('new_email') or '').strip().lower()
        password = request.data.get('password', '')

        if not new_email or '@' not in new_email:
            return Response({'error': 'Adresse e-mail invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        if not request.user.has_usable_password():
            return Response(
                {'error': "Ce compte est connecté via Google — l'e-mail ne peut pas être changé manuellement."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not request.user.check_password(password):
            return Response({'error': 'Mot de passe incorrect.'}, status=status.HTTP_401_UNAUTHORIZED)

        if User.objects.filter(email=new_email).exclude(id=request.user.id).exists():
            return Response({'error': 'Cette adresse e-mail est déjà utilisée.'}, status=status.HTTP_400_BAD_REQUEST)

        request.user.email = new_email
        request.user.save()
        return Response({'email': new_email})

    @action(detail=False, methods=['post'], url_path='change-password', permission_classes=[IsAuthenticated])
    def change_password(self, request):
        """Change le mot de passe en étant déjà connecté. Demande le mot de passe actuel."""
        current_password = request.data.get('current_password', '')
        new_password = request.data.get('new_password', '')

        if not request.user.has_usable_password():
            return Response(
                {'error': "Ce compte est connecté via Google — aucun mot de passe à changer."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not request.user.check_password(current_password):
            return Response({'error': 'Mot de passe actuel incorrect.'}, status=status.HTTP_401_UNAUTHORIZED)

        if len(new_password) < 8:
            return Response(
                {'error': 'Le nouveau mot de passe doit contenir au moins 8 caractères.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        request.user.set_password(new_password)
        request.user.save()
        return Response({'message': 'Mot de passe mis à jour avec succès.'})

    @action(detail=False, methods=['post'])
    def google(self, request):
        """
        Connexion / inscription via Google Identity Services.
        Nécessite GOOGLE_CLIENT_ID dans le .env backend et le package
        'google-auth'. Renvoie une erreur explicite si non configuré,
        plutôt que de planter silencieusement.
        """
        id_token_str = request.data.get('id_token', '')
        if not id_token_str:
            return Response({'error': 'id_token manquant.'}, status=status.HTTP_400_BAD_REQUEST)

        client_id = getattr(settings, 'GOOGLE_CLIENT_ID', '')
        if not client_id:
            return Response(
                {'error': "Connexion Google non configurée côté serveur (GOOGLE_CLIENT_ID manquant dans .env)."},
                status=status.HTTP_501_NOT_IMPLEMENTED
            )

        try:
            from google.oauth2 import id_token as google_id_token
            from google.auth.transport import requests as google_requests
        except ImportError:
            return Response(
                {'error': "Le package 'google-auth' n'est pas installé sur le serveur (pip install google-auth)."},
                status=status.HTTP_501_NOT_IMPLEMENTED
            )

        try:
            payload = google_id_token.verify_oauth2_token(
                id_token_str, google_requests.Request(), client_id
            )
        except ValueError:
            return Response({'error': 'Jeton Google invalide.'}, status=status.HTTP_401_UNAUTHORIZED)

        email = payload.get('email')
        if not email:
            return Response({'error': "Impossible de récupérer l'e-mail Google."}, status=status.HTTP_400_BAD_REQUEST)

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': email,
                'first_name': payload.get('given_name', ''),
                'last_name': payload.get('family_name', ''),
            }
        )
        if created:
            user.set_unusable_password()
            user.save()
            UserProfile.objects.create(user=user)

        profile, _ = UserProfile.objects.get_or_create(user=user)
        token, _ = Token.objects.get_or_create(user=user)

        return Response({
            'user_id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'token': token.key,
            'profile_complete': profile.profile_complete,
        }, status=status.HTTP_200_OK)


class UserProfileViewSet(viewsets.ModelViewSet):
    """User profile management"""
    
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return UserProfile.objects.filter(user=self.request.user)
    
    def get_object(self):
        return self.get_queryset().first()
    
    @action(detail=False, methods=['get'])
    def me(self, request):
        """Get current user's profile"""
        profile = self.get_object()
        serializer = self.get_serializer(profile)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def pulse(self, request):
        """
        Career Pulse du jour, son détail par composante, son évolution
        réelle sur 7 jours, l'historique des 30 derniers jours, et les
        compétences dont la présence a le plus bougé dans les offres
        déjà collectées. Capture également le point du jour (idempotent).
        """
        from jobs.snapshots import (
            capture_pulse_snapshot, capture_skill_trend_snapshots,
            get_pulse_history, get_pulse_delta, get_skill_trend_deltas
        )

        profile = self.get_object()
        snapshot = capture_pulse_snapshot(profile)
        capture_skill_trend_snapshots(profile)

        return Response({
            'pulse_score': snapshot.pulse_score,
            'breakdown': {
                'employability': snapshot.employability_score,
                'skills': snapshot.skills_score,
                'network': snapshot.network_score,
                'documents': snapshot.documents_score,
                'visibility': snapshot.visibility_score,
            },
            'delta_7d': get_pulse_delta(profile, days_ago=7),
            'history': get_pulse_history(profile, days=30),
            'skill_trends': get_skill_trend_deltas(profile, days_ago=30),
        })

    @action(detail=False, methods=['get'])
    def today(self, request):
        """
        Agrège tout ce que le tableau de bord décisionnel affiche, en un
        seul appel : Career Pulse, priorités du jour, statistiques
        d'opportunités, pipeline de candidatures, tendances de
        compétences et activité récente. Tout est calculé de façon
        déterministe à partir des données réellement collectées.
        """
        from jobs.snapshots import (
            capture_pulse_snapshot, capture_skill_trend_snapshots,
            get_pulse_delta, get_skill_trend_deltas, get_pulse_history, pulse_state_label,
        )
        from jobs.dashboard_service import (
            compute_priorities, compute_recent_activity,
            compute_opportunity_stats, compute_profile_completeness,
            compute_companies_hiring_today, compute_career_stage,
        )
        from jobs.momentum import compute_momentum

        profile = self.get_object()
        snapshot = capture_pulse_snapshot(profile)
        capture_skill_trend_snapshots(profile)

        matches = JobMatch.objects.filter(user=profile)
        pipeline = {
            key: matches.filter(kanban_status=key).count()
            for key, _ in JobMatch.KANBAN_STATUS_CHOICES if key != 'nouveau'
        }

        from jobs.matching import aggregate_skill_gaps
        gaps = aggregate_skill_gaps(matches, limit=1)
        all_required = set()
        for m in matches.select_related('job'):
            all_required.update(m.job.required_skills or [])
        user_skills = set((profile.extracted_skills or {}).keys())
        coverage_score = (
            round(len(user_skills & all_required) / len(all_required) * 100, 1)
            if all_required else None
        )

        pulse_delta = get_pulse_delta(profile, days_ago=7)

        return Response({
            'pulse': {
                'score': snapshot.pulse_score,
                'delta_7d': pulse_delta,
                'state': pulse_state_label(pulse_delta),
                'history': get_pulse_history(profile, days=14),
                'breakdown': {
                    'employability': snapshot.employability_score,
                    'skills': snapshot.skills_score,
                    'network': snapshot.network_score,
                    'documents': snapshot.documents_score,
                    'visibility': snapshot.visibility_score,
                },
            },
            'momentum': compute_momentum(profile),
            'career_stage': compute_career_stage(profile),
            'priorities': compute_priorities(profile),
            'opportunity_stats': compute_opportunity_stats(profile),
            'companies_hiring_today': compute_companies_hiring_today(profile),
            'pipeline': pipeline,
            'skill_trends': get_skill_trend_deltas(profile, days_ago=30, limit=4),
            'skill_gap_teaser': {
                'coverage_score': coverage_score,
                'top_missing_skill': gaps[0]['skill'] if gaps else None,
            },
            'recent_activity': compute_recent_activity(profile),
            'profile_completeness': compute_profile_completeness(profile),
        })

    @action(detail=False, methods=['post'], url_path='complete-priority')
    def complete_priority(self, request):
        """
        Marque une priorité du jour comme traitée. N'affecte jamais le
        Career Pulse directement — c'est un suivi de progression
        quotidienne, pas un système de points fabriqué.
        """
        action_type = request.data.get('action_type', '')
        if action_type not in ('offers', 'skill', 'network'):
            return Response({'error': 'Type de priorité invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        profile = self.get_object()
        DailyActionCompletion.objects.get_or_create(
            user=profile, action_type=action_type, completed_for_date=timezone.now().date()
        )
        return Response({'completed': True})

    @action(detail=False, methods=['get'], url_path='document/linkedin')
    def document_linkedin(self, request):
        """Sert le PDF d'export LinkedIn d'origine, pour aperçu dans l'interface."""
        return self._serve_document(request, 'linkedin')

    @action(detail=False, methods=['get'], url_path='document/cv')
    def document_cv(self, request):
        """Sert le PDF de CV d'origine, pour aperçu dans l'interface."""
        return self._serve_document(request, 'cv')

    def _serve_document(self, request, doc_type):
        """
        Vérifie que le fichier appartient bien à l'utilisateur authentifié
        avant de le renvoyer. Volontairement non exposé via l'URL MEDIA
        statique : un document personnel ne doit jamais être accessible
        par une URL devinée ou partagée par erreur.
        """
        profile = self.get_object()
        file_field = profile.linkedin_pdf_file if doc_type == 'linkedin' else profile.cv_pdf_file

        if not file_field:
            raise Http404("Aucun document de ce type n'a été importé.")

        return FileResponse(file_field.open('rb'), content_type='application/pdf')

    @action(detail=False, methods=['post'])
    def structure(self, request):
        """
        Analyse le texte déjà extrait (LinkedIn + CV) via Gemini pour le
        structurer en sections exploitables (résumé, expériences,
        formations). Le résultat est enregistré comme version de
        travail, modifiable ensuite manuellement par l'utilisateur.
        """
        from jobs.content_ai import structure_profile_text, ContentAIError

        profile = self.get_object()
        if not (profile.linkedin_text or profile.cv_text):
            return Response(
                {'error': "Importez d'abord un CV ou un export LinkedIn avant de structurer le profil."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            structured = structure_profile_text(profile.linkedin_text, profile.cv_text)
        except ContentAIError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED)

        profile.structured_profile = structured
        profile.save()
        return Response(structured)

    @action(detail=False, methods=['put'], url_path='structured-profile')
    def update_structured_profile(self, request):
        """
        Enregistre une version modifiée manuellement du profil structuré
        (l'utilisateur a ajouté, supprimé ou corrigé une entrée après la
        génération automatique).
        """
        profile = self.get_object()
        data = request.data.get('structured_profile')
        if not isinstance(data, dict):
            return Response(
                {'error': 'Le champ "structured_profile" doit être un objet JSON.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        profile.structured_profile = data
        profile.save()
        return Response(profile.structured_profile)
    
    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def import_profile(self, request):
        """
        Import profile from LinkedIn PDF and/or CV PDF
        
        POST /api/profile/import_profile/
        - linkedin_pdf: File (optional)
        - cv_pdf: File (optional)
        - target_roles: List of strings
        - target_locations: List of strings
        - years_experience: Integer
        """
        serializer = ProfileImportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        profile = self.get_object()
        pdf_parser = PDFParser()
        skill_extractor = SkillExtractor()
        
        # Parse LinkedIn PDF if provided
        if 'linkedin_pdf' in request.FILES:
            linkedin_file = request.FILES['linkedin_pdf']
            try:
                linkedin_text = pdf_parser.parse_pdf(linkedin_file)
                profile.linkedin_text = linkedin_text
            except Exception as e:
                return Response(
                    {'error': f'Error parsing LinkedIn PDF: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            # Le fichier d'origine est conservé pour l'aperçu réel dans
            # l'interface (auparavant, seul le texte extrait était gardé,
            # le PDF lui-même était perdu). On rembobine le flux car
            # parse_pdf l'a déjà entièrement lu.
            linkedin_file.seek(0)
            profile.linkedin_pdf_file = linkedin_file

        # Parse CV PDF if provided
        if 'cv_pdf' in request.FILES:
            cv_file = request.FILES['cv_pdf']
            try:
                cv_text = pdf_parser.parse_pdf(cv_file)
                profile.cv_text = cv_text
            except Exception as e:
                return Response(
                    {'error': f'Error parsing CV PDF: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            cv_file.seek(0)
            profile.cv_pdf_file = cv_file
        
        # Extract skills from both sources
        all_text = f"{profile.linkedin_text} {profile.cv_text}"
        extracted_skills = skill_extractor.extract_from_text(all_text)
        
        # Update profile
        profile.extracted_skills = dict(extracted_skills)
        profile.target_roles = serializer.validated_data['target_roles']
        profile.target_locations = serializer.validated_data['target_locations']
        profile.years_experience = serializer.validated_data['years_experience']
        profile.profile_complete = profile.is_profile_complete()
        profile.save()
        
        # Return updated profile
        return Response({
            'success': True,
            'profile': UserProfileSerializer(profile).data,
            'skills_extracted': len(extracted_skills),
            'message': 'Profile imported and analyzed successfully'
        }, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['put'])
    def update_preferences(self, request):
        """Update user preferences and profile info"""
        profile = self.get_object()

        if 'target_roles' in request.data:
            profile.target_roles = request.data['target_roles']
        if 'target_locations' in request.data:
            profile.target_locations = request.data['target_locations']
        if 'notify_new_matches' in request.data:
            profile.notify_new_matches = request.data['notify_new_matches']
        if 'notify_trending_skills' in request.data:
            profile.notify_trending_skills = request.data['notify_trending_skills']
        if 'notify_interview_offers' in request.data:
            profile.notify_interview_offers = request.data['notify_interview_offers']
        if 'bio' in request.data:
            profile.bio = request.data['bio'][:500]
        if 'current_role' in request.data:
            profile.current_role = request.data['current_role']
        if 'current_company' in request.data:
            profile.current_company = request.data['current_company']
        if 'years_experience' in request.data:
            try:
                profile.years_experience = max(0, int(request.data['years_experience']))
            except (TypeError, ValueError):
                pass
        if 'target_salary_min' in request.data:
            raw = request.data['target_salary_min']
            if raw in (None, ''):
                profile.target_salary_min = None
            else:
                try:
                    profile.target_salary_min = max(0, int(raw))
                except (TypeError, ValueError):
                    pass
        if 'target_salary_max' in request.data:
            raw = request.data['target_salary_max']
            if raw in (None, ''):
                profile.target_salary_max = None
            else:
                try:
                    profile.target_salary_max = max(0, int(raw))
                except (TypeError, ValueError):
                    pass
        if 'contract_type' in request.data:
            value = request.data['contract_type'] or ''
            valid_choices = dict(UserProfile.CONTRACT_TYPE_CHOICES)
            if value in valid_choices:
                profile.contract_type = value
        if 'remote_preference' in request.data:
            value = request.data['remote_preference'] or ''
            valid_choices = dict(UserProfile.REMOTE_PREFERENCE_CHOICES)
            if value in valid_choices:
                profile.remote_preference = value

        profile.profile_complete = profile.is_profile_complete()
        profile.save()
        serializer = self.get_serializer(profile)
        return Response(serializer.data)

    @action(detail=False, methods=['put'])
    def update_skills(self, request):
        """
        Update the user's skills dict directly (manual add/edit/remove
        on top of what was auto-extracted from CV/LinkedIn).

        Body: { "skills": {"Python": 5, "Django": 3, ...} }
        """
        profile = self.get_object()
        skills = request.data.get('skills')

        if not isinstance(skills, dict):
            return Response(
                {'error': 'Le champ "skills" doit être un objet {nom: poids}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        cleaned = {}
        for name, weight in skills.items():
            name = str(name).strip()
            if not name:
                continue
            try:
                cleaned[name] = max(1, int(weight))
            except (TypeError, ValueError):
                cleaned[name] = 1

        profile.extracted_skills = cleaned
        profile.profile_complete = profile.is_profile_complete()
        profile.save()

        serializer = self.get_serializer(profile)
        return Response(serializer.data)


class JobMatchViewSet(viewsets.ReadOnlyModelViewSet):
    """Job matches for current user"""

    serializer_class = JobMatchSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user_profile = UserProfile.objects.get(user=self.request.user)
        qs = JobMatch.objects.filter(user=user_profile).select_related('job')

        # Filtres optionnels sur la liste déjà collectée. Le télétravail
        # n'est filtrable qu'ici : ni Adzuna ni France Travail n'exposent
        # ce critère en paramètre de recherche.
        remote = self.request.query_params.get('remote_type')
        if remote:
            qs = qs.filter(job__remote_type=remote)

        salary_min = self.request.query_params.get('salary_min')
        if salary_min:
            try:
                qs = qs.filter(job__salary_max__gte=int(salary_min))
            except ValueError:
                pass

        return qs

    @action(detail=False, methods=['get'])
    def swipe_deck(self, request):
        """
        Pile d'offres pas encore examinées (statut 'nouveau'), classées
        par meilleure correspondance d'abord, pour l'interface de swipe.
        Limité à 50 par appel pour rester réactif côté client.
        """
        user_profile = UserProfile.objects.get(user=request.user)
        deck = (
            JobMatch.objects.filter(user=user_profile, kanban_status='nouveau')
            .select_related('job')
            .order_by('-match_score')[:50]
        )
        serializer = self.get_serializer(deck, many=True)
        return Response({'count': len(serializer.data), 'deck': serializer.data})

    @action(detail=False, methods=['post'])
    def scrape(self, request):
        """
        Lance une recherche d'offres pour le profil courant (à partir de
        ses postes/lieux ciblés) et calcule les correspondances.
        Synchrone : pas besoin de Celery/Redis pour tester. Peut prendre
        quelques secondes selon le nombre de requêtes envoyées à Adzuna.
        """
        from jobs.scraping_service import run_scrape_for_profile

        profile = UserProfile.objects.get(user=request.user)
        if not profile.target_roles:
            return Response(
                {'error': "Ajoutez au moins un poste ciblé dans votre profil avant de lancer une recherche."},
                status=status.HTTP_400_BAD_REQUEST
            )

        summary = run_scrape_for_profile(profile)

        if not summary['configured']:
            return Response({
                'error': "Aucune source d'offres n'est configurée côté serveur "
                         "(ADZUNA_APP_ID / ADZUNA_APP_KEY manquants dans le .env backend). "
                         "Inscription gratuite : https://developer.adzuna.com/",
                **summary
            }, status=status.HTTP_501_NOT_IMPLEMENTED)

        return Response(summary, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'])
    def high_matches(self, request):
        """Get high quality matches (score > 75%)"""
        matches = self.get_queryset().filter(match_score__gte=75)[:50]
        serializer = self.get_serializer(matches, many=True)
        return Response({
            'count': len(matches),
            'matches': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get match statistics"""
        qs = self.get_queryset()
        
        return Response({
            'total_matches': qs.count(),
            'perfect_match': qs.filter(match_score__gte=90).count(),
            'excellent': qs.filter(match_score__gte=75, match_score__lt=90).count(),
            'good': qs.filter(match_score__gte=60, match_score__lt=75).count(),
            'avg_score': qs.aggregate(
                avg=models.Avg('match_score')
            )['avg'] or 0,
        })
    
    @action(detail=True, methods=['put'])
    def mark_saved(self, request, pk=None):
        """Save job match (équivalent à 'Intéressé' dans le suivi Kanban)"""
        match = self.get_object()
        match.user_saved = True
        if match.kanban_status == 'nouveau':
            match.kanban_status = 'interesse'
            match.status_updated_at = timezone.now()
        match.save()
        return Response({'success': True})
    
    @action(detail=True, methods=['put'])
    def mark_applied(self, request, pk=None):
        """Mark as applied (équivalent à 'Postulé' dans le suivi Kanban)"""
        match = self.get_object()
        match.user_applied = True
        match.kanban_status = 'postule'
        match.status_updated_at = timezone.now()
        match.save()
        return Response({'success': True})

    @action(detail=True, methods=['patch'], url_path='mark-viewed')
    def mark_viewed(self, request, pk=None):
        """
        Marque l'offre comme consultée — persisté en base, pas seulement
        en mémoire côté frontend, pour que l'effet "déjà lue" survive un
        changement de page ou une reconnexion.
        """
        match = self.get_object()
        if match.viewed_at is None:
            match.viewed_at = timezone.now()
            match.save(update_fields=['viewed_at'])
        return Response({'viewed': True})

    @action(detail=True, methods=['patch'], url_path='update_status')
    def update_status(self, request, pk=None):
        """
        Met à jour le statut de suivi (Kanban) et/ou les notes d'une
        candidature. Statut interchangeable librement, pas de transitions
        figées — c'est l'utilisateur qui décide où en est sa candidature.
        """
        match = self.get_object()
        valid_statuses = dict(JobMatch.KANBAN_STATUS_CHOICES)

        new_status = request.data.get('kanban_status')
        if new_status is not None:
            if new_status not in valid_statuses:
                return Response(
                    {'error': f"Statut invalide. Valeurs possibles : {', '.join(valid_statuses)}"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            previous_status = match.kanban_status
            if new_status != previous_status:
                JobMatchStatusEvent.objects.create(
                    match=match, from_status=previous_status, to_status=new_status
                )
                if new_status in ('entretien', 'offre') and match.user.notify_interview_offers:
                    Notification.objects.create(
                        user=match.user,
                        notification_type='interview_reached' if new_status == 'entretien' else 'offer_received',
                        title='Entretien obtenu' if new_status == 'entretien' else 'Offre reçue',
                        message=f"{match.job.title} chez {match.job.company_name}",
                        route='/suivi',
                    )
            match.kanban_status = new_status
            match.status_updated_at = timezone.now()
            # Garder les anciens booléens cohérents pour la rétrocompatibilité
            match.user_applied = new_status in ('postule', 'entretien', 'offre')
            match.user_saved = new_status != 'nouveau'

        if 'notes' in request.data:
            match.notes = (request.data.get('notes') or '')[:3000]

        if 'labels' in request.data:
            labels = request.data.get('labels')
            if isinstance(labels, list):
                match.labels = [
                    {'name': str(l.get('name', ''))[:40], 'color': str(l.get('color', '#94A3B8'))}
                    for l in labels if isinstance(l, dict) and l.get('name')
                ]

        match.save()
        serializer = self.get_serializer(match)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def timeline(self, request, pk=None):
        """Historique complet des changements de statut de cette candidature."""
        match = self.get_object()
        events = match.status_events.all()
        return Response([
            {
                'from_status': e.from_status,
                'to_status': e.to_status,
                'occurred_at': e.occurred_at.isoformat(),
            }
            for e in events
        ])

    @action(detail=True, methods=['get'], url_path='interview-prep')
    def interview_prep(self, request, pk=None):
        """
        Préparation d'entretien pour cette candidature précise — questions
        probables, technologies à réviser, points à valoriser, questions
        à poser. Connaissance générale du poste, pas une recherche en
        temps réel sur l'entreprise.
        """
        from jobs.content_ai import generate_interview_prep, ContentAIError

        match = self.get_object()
        try:
            prep = generate_interview_prep(
                match.job.title, match.job.company_name, match.job.description
            )
        except ContentAIError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED)

        return Response(prep)

    @action(detail=False, methods=['get'], url_path='label-palette')
    def label_palette(self, request):
        """
        Étiquettes déjà utilisées par l'utilisateur, pour proposer une
        palette cohérente (façon GitLab) plutôt que de retaper un nom et
        une couleur à chaque fois.
        """
        seen = {}
        for match in self.get_queryset().exclude(labels=[]):
            for label in (match.labels or []):
                name = label.get('name')
                if name and name not in seen:
                    seen[name] = label.get('color', '#94A3B8')
        return Response([{'name': n, 'color': c} for n, c in seen.items()])

    @action(detail=False, methods=['get'])
    def board(self, request):
        """
        Renvoie les matches groupés par colonne Kanban, prêts à afficher
        sans logique de regroupement côté frontend.
        """
        qs = self.get_queryset().exclude(kanban_status__in=['nouveau', 'pas_interesse']).order_by('-status_updated_at')
        serializer = self.get_serializer(qs, many=True)

        columns = {
            key: [] for key, _ in JobMatch.KANBAN_STATUS_CHOICES
            if key not in ('nouveau', 'pas_interesse')
        }
        for item in serializer.data:
            columns.setdefault(item['kanban_status'], []).append(item)

        return Response({'columns': columns})

    @action(detail=False, methods=['get'])
    def kpis(self, request):
        """
        Indicateurs réels du pipeline de candidatures : taux de réponse,
        entretiens obtenus, offres reçues, délai moyen, et candidatures
        en attente de relance.
        """
        from jobs.pipeline_service import (
            compute_pipeline_kpis, compute_followup_suggestions, analyze_interview_gap
        )

        profile = UserProfile.objects.get(user=request.user)
        return Response({
            **compute_pipeline_kpis(profile),
            'followup_suggestions': compute_followup_suggestions(profile),
            'interview_gap_insights': analyze_interview_gap(profile),
        })

    @action(detail=False, methods=['get'])
    def analytics(self, request):
        """Taux de réponse par tranche de score — vue Analytics du pipeline."""
        from jobs.pipeline_service import compute_score_bucket_analytics

        profile = UserProfile.objects.get(user=request.user)
        return Response({'score_buckets': compute_score_bucket_analytics(profile)})

    @action(detail=False, methods=['get'], url_path='timeline-feed')
    def timeline_feed(self, request):
        """Historique chronologique de toutes les candidatures — vue Timeline du pipeline."""
        from jobs.pipeline_service import compute_timeline

        profile = UserProfile.objects.get(user=request.user)
        return Response({'events': compute_timeline(profile)})

    @action(detail=False, methods=['post'])
    def simulate(self, request):
        """
        "Et si j'apprenais X ?" — recalcule le matching sur les offres
        déjà collectées en simulant l'ajout de compétences, sans rien
        modifier en base. Réutilise le vrai moteur de scoring.
        """
        from jobs.matching import simulate_skill_addition

        skills_to_add = request.data.get('skills', [])
        if not isinstance(skills_to_add, list) or not skills_to_add:
            return Response(
                {'error': "Le champ 'skills' doit être une liste non vide de compétences."},
                status=status.HTTP_400_BAD_REQUEST
            )

        profile = UserProfile.objects.get(user=request.user)
        result = simulate_skill_addition(profile, skills_to_add)
        return Response(result)

    @action(detail=False, methods=['get'])
    def skill_gap_summary(self, request):
        """
        Agrège les compétences manquantes (déjà calculées par match lors
        du scoring) pour montrer quelles compétences valent le plus la
        peine d'être développées — basé sur vos offres déjà collectées,
        aucune nouvelle donnée externe nécessaire. Inclut un score de
        couverture global et l'impact salarial des compétences les plus
        bloquantes (calculé sur vos propres offres, jamais une moyenne
        de marché externe).
        """
        from jobs.matching import aggregate_skill_gaps, simulate_skill_addition

        profile = UserProfile.objects.get(user=request.user)
        matches = self.get_queryset()
        total = matches.count()
        gaps = aggregate_skill_gaps(matches)

        # Score de couverture : part des compétences demandées dans vos
        # offres que vous possédez déjà.
        all_required = set()
        for match in matches.select_related('job'):
            all_required.update(match.job.required_skills or [])
        user_skills = set((profile.extracted_skills or {}).keys())
        coverage_score = (
            round(len(user_skills & all_required) / len(all_required) * 100, 1)
            if all_required else None
        )

        # Radar de salaire : impact individuel des 4 compétences manquantes
        # les plus fréquentes, calculé sur l'échantillon réel de l'utilisateur.
        salary_radar = []
        for gap in gaps[:4]:
            result = simulate_skill_addition(profile, [gap['skill']])
            salary_radar.append({
                'skill': gap['skill'],
                'salary_impact': result['salary_impact'],
                'sample_size': result['salary_sample_size'],
            })

        return Response({
            'total_offers': total,
            'gaps': gaps,
            'coverage_score': coverage_score,
            'salary_radar': salary_radar,
        })


class JobListingViewSet(viewsets.ReadOnlyModelViewSet):
    """Browse job listings"""
    
    serializer_class = JobListingSerializer
    permission_classes = [IsAuthenticated]
    queryset = JobListing.objects.filter(is_active=True)
    
    def get_queryset(self):
        qs = super().get_queryset()
        
        # Filter by company if provided
        company = self.request.query_params.get('company')
        if company:
            qs = qs.filter(company_name__icontains=company)
        
        # Filter by location
        location = self.request.query_params.get('location')
        if location:
            qs = qs.filter(location__icontains=location)
        
        # Filter by skill
        skill = self.request.query_params.get('skill')
        if skill:
            qs = qs.filter(required_skills__contains=[skill])
        
        return qs.order_by('-posted_date')


class CompanyContactViewSet(viewsets.ModelViewSet):
    """
    Suivi des entreprises à approcher pour du contact direct.
    Ne génère ni ne stocke aucune donnée de personne : uniquement le nom
    de l'entreprise + un statut de suivi. Le lien de recherche LinkedIn
    est construit côté frontend, jamais scrapé.
    """

    serializer_class = CompanyContactSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        profile = UserProfile.objects.get(user=self.request.user)
        qs = CompanyContact.objects.filter(user=profile)
        company_name = self.request.query_params.get('company_name')
        if company_name:
            qs = qs.filter(company_name=company_name)
        return qs.order_by('-updated_at')

    def perform_create(self, serializer):
        profile = UserProfile.objects.get(user=self.request.user)
        serializer.save(user=profile)

    @action(detail=False, methods=['post'])
    def sync_from_matches(self, request):
        """
        Parcourt les offres correspondantes actuelles de l'utilisateur et
        crée une fiche "à contacter" pour chaque entreprise pas encore
        suivie. N'écrase jamais le statut d'une fiche existante.
        """
        profile = UserProfile.objects.get(user=request.user)
        matches = JobMatch.objects.filter(user=profile).select_related('job')

        created_count = 0
        seen_companies = set()

        for match in matches:
            company = match.job.company_name
            if not company or company in seen_companies:
                continue
            seen_companies.add(company)

            _, created = CompanyContact.objects.get_or_create(
                user=profile,
                company_name=company,
                defaults={'source_job': match.job, 'status': 'a_contacter'}
            )
            if created:
                created_count += 1

        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({
            'new_contacts': created_count,
            'contacts': serializer.data
        })


class ContactViewSet(viewsets.ModelViewSet):
    """
    Personnes individuelles identifiées chez les entreprises suivies.
    CRUD complet : l'utilisateur saisit, modifie et supprime librement
    chaque fiche. Aucune création ou enrichissement automatique.
    """

    serializer_class = ContactSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        profile = UserProfile.objects.get(user=self.request.user)
        qs = Contact.objects.filter(user=profile)

        company_contact_id = self.request.query_params.get('company_contact')
        if company_contact_id:
            qs = qs.filter(company_contact_id=company_contact_id)

        return qs

    def perform_create(self, serializer):
        profile = UserProfile.objects.get(user=self.request.user)
        serializer.save(user=profile)

    @action(detail=True, methods=['post'], url_path='generate-message')
    def generate_message(self, request, pk=None):
        """
        Génère un message d'invitation, de relance ou un angle d'approche
        via Gemini, à partir du contexte du contact et, si fourni, d'une
        offre ciblée. Clutchr ne scrape jamais LinkedIn : c'est l'IA qui
        aide à formuler, jamais à collecter des données de profil.
        """
        from jobs.content_ai import generate_outreach_message, ContentAIError

        contact = self.get_object()
        message_type = request.data.get('message_type', 'invitation')
        job_context = request.data.get('job_context', '')

        if message_type not in ('invitation', 'relance', 'angle_approche'):
            return Response(
                {'error': "message_type doit être 'invitation', 'relance' ou 'angle_approche'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            message = generate_outreach_message(contact, message_type, job_context)
        except ContentAIError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED)

        return Response({'message': message})


class LinkedInPostViewSet(viewsets.ModelViewSet):
    """
    Posts LinkedIn sauvegardés — idées, brouillons, publiés. Permet le
    calendrier éditorial (jour assigné) et le Content Gap (compétences
    jamais abordées). Aucune publication automatique sur LinkedIn.
    """

    serializer_class = LinkedInPostSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        profile = UserProfile.objects.get(user=self.request.user)
        return LinkedInPost.objects.filter(user=profile)

    def _extract_topics(self, content: str, profile) -> list:
        """Compétences du profil mentionnées (correspondance textuelle simple) dans ce post."""
        content_lower = (content or '').lower()
        return [
            skill for skill in (profile.extracted_skills or {})
            if skill.lower() in content_lower
        ]

    def perform_create(self, serializer):
        profile = UserProfile.objects.get(user=self.request.user)
        topics = self._extract_topics(serializer.validated_data.get('content', ''), profile)
        serializer.save(user=profile, topics=topics)

    def perform_update(self, serializer):
        profile = UserProfile.objects.get(user=self.request.user)
        content = serializer.validated_data.get('content', serializer.instance.content)
        topics = self._extract_topics(content, profile)
        serializer.save(topics=topics)

    @action(detail=False, methods=['get'], url_path='content-gap')
    def content_gap(self, request):
        """
        Compétences du profil jamais abordées dans aucun post sauvegardé
        (idée, brouillon ou publié) — calculé depuis vos vrais posts,
        jamais une statistique d'engagement qu'on ne mesure pas.
        """
        profile = UserProfile.objects.get(user=request.user)
        posts = LinkedInPost.objects.filter(user=profile)

        covered_topics = set()
        for post in posts:
            covered_topics.update(post.topics or [])

        all_skills = set((profile.extracted_skills or {}).keys())
        never_covered = sorted(all_skills - covered_topics)

        return Response({
            'total_posts': posts.count(),
            'never_covered': never_covered,
            'covered': sorted(covered_topics & all_skills),
        })


class LinkedInContentViewSet(viewsets.ViewSet):
    """
    Module "Contenu LinkedIn" — analyse, reformulation, idées de posts.
    Propulsé par Gemini ; renvoie une erreur claire (501) si GEMINI_API_KEY
    n'est pas configurée, plutôt que de planter.
    """
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['post'])
    def analyze(self, request):
        from jobs.content_ai import analyze_post, ContentAIError

        content = request.data.get('content', '')
        try:
            result = analyze_post(content)
        except ContentAIError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED)
        return Response(result)

    @action(detail=False, methods=['post'])
    def reformulate(self, request):
        from jobs.content_ai import reformulate, ContentAIError

        content = request.data.get('content', '')
        instruction = request.data.get('instruction', 'rends ce texte plus percutant')
        try:
            result = reformulate(content, instruction)
        except ContentAIError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED)
        return Response({'reformulated': result})

    @action(detail=False, methods=['get'])
    def ideas(self, request):
        """
        Idées de posts générées à partir de TOUTES les données du site :
        profil, compétences, lacunes détectées dans les offres ciblées,
        tendances tech GitHub, et activité de candidature en cours —
        pas seulement le profil brut.
        """
        from jobs.content_ai import generate_post_ideas, ContentAIError
        from jobs.matching import aggregate_skill_gaps
        from jobs.models import JobMatch, TechTrend

        profile = UserProfile.objects.get(user=request.user)
        matches = JobMatch.objects.filter(user=profile)

        skill_gaps = aggregate_skill_gaps(matches, limit=5)
        tech_trends = list(TechTrend.objects.filter(period='daily').order_by('rank')[:10].values('language'))

        status_counts = {}
        for status_key, status_label in JobMatch.KANBAN_STATUS_CHOICES:
            count = matches.filter(kanban_status=status_key).count()
            if count:
                status_counts[status_label] = count
        kanban_summary = ', '.join(f"{v} {k.lower()}" for k, v in status_counts.items()) or None

        try:
            ideas = generate_post_ideas(profile, skill_gaps=skill_gaps, tech_trends=tech_trends, kanban_summary=kanban_summary)
        except ContentAIError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED)
        return Response({'ideas': ideas})

    @action(detail=False, methods=['post'])
    def roadmap(self, request):
        """
        Feuille de route d'apprentissage générée à partir du profil, des
        lacunes de compétences détectées dans les offres déjà collectées,
        des tendances tech GitHub, et d'un objectif explicite optionnel
        (poste cible, salaire, ville, délai) — pour prioriser quoi
        apprendre en tenant compte du marché réel, pas une liste générique.
        """
        from jobs.content_ai import generate_learning_roadmap, ContentAIError
        from jobs.matching import aggregate_skill_gaps
        from jobs.models import JobMatch, TechTrend

        profile = UserProfile.objects.get(user=request.user)
        matches = JobMatch.objects.filter(user=profile)

        skill_gaps = aggregate_skill_gaps(matches, limit=8)
        tech_trends = list(TechTrend.objects.filter(period='daily').order_by('rank')[:10].values('language'))

        objective = {
            'target_role': request.data.get('target_role', ''),
            'target_salary': request.data.get('target_salary'),
            'target_location': request.data.get('target_location', ''),
            'timeframe_months': request.data.get('timeframe_months'),
        }

        try:
            roadmap = generate_learning_roadmap(
                profile, skill_gaps=skill_gaps, tech_trends=tech_trends, objective=objective
            )
        except ContentAIError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED)

        # Les suggestions textuelles de Gemini ("type de ressource") sont
        # complétées par de vraies vidéos YouTube — pas de scraping,
        # API officielle. Limité à la première compétence visée par
        # phase pour rester raisonnable en nombre d'appels.
        from utils.youtube import search_learning_resources

        for phase in roadmap.get('phases', []):
            competences = phase.get('competences_visees') or []
            if competences:
                phase['ressources_videos'] = search_learning_resources(competences[0], max_results=3)
            else:
                phase['ressources_videos'] = []

        return Response(roadmap)

    @action(detail=False, methods=['get'])
    def role_suggestions(self, request):
        """
        Suggère des postes additionnels à cibler, en s'appuyant sur le
        profil, les intitulés des offres qui ont le mieux matché (signal
        réel, pas déclaré), et les entreprises activement suivies dans
        le Kanban.
        """
        from jobs.content_ai import generate_role_suggestions, ContentAIError

        profile = UserProfile.objects.get(user=request.user)

        # Déduplication côté Python plutôt qu'un .distinct() combiné à
        # .order_by() sur des champs différents (comportement peu fiable
        # selon le moteur de base de données — SQLite vs PostgreSQL).
        top_matches = (
            JobMatch.objects.filter(user=profile)
            .select_related('job')
            .order_by('-match_score')[:30]
        )
        top_matched_titles = []
        for m in top_matches:
            if m.job.title not in top_matched_titles:
                top_matched_titles.append(m.job.title)
            if len(top_matched_titles) >= 10:
                break

        tracked_contacts = (
            CompanyContact.objects.filter(user=profile)
            .exclude(status='a_contacter')
            .order_by('-updated_at')[:8]
        )
        tracked_companies = []
        for c in tracked_contacts:
            if c.company_name not in tracked_companies:
                tracked_companies.append(c.company_name)

        try:
            suggestions = generate_role_suggestions(
                profile,
                top_matched_titles=top_matched_titles,
                tracked_companies=tracked_companies,
            )
        except ContentAIError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED)
        return Response({'suggestions': suggestions})


class TrendsViewSet(viewsets.ViewSet):
    """
    Module "Veille & Tendances" — deux sources distinctes :
    - skills_in_offers : calculé depuis VOS offres correspondantes déjà
      collectées (pas une fausse "tendance %", une présence actuelle réelle).
    - tech : scraping GitHub Trending (voir scrapers/github_trending.py).
    """
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def skills_in_offers(self, request):
        profile = UserProfile.objects.get(user=request.user)
        matches = JobMatch.objects.filter(user=profile).select_related('job')

        total = matches.count()
        if total == 0:
            return Response({'total_offers': 0, 'skills': []})

        counts = {}
        for match in matches:
            for skill in (match.job.required_skills or []):
                counts[skill] = counts.get(skill, 0) + 1

        ranked = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:12]
        skills = [
            {'skill': skill, 'count': count, 'share': round(count / total * 100, 1)}
            for skill, count in ranked
        ]
        return Response({'total_offers': total, 'skills': skills})

    @action(detail=False, methods=['get'])
    def tech(self, request):
        period = request.query_params.get('period', 'daily')
        trends = TechTrend.objects.filter(period=period).order_by('rank')[:15]
        serializer = TechTrendSerializer(trends, many=True)
        last_scraped = trends.first().scraped_at if trends.exists() else None
        return Response({'trends': serializer.data, 'last_scraped': last_scraped})

    @action(detail=False, methods=['post'], url_path='refresh-tech')
    def refresh_tech(self, request):
        from scrapers.github_trending import fetch_trending_repos

        period = request.data.get('period', 'daily')
        language = request.data.get('language', '')

        repos = fetch_trending_repos(language=language, since=period, limit=15)
        if not repos:
            return Response(
                {'error': "Impossible de récupérer les tendances GitHub pour le moment "
                          "(page inaccessible ou structure HTML modifiée — voir les logs serveur)."},
                status=status.HTTP_502_BAD_GATEWAY
            )

        TechTrend.objects.filter(period=period).delete()
        for repo in repos:
            TechTrend.objects.create(
                rank=repo['rank'], owner=repo['owner'], repo_name=repo['repo_name'],
                full_name=repo['full_name'], description=repo['description'],
                language=repo['language'], stars_total=repo['stars_total'],
                stars_period=repo['stars_period'], period=repo['period'], url=repo['url'],
            )

        return Response({'imported': len(repos)})


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Notifications in-app. Lecture seule côté création : elles ne sont
    jamais générées depuis le frontend, uniquement par les déclencheurs
    réels du backend (nouvelle offre excellente, entretien obtenu...).
    """

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        profile = UserProfile.objects.get(user=self.request.user)
        return Notification.objects.filter(user=profile)[:50]

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        profile = UserProfile.objects.get(user=request.user)
        count = Notification.objects.filter(user=profile, is_read=False).count()
        return Response({'unread_count': count})

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response({'is_read': True})

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        profile = UserProfile.objects.get(user=request.user)
        Notification.objects.filter(user=profile, is_read=False).update(is_read=True)
        return Response({'success': True})
