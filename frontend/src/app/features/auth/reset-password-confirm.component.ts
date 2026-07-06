import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ClutchrLogoComponent } from '../../shared/clutchr-logo.component';

@Component({
  selector: 'app-reset-password-confirm',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ClutchrLogoComponent],
  template: `
  <div class="page">
    <div class="card">
      <app-clutchr-logo [size]="40" [withWordmark]="true" class="logo"></app-clutchr-logo>

      <ng-container *ngIf="!success()">
        <h2>Nouveau mot de passe</h2>
        <p class="muted">Choisissez un nouveau mot de passe pour votre compte.</p>

        <div class="alert-error" *ngIf="errorMessage()">{{ errorMessage() }}</div>

        <form (ngSubmit)="submit()" *ngIf="validLink">
          <div class="form-group">
            <label>Nouveau mot de passe</label>
            <input type="password" [(ngModel)]="newPassword" name="newPassword" minlength="8" required placeholder="••••••••">
          </div>
          <button class="btn-submit" [disabled]="loading()">
            {{ loading() ? 'Mise à jour...' : 'Réinitialiser le mot de passe' }}
          </button>
        </form>

        <p class="muted" *ngIf="!validLink">Lien invalide ou incomplet. Demandez un nouveau lien depuis la page de connexion.</p>
      </ng-container>

      <ng-container *ngIf="success()">
        <h2>Mot de passe mis à jour</h2>
        <p class="muted">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
      </ng-container>

      <p class="back"><a routerLink="/connexion">← Retour à la connexion</a></p>
    </div>
  </div>
  `,
  styles: [`
    .page { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f7fa; font-family:'Inter',sans-serif; padding:20px; }
    .card { width:100%; max-width:480px; background:white; border-radius:24px; padding:48px 44px; box-shadow:0 12px 40px rgba(20,10,40,0.1); }
    .logo { margin-bottom: 22px; display:block; }
    h2 { font-size:24px; margin-bottom:4px; }
    .muted { color:#888; font-size:14px; margin-bottom:22px; }
    .form-group { margin-bottom:18px; }
    .form-group label { display:block; font-size:13px; font-weight:600; margin-bottom:6px; }
    .form-group input { width:100%; padding:12px 14px; border:1.5px solid #e5e5e5; border-radius:10px; font-size:14px; }
    .form-group input:focus { outline:none; border-color:#7C5CFF; box-shadow:0 0 0 3px rgba(124,58,237,0.1); }
    .btn-submit { width:100%; padding:13px; border:none; border-radius:10px; background:linear-gradient(90deg,#7C5CFF,#6645E0); color:white; font-weight:600; cursor:pointer; }
    .btn-submit:disabled { opacity:.6; cursor:not-allowed; }
    .alert-error { background:#fef2f2; color:#dc2626; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:16px; }
    .back { text-align:center; margin-top:20px; font-size:13px; }
    .back a { color:#7C5CFF; font-weight:600; text-decoration:none; }
  `]
})
export class ResetPasswordConfirmComponent implements OnInit {
  uid = '';
  token = '';
  validLink = false;
  newPassword = '';
  loading = signal(false);
  success = signal(false);
  errorMessage = signal('');

  constructor(private route: ActivatedRoute, private auth: AuthService, private router: Router) {}

  ngOnInit() {
    this.uid = this.route.snapshot.queryParamMap.get('uid') || '';
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    this.validLink = !!this.uid && !!this.token;
  }

  submit() {
    if (!this.newPassword) return;
    this.loading.set(true);
    this.errorMessage.set('');
    this.auth.confirmPasswordReset(this.uid, this.token, this.newPassword).subscribe({
      next: () => { this.loading.set(false); this.success.set(true); },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(AuthService.extractErrorMessage(err));
      }
    });
  }
}
