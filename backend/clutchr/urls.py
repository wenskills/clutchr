"""
URL routing for Clutchr API
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from rest_framework.authtoken.views import obtain_auth_token
from drf_spectacular.views import SpectacularSwaggerView, SpectacularAPIView

from jobs.views import (
    AuthViewSet, UserProfileViewSet, JobMatchViewSet, JobListingViewSet,
    CompanyContactViewSet, LinkedInContentViewSet, TrendsViewSet, ContactViewSet,
    NotificationViewSet, LinkedInPostViewSet
)

router = DefaultRouter()
router.register(r'profile', UserProfileViewSet, basename='profile')
router.register(r'matches', JobMatchViewSet, basename='match')
router.register(r'jobs', JobListingViewSet, basename='job')
router.register(r'contacts', CompanyContactViewSet, basename='contact')
router.register(r'people', ContactViewSet, basename='person')
router.register(r'linkedin', LinkedInContentViewSet, basename='linkedin')
router.register(r'linkedin-posts', LinkedInPostViewSet, basename='linkedin-post')
router.register(r'trends', TrendsViewSet, basename='trend')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    # Admin
    path('admin/', admin.site.urls),
    
    # API v1
    path('api/v1/', include(router.urls)),
    
    # Auth endpoints
    path('api/v1/auth/register/', AuthViewSet.as_view({'post': 'register'}), name='register'),
    path('api/v1/auth/login/', AuthViewSet.as_view({'post': 'login'}), name='login'),
    path('api/v1/auth/logout/', AuthViewSet.as_view({'post': 'logout'}), name='logout'),
    path('api/v1/auth/password-reset/', AuthViewSet.as_view({'post': 'password_reset'}), name='password-reset'),
    path('api/v1/auth/password-reset-confirm/', AuthViewSet.as_view({'post': 'password_reset_confirm'}), name='password-reset-confirm'),
    path('api/v1/auth/google/', AuthViewSet.as_view({'post': 'google'}), name='google-auth'),
    path('api/v1/auth/2fa-login/', AuthViewSet.as_view({'post': 'two_factor_login'}), name='2fa-login'),
    path('api/v1/auth/2fa-setup/', AuthViewSet.as_view({'post': 'two_factor_setup'}), name='2fa-setup'),
    path('api/v1/auth/2fa-confirm/', AuthViewSet.as_view({'post': 'two_factor_confirm'}), name='2fa-confirm'),
    path('api/v1/auth/2fa-disable/', AuthViewSet.as_view({'post': 'two_factor_disable'}), name='2fa-disable'),
    path('api/v1/auth/2fa-status/', AuthViewSet.as_view({'get': 'two_factor_status'}), name='2fa-status'),
    path('api/v1/auth/account-status/', AuthViewSet.as_view({'get': 'account_status'}), name='account-status'),
    path('api/v1/auth/change-email/', AuthViewSet.as_view({'post': 'change_email'}), name='change-email'),
    path('api/v1/auth/change-password/', AuthViewSet.as_view({'post': 'change_password'}), name='change-password'),
    
    # Token auth
    path('api-token-auth/', obtain_auth_token),
    
    # API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='docs'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
