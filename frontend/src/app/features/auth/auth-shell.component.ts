import { Component, OnInit, signal, AfterViewInit, ElementRef, ViewChild, NgZone } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ClutchrLogoComponent } from '../../shared/clutchr-logo.component';
import { IconComponent } from '../../shared/icon.component';
import { GOOGLE_CLIENT_ID } from '../../core/config';

type AuthMode = 'login' | 'register' | 'forgot' | 'twofa';

declare const google: any;

/**
 * Socle d'authentification — un seul canevas en dégradé continu
 * (façon Stripe/Linear), la carte flotte dessus. Pas de panneau coupé
 * en deux : le dégradé envahit tout le fond.
 */
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, ClutchrLogoComponent, IconComponent],
  template: `
  <div class="auth-shell">
    <div class="bg-gradient"></div>
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>

    <div class="content">
      <div class="brand-zone">
        <app-clutchr-logo [size]="46" [withWordmark]="true" [onDark]="true"></app-clutchr-logo>

        <h1 class="tagline">
          Votre carrière,<br><span class="tagline-accent">synchronisée.</span>
        </h1>
        <p class="tagline-sub">
          Clutchr vous aide à trouver les meilleures opportunités, développer votre réseau
          et atteindre vos objectifs. Toujours un pas devant.
        </p>
      </div>

      <div class="auth-card" [class.shake]="shaking()">

        <!-- LOGIN -->
        <ng-container *ngIf="mode() === 'login'">
          <h2 class="auth-title">
            Bienvenue sur <span>Clutch<span class="brand-r">r</span></span>
          </h2>
          <p class="muted auth-title">Connectez-vous à votre compte ! </p>

          <div class="alert-error" *ngIf="errorMessage()">{{ errorMessage() }}</div>

          <div class="google-zone">
            <div #googleBtnLogin class="google-btn-host"></div>
            <button *ngIf="!googleReady" type="button" class="btn-google" (click)="onGoogleFallback()">
              <span class="g-icon">G</span> Continuer avec Google
            </button>
          </div>

          <div class="divider"><span>ou</span></div>

          <form (ngSubmit)="onLogin()">
            <div class="form-group">
              <label>Email</label>
              <input type="text" name="username" [(ngModel)]="username" placeholder="vous&#64;exemple.com" required autocomplete="username">
            </div>
            <div class="form-group">
              <label>Mot de passe</label>
              <input type="password" name="password" [(ngModel)]="password" placeholder="••••••••" required autocomplete="current-password">
            </div>
            <a class="forgot-link" (click)="switchMode('forgot')">Mot de passe oublié ?</a>
            <button type="submit" class="btn-submit" [disabled]="loading()">
              {{ loading() ? 'Connexion...' : 'Se connecter' }}
            </button>
          </form>

          <p class="switch-auth">Pas encore de compte ? <a (click)="switchMode('register')">Créer un compte</a></p>
        </ng-container>

        <!-- REGISTER -->
        <ng-container *ngIf="mode() === 'register'">
          <h2 class="auth-title">
            Créer votre compte <span class="brand-r">gratuitement</span>
          </h2>
          <p class="muted auth-title">Rejoignez Clutchr en quelques secondes !</p>

          <div class="alert-error" *ngIf="errorMessage()">{{ errorMessage() }}</div>

          <div class="google-zone">
            <div #googleBtnRegister class="google-btn-host"></div>
            <button *ngIf="!googleReady" type="button" class="btn-google" (click)="onGoogleFallback()">
              <span class="g-icon">G</span> Continuer avec Google
            </button>
          </div>

          <div class="divider"><span>ou</span></div>

          <form (ngSubmit)="onRegister()">
            <div class="form-group">
              <label>Nom complet</label>
              <input type="text" name="fullName" [(ngModel)]="fullName" placeholder="Wendy Raz" required autocomplete="name">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" name="email" [(ngModel)]="email" placeholder="wendy&#64;exemple.com" required autocomplete="email">
            </div>
            <div class="form-group">
              <label>Nom d'utilisateur</label>
              <input type="text" name="regUsername" [(ngModel)]="regUsername" placeholder="wendyraz" required autocomplete="username">
            </div>
            <div class="form-group">
              <label>Mot de passe</label>
              <input type="password" name="regPassword" [(ngModel)]="regPassword" placeholder="••••••••" required minlength="8" autocomplete="new-password">
              <span class="strength" *ngIf="regPassword" [class.strong]="regPassword.length >= 10">
                {{ regPassword.length >= 10 ? '● Solide' : '● Minimum 8 caractères' }}
              </span>
            </div>
            <button type="submit" class="btn-submit" [disabled]="loading()">
              {{ loading() ? 'Création...' : 'Créer mon compte' }}
            </button>
          </form>

          <p class="switch-auth">Déjà un compte ? <a (click)="switchMode('login')">Se connecter</a></p>
        </ng-container>

        <!-- FORGOT PASSWORD -->
        <ng-container *ngIf="mode() === 'twofa'">
          <h2>Vérification en deux étapes</h2>
          <p class="muted">Saisissez le code à 6 chiffres de votre application d'authentification.</p>

          <div class="alert-error" *ngIf="errorMessage()">{{ errorMessage() }}</div>

          <form (ngSubmit)="onTwoFactorSubmit()">
            <div class="form-group">
              <label>Code de vérification</label>
              <input type="text" name="twofaCode" [(ngModel)]="twoFactorCode" placeholder="000000" maxlength="8" required autofocus>
            </div>
            <button type="submit" class="btn-primary" [disabled]="loading()">
              {{ loading() ? 'Vérification...' : 'Valider' }}
            </button>
          </form>
          <p class="switch-auth"><a (click)="switchMode('login')">Retour à la connexion</a></p>
        </ng-container>

        <ng-container *ngIf="mode() === 'forgot'">
          <h2 class="auth-title">
            Mot de passe <span class="brand-r">oublié</span>
          </h2>
          <p class="muted auth-title">Indiquez votre e-mail, nous vous envoyons un lien de réinitialisation.</p>

          <div class="alert-error" *ngIf="errorMessage()">{{ errorMessage() }}</div>
          <div class="alert-success" *ngIf="resetSent()">
            Si un compte existe avec cet e-mail, un lien de réinitialisation vient d'être envoyé.
          </div>

          <form (ngSubmit)="onForgotPassword()" *ngIf="!resetSent()">
            <div class="form-group">
              <label>E-mail</label>
              <input type="email" name="resetEmail" [(ngModel)]="resetEmail" placeholder="vous&#64;exemple.com" required>
            </div>
            <button type="submit" class="btn-submit" [disabled]="loading()">
              {{ loading() ? 'Envoi...' : 'Envoyer le lien' }}
            </button>
          </form>

          <p class="switch-auth"><a (click)="switchMode('login')">← Retour à la connexion</a></p>
        </ng-container>

      </div>
    </div>
  </div>
  `,
  styles: [`
    :host { display: block; }
    .auth-shell {
      position: relative;
      min-height: 100vh;
      overflow: hidden;
      background: #0E0B1A;
      font-family: 'Inter', sans-serif;
    }

    .bg-gradient {
      position: absolute; inset: 0; z-index: 0;
      background: linear-gradient(135deg, #15102B 0%, #2A1B54 35%, #4B2E8C 65%, #15102B 100%);
    }
    .bg-orb { position: absolute; border-radius: 50%; filter: blur(80px); z-index: 0; pointer-events: none; }
    .orb-1 { width: 480px; height: 480px; background: rgba(248, 87, 193, 0.25); top: -120px; right: 8%; }
    .orb-2 { width: 380px; height: 380px; background: rgba(124, 92, 255, 0.3); bottom: -100px; left: 5%; }

    .content {
      position: relative; z-index: 1;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; gap: 48px; padding: 40px 24px;
    }

    .auth-title {
      text-align: center;
      font-size: 24px;
      font-weight: 700;
      color: #0F172A;
    }

    .auth-title span {
      color: #0F172A;
    }

    .brand-r {
      background: linear-gradient(135deg, #7C5CFF, #F857C1);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent !important;
    }

    @media (min-width: 1024px) {
      .content { flex-direction: row; align-items: center; justify-content: center; gap: 110px; }
    }

    .brand-zone { max-width: 520px; color: white; text-align: center; }
    @media (min-width: 1024px) { .brand-zone { text-align: left; } }

    .tagline { font-size: 2.8rem; font-weight: 700; line-height: 1.15; margin: 32px 0 18px; letter-spacing: -0.02em; }
    .tagline-accent { background: linear-gradient(90deg, #F857C1, #B7A6FF); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .tagline-sub { color: rgba(255,255,255,0.7); font-size: 16.5px; line-height: 1.65; }

    .auth-card {
      width: 100%; max-width: 480px; background: white; border-radius: 26px; padding: 48px 44px;
      box-shadow: 0 24px 60px rgba(10, 5, 30, 0.35);
      animation: card-in .5s cubic-bezier(.2,.8,.2,1) both;
    }
    @keyframes card-in { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform:none; } }
    .auth-card.shake { animation: shake .4s; }
    @keyframes shake { 0%,100%{transform:translateX(0);} 25%{transform:translateX(-6px);} 75%{transform:translateX(6px);} }

    .auth-card h2 { font-size: 22px; font-weight: 600; margin-bottom: 4px; color: #0F172A; }
    .muted { color: #64748B; font-size: 13.5px; margin-bottom: 22px; }

    .google-zone { min-height: 44px; margin-bottom: 4px; }
    .google-btn-host { display: flex; justify-content: center; }
    .btn-google {
      width: 100%; padding: 12px; border: 1.5px solid #E6E9EF; border-radius: 12px; background: white;
      display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 13.5px; font-weight: 500;
      color: #334155; transition: background 150ms;
    }
    .btn-google:hover { background: #F8FAFC; }
    .g-icon { font-weight: 700; color: #4285F4; font-family: Georgia, serif; }

    .divider { display: flex; align-items: center; text-align: center; margin: 18px 0; color: #94A3B8; font-size: 12.5px; }
    .divider::before, .divider::after { content: ''; flex: 1; border-bottom: 1px solid #EEF1F6; }
    .divider span { padding: 0 12px; }

    .form-group { margin-bottom: 14px; position: relative; }
    .form-group label { display: block; font-size: 12.5px; font-weight: 600; margin-bottom: 6px; color: #334155; }
    .form-group input {
      width: 100%; padding: 13px 16px; border: 1.5px solid #E6E9EF; border-radius: 12px; font-size: 14.5px;
      transition: border-color 150ms, box-shadow 150ms;
    }
    .form-group input:focus { outline: none; border-color: #7C5CFF; box-shadow: 0 0 0 3px rgba(124,92,255,0.12); }
    .strength { font-size: 11.5px; color: #F59E0B; margin-top: 5px; display: block; }
    .strength.strong { color: #2DD4BF; }

    .forgot-link { display: block; text-align: right; font-size: 12.5px; color: #7C5CFF; margin-bottom: 18px; cursor: pointer; font-weight: 500; }

    .btn-submit {
      width: 100%; padding: 13px; border: none; border-radius: 12px; color: white; font-weight: 600;
      font-size: 14px; cursor: pointer; transition: transform 150ms, box-shadow 150ms;
      background: linear-gradient(135deg, #7C5CFF, #6645E0);
    }
    .btn-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(124,92,255,0.3); }
    .btn-submit:disabled { opacity: 0.55; cursor: not-allowed; }

    .switch-auth { text-align: center; font-size: 12.5px; color: #64748B; margin-top: 22px; }
    .switch-auth a { color: #7C5CFF; font-weight: 600; cursor: pointer; }

    .alert-error { background: #FEF2F2; color: #DC2626; padding: 10px 14px; border-radius: 10px; font-size: 12.5px; margin-bottom: 16px; }
    .alert-success { background: #ECFDF5; color: #0D9488; padding: 10px 14px; border-radius: 10px; font-size: 12.5px; margin-bottom: 16px; }

    @media (max-width: 1023px) {
      .tagline { font-size: 2rem; }
      .auth-card { padding: 36px 28px; }
    }
  `]
})
export class AuthShellComponent implements OnInit, AfterViewInit {
  @ViewChild('googleBtnLogin') googleBtnLogin?: ElementRef;
  @ViewChild('googleBtnRegister') googleBtnRegister?: ElementRef;

