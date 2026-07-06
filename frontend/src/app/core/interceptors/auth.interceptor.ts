import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

/**
 * Attache le token aux requêtes, ET nettoie automatiquement un token
 * périmé/invalide en cas de 401 — sinon un vieux token bloque même les
 * endpoints publics (register/login), DRF rejette la requête avant même
 * de vérifier les permissions de la route.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem('auth_token');

  const cloned = token
    ? req.clone({ setHeaders: { Authorization: `Token ${token}` } })
    : req;

  return next(cloned).pipe(
    catchError((err) => {
      if (err?.status === 401 && token) {
        // Token périmé/invalide : on nettoie pour ne pas bloquer les
        // prochaines requêtes (y compris vers des endpoints publics).
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        if (!req.url.includes('/auth/login') && !req.url.includes('/auth/register')) {
          router.navigate(['/connexion']);
        }
      }
      return throwError(() => err);
    })
  );
};
