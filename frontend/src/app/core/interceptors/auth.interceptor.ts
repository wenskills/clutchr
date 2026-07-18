import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem('auth_token');

  const cloned = token
    ? req.clone({ setHeaders: { Authorization: `Token ${token}` } })
    : req;

  return next(cloned).pipe(
    catchError((err) => {
      if (err?.status === 401 && token) {
        // Token périmé/invalide : on nettoie pour ne pas bloquer
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
