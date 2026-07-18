import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { NotifyService } from '../notify/notify.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notify = inject(NotifyService);

  if (auth.isAuthenticated()) {
    return true;
  }

  notify.alert('Connexion requise', 'Connectez-vous pour accéder à cette page.');
  router.navigate(['/connexion']);
  return false;
};
