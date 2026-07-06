import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarComponent } from '../../shared/sidebar.component';
import { IconComponent } from '../../shared/icon.component';
import { NotifyService } from '../../core/notify/notify.service';

interface AccountStatus {
  email: string;
  has_usable_password: boolean;
  is_google_account: boolean;
  two_factor_enabled: boolean;
}

type TwoFactorStep = 'idle' | 'qr' | 'recovery_codes';

/**
 * Paramètres — gestion du compte (pas de la carrière). Email, mot de
 * passe, authentification à deux facteurs, session.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, IconComponent],
  template: `
  <div class="layout">
    <app-sidebar active="/parametres"></app-sidebar>

    <main class="main">
      <header class="page-header"><h1>Paramètres</h1></header>


      <!-- COMPTE -->
      <div class="card">
        <div class="card-head"><h3>Compte</h3></div>

        <div class="row">
          <div>
            <div class="row-label">E-mail</div>
            <div class="row-value">{{ accountStatus()?.email }}</div>
          </div>
          <a class="row-action" *ngIf="!accountStatus()?.is_google_account" (click)="toggleEmailForm()">Modifier</a>
          <span class="google-badge" *ngIf="accountStatus()?.is_google_account">Compte Google</span>
        </div>

        <div class="inline-form" *ngIf="showEmailForm()">
          <input type="email" [(ngModel)]="newEmail" placeholder="Nouvelle adresse e-mail">
          <input type="password" [(ngModel)]="emailFormPassword" placeholder="Mot de passe actuel">
          <button class="btn-save" (click)="changeEmail()" [disabled]="savingEmail()">
            {{ savingEmail() ? 'Enregistrement...' : 'Confirmer' }}
          </button>
        </div>

        <div class="row" *ngIf="!accountStatus()?.is_google_account">
          <div>
            <div class="row-label">Mot de passe</div>
            <div class="row-value">••••••••</div>
          </div>
          <a class="row-action" (click)="togglePasswordForm()">Modifier</a>
        </div>

        <div class="inline-form" *ngIf="showPasswordForm()">
          <input type="password" [(ngModel)]="currentPassword" placeholder="Mot de passe actuel">
          <input type="password" [(ngModel)]="newPassword" placeholder="Nouveau mot de passe (8 caractères min.)">
          <button class="btn-save" (click)="changePassword()" [disabled]="savingPassword()">
            {{ savingPassword() ? 'Enregistrement...' : 'Confirmer' }}
          </button>
        </div>

        <p class="google-note" *ngIf="accountStatus()?.is_google_account">
          Ce compte est connecté via Google — l'e-mail et le mot de passe se gèrent depuis votre compte Google.
        </p>
      </div>

      <!-- SÉCURITÉ -->
      <div class="card">
        <div class="card-head"><h3>Authentification à deux facteurs</h3></div>

        <div class="row" *ngIf="twoFactorStep() === 'idle'">
          <div>
            <div class="row-value">{{ accountStatus()?.two_factor_enabled ? 'Activée' : 'Désactivée' }}</div>
            <div class="row-label" *ngIf="!accountStatus()?.two_factor_enabled">
              Protège votre compte avec un code à 6 chiffres en plus de votre mot de passe.
            </div>
          </div>
          <button class="btn-toggle-2fa" *ngIf="!accountStatus()?.two_factor_enabled" (click)="startTwoFactorSetup()">
            Activer
          </button>
          <button class="row-action danger" *ngIf="accountStatus()?.two_factor_enabled" (click)="showDisable2fa.set(true)">
            Désactiver
          </button>
        </div>

        <div class="inline-form" *ngIf="showDisable2fa()">
          <input type="password" [(ngModel)]="disable2faPassword" placeholder="Mot de passe actuel">
          <button class="btn-save danger" (click)="disableTwoFactor()">Confirmer la désactivation</button>
        </div>

        <div class="twofa-setup" *ngIf="twoFactorStep() === 'qr'">
          <p class="setup-instructions">
            Scannez ce code avec une application d'authentification (Google Authenticator, Authy, 1Password...),
            puis saisissez le code à 6 chiffres généré pour confirmer.
          </p>
          <img class="qr-image" [src]="qrCodeDataUri()" alt="QR code d'activation 2FA" *ngIf="qrCodeDataUri()">
          <p class="manual-key">Clé manuelle : <code>{{ twoFactorSecret() }}</code></p>

          <div class="inline-form">
            <input type="text" [(ngModel)]="confirmCode" placeholder="Code à 6 chiffres" maxlength="6">
            <button class="btn-save" (click)="confirmTwoFactor()" [disabled]="confirmingTwoFactor()">
              {{ confirmingTwoFactor() ? 'Vérification...' : 'Confirmer et activer' }}
            </button>
          </div>
        </div>

        <div class="twofa-recovery" *ngIf="twoFactorStep() === 'recovery_codes'">
          <p class="setup-instructions">
            2FA activée. Conservez ces codes de récupération dans un endroit sûr — chacun ne fonctionne qu'une fois,
            et ils sont le seul moyen de retrouver l'accès si vous perdez votre appareil. Ils ne seront plus jamais affichés.
          </p>
          <div class="recovery-codes">
            <code *ngFor="let c of recoveryCodes()">{{ c }}</code>
          </div>
          <button class="btn-save" (click)="finishTwoFactorSetup()">J'ai noté mes codes</button>
        </div>
      </div>

      <!-- NOTIFICATIONS -->
      <div class="card">
        <div class="card-head"><h3>Notifications</h3></div>

        <div class="row">
          <div>
            <div class="row-value">Nouvelle offre excellente</div>
            <div class="row-label">Offre à plus de 90 % de correspondance détectée lors d'une recherche</div>
          </div>
          <label class="toggle">
            <input type="checkbox" [(ngModel)]="notifyNewMatches" (change)="saveNotificationPrefs()">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="row">
          <div>
            <div class="row-value">Entretien &amp; offre reçue</div>
            <div class="row-label">Quand une candidature passe au statut Entretien ou Offre reçue</div>
          </div>
          <label class="toggle">
            <input type="checkbox" [(ngModel)]="notifyInterviewOffers" (change)="saveNotificationPrefs()">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- SESSION -->
      <div class="card">
        <div class="card-head"><h3>Session</h3></div>
        <button class="btn-danger" (click)="logout()">
          <app-icon name="log-out" [size]="15"></app-icon> Se déconnecter
        </button>
      </div>
    </main>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; }
    .layout { display:flex; min-height:100vh; background:#F5F7FA; }
    .main { flex:1; padding:32px 40px; max-width:760px; }
    .page-header h1 { font-size:24px; font-weight:600; margin-bottom:20px; }


    .card { background:white; border-radius:18px; padding:24px; box-shadow:0 1px 2px rgba(15,23,42,0.04); margin-bottom:16px; }
    .card-head h3 { font-size:15px; font-weight:600; margin-bottom:10px; }

    .row { display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #F8FAFC; }
    .row:last-child { border-bottom:none; }
    .row-label { font-size:12px; color:#94A3B8; margin-bottom:3px; max-width:380px; }
    .row-value { font-size:13.5px; font-weight:600; color:#0F172A; }
    .row-action { font-size:12.5px; color:#7C5CFF; font-weight:600; cursor:pointer; }
    .row-action.danger { color:#DC2626; }

    .google-badge { font-size:11px; background:#EFF6FF; color:#1D4ED8; padding:4px 10px; border-radius:999px; font-weight:600; }
    .google-note { font-size:12px; color:#94A3B8; margin-top:8px; }

    .inline-form { display:flex; flex-direction:column; gap:8px; padding:14px 0; }
    .inline-form input {
      padding:10px 13px; border:1.5px solid #E6E9EF; border-radius:10px; font-size:13px; font-family:inherit;
    }
    .inline-form input:focus { outline:none; border-color:#7C5CFF; }

    .btn-save { padding:10px 16px; border-radius:10px; background:#1B1C2A; color:white; font-size:13px; font-weight:600; }
    .btn-save:disabled { opacity:.5; cursor:not-allowed; }
    .btn-save.danger { background:#DC2626; }

    .btn-toggle-2fa { padding:9px 16px; border-radius:10px; background:#F1EEFF; color:#7C5CFF; font-size:12.5px; font-weight:600; }

    .twofa-setup, .twofa-recovery { padding-top:14px; border-top:1px solid #F8FAFC; margin-top:10px; }
    .setup-instructions { font-size:12.5px; color:#64748B; line-height:1.6; margin-bottom:14px; }
    .qr-image { display:block; width:180px; height:180px; margin:0 auto 12px; border-radius:10px; border:1px solid #E6E9EF; }
    .manual-key { text-align:center; font-size:12px; color:#94A3B8; margin-bottom:14px; }
    .manual-key code { background:#F8FAFC; padding:3px 8px; border-radius:6px; }

    .recovery-codes {
      display:grid; grid-template-columns:1fr 1fr; gap:8px; background:#F8FAFC; padding:14px; border-radius:10px; margin-bottom:14px;
    }
    .recovery-codes code { font-size:13px; text-align:center; padding:6px; background:white; border-radius:6px; }

    .toggle { position:relative; display:inline-block; width:40px; height:24px; flex-shrink:0; }
    .toggle input { opacity:0; width:0; height:0; }
    .toggle-slider {
      position:absolute; cursor:pointer; inset:0; background:#E2E8F0; border-radius:999px; transition: background 200ms;
    }
    .toggle-slider::before {
      content:''; position:absolute; height:18px; width:18px; left:3px; bottom:3px; background:white;
      border-radius:50%; transition: transform 200ms; box-shadow:0 1px 2px rgba(0,0,0,0.15);
    }
    .toggle input:checked + .toggle-slider { background:#7C5CFF; }
    .toggle input:checked + .toggle-slider::before { transform: translateX(16px); }

    .btn-danger {
      display:flex; align-items:center; gap:7px; padding:11px 18px; border-radius:11px;
      background:#FEF2F2; color:#DC2626; font-weight:600; font-size:13px;
    }
    .btn-danger:hover { background:#FEE2E2; }
  `]
})
export class SettingsComponent implements OnInit {
  private apiUrl = 'http://localhost:8000/api/v1';

  accountStatus = signal<AccountStatus | null>(null);

  showEmailForm = signal(false);
  newEmail = '';
  emailFormPassword = '';
  savingEmail = signal(false);

  showPasswordForm = signal(false);
  currentPassword = '';
  newPassword = '';
  savingPassword = signal(false);

  showDisable2fa = signal(false);
  disable2faPassword = '';

  twoFactorStep = signal<TwoFactorStep>('idle');
  qrCodeDataUri = signal('');
  twoFactorSecret = signal('');
  confirmCode = '';
  confirmingTwoFactor = signal(false);
  recoveryCodes = signal<string[]>([]);

  constructor(private auth: AuthService, private router: Router, private http: HttpClient, private notify: NotifyService) {}

  ngOnInit() {
    this.loadAccountStatus();
    this.loadNotificationPrefs();
  }

  notifyNewMatches = true;
  notifyInterviewOffers = true;

  private loadNotificationPrefs() {
    this.http.get<any>(`${this.apiUrl}/profile/me/`).subscribe({
      next: (res) => {
        this.notifyNewMatches = res.notify_new_matches ?? true;
        this.notifyInterviewOffers = res.notify_interview_offers ?? true;
      },
      error: () => {}
    });
  }

  saveNotificationPrefs() {
    this.http.put(`${this.apiUrl}/profile/update_preferences/`, {
      notify_new_matches: this.notifyNewMatches,
      notify_interview_offers: this.notifyInterviewOffers,
    }).subscribe({
      next: () => this.showToast('Préférences de notification mises à jour'),
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  private loadAccountStatus() {
    this.http.get<AccountStatus>(`${this.apiUrl}/auth/account-status/`).subscribe({
      next: (res) => this.accountStatus.set(res),
      error: () => {}
    });
  }

  toggleEmailForm() {
    this.showEmailForm.set(!this.showEmailForm());
  }

  changeEmail() {
    this.savingEmail.set(true);
    this.http.post<any>(`${this.apiUrl}/auth/change-email/`, {
      new_email: this.newEmail, password: this.emailFormPassword,
    }).subscribe({
      next: () => {
        this.savingEmail.set(false);
        this.showEmailForm.set(false);
        this.newEmail = '';
        this.emailFormPassword = '';
        this.showToast('E-mail mis à jour');
        this.loadAccountStatus();
      },
      error: (err) => {
        this.savingEmail.set(false);
        this.showToast(AuthService.extractErrorMessage(err), true);
      }
    });
  }

  togglePasswordForm() {
    this.showPasswordForm.set(!this.showPasswordForm());
  }

  changePassword() {
    this.savingPassword.set(true);
    this.http.post<any>(`${this.apiUrl}/auth/change-password/`, {
      current_password: this.currentPassword, new_password: this.newPassword,
    }).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.showPasswordForm.set(false);
        this.currentPassword = '';
        this.newPassword = '';
        this.showToast('Mot de passe mis à jour');
      },
      error: (err) => {
        this.savingPassword.set(false);
        this.showToast(AuthService.extractErrorMessage(err), true);
      }
    });
  }

  startTwoFactorSetup() {
    this.http.post<any>(`${this.apiUrl}/auth/2fa-setup/`, {}).subscribe({
      next: (res) => {
        this.qrCodeDataUri.set(res.qr_code);
        this.twoFactorSecret.set(res.secret);
        this.twoFactorStep.set('qr');
      },
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  confirmTwoFactor() {
    this.confirmingTwoFactor.set(true);
    this.http.post<any>(`${this.apiUrl}/auth/2fa-confirm/`, { code: this.confirmCode }).subscribe({
      next: (res) => {
        this.confirmingTwoFactor.set(false);
        this.recoveryCodes.set(res.recovery_codes || []);
        this.twoFactorStep.set('recovery_codes');
        this.confirmCode = '';
      },
      error: (err) => {
        this.confirmingTwoFactor.set(false);
        this.showToast(AuthService.extractErrorMessage(err), true);
      }
    });
  }

  finishTwoFactorSetup() {
    this.twoFactorStep.set('idle');
    this.recoveryCodes.set([]);
    this.showToast('Authentification à deux facteurs activée');
    this.loadAccountStatus();
  }

  disableTwoFactor() {
    this.http.post<any>(`${this.apiUrl}/auth/2fa-disable/`, { password: this.disable2faPassword }).subscribe({
      next: () => {
        this.showDisable2fa.set(false);
        this.disable2faPassword = '';
        this.showToast('Authentification à deux facteurs désactivée');
        this.loadAccountStatus();
      },
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  private showToast(msg: string, isError = false) {
    if (isError) this.notify.error('Oups', msg);
    else this.notify.success('Fait', msg);
  }

  logout() {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/connexion']),
      error: () => this.router.navigate(['/connexion'])
    });
  }
}