  mode = signal<AuthMode>('login');
  twoFactorCode = '';
  pendingToken = '';
  loading = signal(false);
  errorMessage = signal('');
  resetSent = signal(false);
  shaking = signal(false);
  googleReady = false;

  username = '';
  password = '';

  fullName = '';
  email = '';
  regUsername = '';
  regPassword = '';

  resetEmail = '';

constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private ngZone: NgZone
) {}

  ngOnInit() {
    const initial = this.route.snapshot.data['mode'] as AuthMode | undefined;
    if (initial) this.mode.set(initial);
  }

  ngAfterViewInit() {
    if (GOOGLE_CLIENT_ID) {
      this.loadGoogleScript().then(() => this.setupGoogle());
    }
  }

  switchMode(next: AuthMode) {
    this.errorMessage.set('');
    this.resetSent.set(false);
    this.mode.set(next);
    const path = next === 'register' ? '/inscription' : next === 'forgot' ? '/mot-de-passe-oublie' : '/connexion';
    this.location.replaceState(path);

    setTimeout(() => this.setupGoogle(), 0);
  }

  private fail(message: string) {
    this.errorMessage.set(message);
    this.shaking.set(false);
    setTimeout(() => this.shaking.set(true), 10);
    this.loading.set(false);
  }

  onLogin() {
    if (!this.username || !this.password) return;
    this.loading.set(true);
    this.errorMessage.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.requires_2fa) {
          this.pendingToken = res.pending_token || '';
          this.mode.set('twofa');
          return;
        }
        this.router.navigate([res.profile_complete ? '/tableau-de-bord' : '/import-profil']);
      },
      error: (err) => this.fail(AuthService.extractErrorMessage(err) || 'Identifiants invalides.')
    });
  }

  onTwoFactorSubmit() {
    if (!this.twoFactorCode || !this.pendingToken) return;
    this.loading.set(true);
    this.errorMessage.set('');
    this.auth.confirmTwoFactorLogin(this.pendingToken, this.twoFactorCode).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.router.navigate([res.profile_complete ? '/tableau-de-bord' : '/import-profil']);
      },
      error: (err) => this.fail(AuthService.extractErrorMessage(err) || 'Code invalide.')
    });
  }

  onRegister() {
    if (!this.fullName || !this.email || !this.regUsername || !this.regPassword) return;
    this.loading.set(true);
    this.errorMessage.set('');
    const [firstName, ...rest] = this.fullName.trim().split(' ');
    this.auth.register(this.regUsername, this.email, this.regPassword, firstName, rest.join(' ')).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/import-profil']);
      },
      error: (err) => this.fail(AuthService.extractErrorMessage(err))
    });
  }

  onForgotPassword() {
    if (!this.resetEmail) return;
    this.loading.set(true);
    this.errorMessage.set('');
    this.auth.requestPasswordReset(this.resetEmail).subscribe({
      next: () => { this.loading.set(false); this.resetSent.set(true); },
      error: (err) => this.fail(AuthService.extractErrorMessage(err))
    });
  }

  // --- Google Identity Services (best effort, nécessite GOOGLE_CLIENT_ID) ---

  private loadGoogleScript(): Promise<void> {
    return new Promise((resolve) => {
      if ((window as any).google?.accounts?.id) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }
  private setupGoogle() {
    try {
      const clientId = GOOGLE_CLIENT_ID.trim();

      google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp: any) => this.handleGoogleCredential(resp.credential)
      });

      this.googleReady = true;

      const host =
          this.mode() === 'register'
              ? this.googleBtnRegister
              : this.googleBtnLogin;

      if (host?.nativeElement) {
        host.nativeElement.innerHTML = '';

        google.accounts.id.renderButton(host.nativeElement, {
          theme: 'outline',
          size: 'large',
          width: 320,
          locale: 'fr'
        });
      }
    } catch {
      this.googleReady = false;
    }
  }

  private handleGoogleCredential(idToken: string) {
    this.loading.set(true);
    this.auth.loginWithGoogle(idToken).subscribe({
      next: (res) => {
        this.loading.set(false);
       	this.ngZone.run(() => {
	    this.router.navigate([
	      res.profile_complete ? '/tableau-de-bord' : '/import-profil'
	    ]);
	  });
      },
      error: (err) => this.fail(AuthService.extractErrorMessage(err) || 'Connexion Google indisponible.')
    });
  }

  onGoogleFallback() {
    this.errorMessage.set(
      "La connexion Google n'est pas encore configurée. Renseignez GOOGLE_CLIENT_ID côté frontend (src/app/core/config.ts) et backend (.env) pour l'activer."
    );
    this.shaking.set(false);
    setTimeout(() => this.shaking.set(true), 10);
  }
}
