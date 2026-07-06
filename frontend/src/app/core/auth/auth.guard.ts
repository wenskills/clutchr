import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { NotifyService } from '../notify/notify.service';

/**
 * Bloque l'accès aux pages protégées avant même qu'elles ne chargent
 * (pas après coup, une fois la page déjà affichée vide). Sans token
 * valide en local, on redirige directement vers /connexion avec un
 * message — jamais d'accès, même partiel, au contenu derrière.
 */
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
