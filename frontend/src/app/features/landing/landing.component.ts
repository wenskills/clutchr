import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ClutchrLogoComponent } from '../../shared/clutchr-logo.component';
import { IconComponent } from '../../shared/icon.component';
import { AuthService } from '../../core/auth/auth.service';

interface FeatureTab {
  key: string;
  label: string;
  title: string;
  description: string;
}

const FEATURE_TABS: FeatureTab[] = [
  { key: 'dashboard', label: 'Tableau de bord', title: 'Sachez quoi faire en arrivant',
    description: "Priorités du jour calculées depuis vos vraies données — pas un compteur d'offres qui ne dit rien." },
  { key: 'swipe', label: 'Swipe', title: 'Découvrez vos offres en un geste',
    description: 'Balayez à droite pour marquer votre intérêt, à gauche pour passer. La liste complète reste toujours accessible.' },
  { key: 'pipeline', label: 'Pipeline', title: 'Pilotez vos candidatures',
    description: "Taux de réponse, entretiens obtenus, relances suggérées — calculés depuis l'historique réel, jamais une estimation." },
  { key: 'roadmap', label: 'Roadmap', title: 'Apprenez ce qui compte vraiment',
    description: "Simulez l'impact d'une nouvelle compétence sur vos vraies offres collectées, avant d'y investir du temps." },
  { key: 'linkedin', label: 'Contenu LinkedIn', title: "Construisez votre visibilité",
    description: 'Analyse de post, reformulation, idées de contenu — pour attirer les recruteurs sans dépendre du hasard.' },
  { key: 'intelligence', label: 'Career Intelligence', title: 'Comprenez le marché',
    description: 'Compétences à fort impact, tendances réelles dans vos offres, écart avec ce que le marché demande.' },
];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, ClutchrLogoComponent, IconComponent],
  template: `
  <div class="page" (mousemove)="onMouseMove($event)">

    <header class="topbar">
      <app-clutchr-logo [size]="28" [withWordmark]="true" [animated]="true" [onDark]="true"></app-clutchr-logo>
      <nav class="topnav">
        <a href="#fonctionnalites">Fonctionnalités</a>
        <a href="#comment-ca-marche">Comment ça marche</a>
      </nav>
      <div class="topactions">
        <ng-container *ngIf="!isLoggedIn(); else loggedInActions">
          <a routerLink="/connexion" class="btn-ghost-nav">Se connecter</a>
          <a routerLink="/inscription" class="btn-glow">Créer mon compte</a>
        </ng-container>
        <ng-template #loggedInActions>
          <a routerLink="/tableau-de-bord" class="btn-glow">Aller à mon tableau de bord</a>
        </ng-template>
      </div>
    </header>

    <!-- HERO -->
    <section class="hero">
      <div class="aurora"></div>
      <div class="hero-content">
        <div class="hero-text reveal">
          <h1>Votre carrière<br>mérite un <span class="accent-text">copilote</span>.</h1>
          <p class="hero-sub">
            Clutchr centralise vos candidatures, analyse le marché, et vous guide vers
            les actions qui font vraiment avancer votre recherche.
          </p>
          <div class="hero-ctas">
            <a *ngIf="!isLoggedIn()" routerLink="/inscription" class="btn-glow large">Créer mon compte gratuitement</a>
            <a *ngIf="isLoggedIn()" routerLink="/tableau-de-bord" class="btn-glow large">Reprendre où j'en étais</a>
            <a href="#comment-ca-marche" class="btn-secondary">Voir comment ça marche</a>
          </div>
          <div class="trust-row">
            <span><app-icon name="check-circle" [size]="13"></app-icon> Gratuit pour commencer</span>
            <span><app-icon name="check-circle" [size]="13"></app-icon> Vos données restent les vôtres</span>
          </div>
        </div>

        <div class="hero-visual reveal" [style.transform]="parallaxTransform()">
          <div class="mock-window">
            <div class="mock-topbar">
              <app-clutchr-logo [size]="18"></app-clutchr-logo>
              <span>clutchr</span>
            </div>
            <div class="mock-body">
              <div class="mock-greeting">Bonjour Wendy</div>
              <div class="mock-row">
                <div class="mock-card mock-pulse">
                  <span class="mock-label">Traction</span>
                  <span class="mock-big">82</span>
                  <span class="mock-delta">+6 cette semaine</span>
                </div>
                <div class="mock-card">
                  <span class="mock-label">Offres &gt; 90%</span>
                  <span class="mock-big">3</span>
                </div>
                <div class="mock-card">
                  <span class="mock-label">Entretiens</span>
                  <span class="mock-big">2</span>
                </div>
              </div>
              <div class="mock-priority">
                <span class="mock-dot"></span> 3 nouvelles offres correspondent parfaitement
              </div>
              <div class="mock-priority">
                <span class="mock-dot"></span> Ajouter Kubernetes débloquerait 13 offres
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CHAPITRE : FRAGMENTATION -->
    <section class="problem reveal">
      <div class="problem-text">
        <h2>Trop d'outils.<br>Pas assez de résultats.</h2>
        <p>Entre les sites d'offres, les tableurs, LinkedIn et les notes éparpillées,
           il est difficile de savoir quoi faire et par où commencer.</p>
      </div>
      <div class="convergence">
        <div class="source-chip s1">LinkedIn</div>
        <div class="source-chip s2">Offres</div>
        <div class="source-chip s3">Notes</div>
        <div class="source-chip s4">Excel</div>
        <div class="source-chip s5">CV</div>
        <div class="source-chip s6">Relances</div>
        <div class="source-chip s7">Réseaux </div>
        <div class="source-chip s9">Compétences</div>
        <div class="convergence-pulse">
          <app-clutchr-logo [size]="42" [animated]="true"></app-clutchr-logo>
        </div>
      </div>
    </section>

    <!-- FONCTIONNALITÉS -->
    <section class="features" id="fonctionnalites">
      <h2 class="section-title reveal">Tout ce dont vous avez besoin pour avancer</h2>

      <div class="feature-grid">
        <div class="feature-card reveal" *ngFor="let f of featureCards">
          <div class="feature-icon"><app-icon [name]="f.icon" [size]="22" color="#7C5CFF"></app-icon></div>
          <h3>{{ f.title }}</h3>
          <p>{{ f.description }}</p>
        </div>
      </div>
    </section>

    <!-- ONGLETS INTERACTIFS -->
    <section class="showcase reveal">
      <h2 class="section-title">Découvrez le produit</h2>
      <div class="tab-bar">
        <button *ngFor="let t of tabs" [class.active]="activeTab === t.key" (click)="activeTab = t.key">
          {{ t.label }}
        </button>
      </div>
      <div class="showcase-panel">
        <div class="showcase-text">
          <h3>{{ currentTab().title }}</h3>
          <p>{{ currentTab().description }}</p>
        </div>
        <div class="showcase-visual">
          <div class="showcase-glow"></div>
          <div class="showcase-window">
            <app-icon [name]="iconForTab(activeTab)" [size]="40" color="#7C5CFF"></app-icon>
          </div>
        </div>
      </div>
    </section>

    <!-- COMMENT ÇA MARCHE -->
    <section class="how-it-works" id="comment-ca-marche">
      <h2 class="section-title reveal">Comment ça marche ?</h2>
      <div class="steps">
        <div class="step reveal" *ngFor="let s of steps; let i = index">
          <div class="step-number">{{ i + 1 }}</div>
          <h3>{{ s.title }}</h3>
          <p>{{ s.description }}</p>
        </div>
      </div>
    </section>

    <!-- CTA FINAL -->
    <section class="final-cta reveal">
      <div class="final-cta-inner">
        <h2>{{ isLoggedIn() ? 'Vos offres vous attendent' : 'Prêt à reprendre le contrôle de votre carrière ?' }}</h2>
        <p *ngIf="!isLoggedIn()">Créez votre compte et laissez Clutchr analyser vos premières offres en quelques minutes.</p>
        <p *ngIf="isLoggedIn()">Retrouvez vos correspondances, votre pipeline et vos recommandations du jour.</p>
        <a *ngIf="!isLoggedIn()" routerLink="/inscription" class="btn-glow large">Créer mon compte gratuitement</a>
        <a *ngIf="isLoggedIn()" routerLink="/tableau-de-bord" class="btn-glow large">Aller à mon tableau de bord</a>
      </div>
    </section>

    <footer class="footer">
      <app-clutchr-logo [size]="22"></app-clutchr-logo>
      <span class="footer-copy">Clutchr — votre carrière, pilotée.</span>
    </footer>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; background:#0F1017; color:#F5F5F7; overflow-x:hidden; }
    .page { position:relative; }
    .accent-text {
      background:linear-gradient(135deg,#F857C1,#7C5CFF,#22D3EE);
      -webkit-background-clip:text; background-clip:text; color:transparent;
    }

    /* Topbar */
    .topbar {
      display:flex; align-items:center; justify-content:space-between; padding:22px 48px;
      position:sticky; top:0; z-index:50; backdrop-filter:blur(14px); background:rgba(15,16,23,0.22);
      border-bottom:1px solid rgba(255,255,255,0.05);
    }
    .topnav { display:flex; gap:28px; }
    .topnav a { color:rgba(255,255,255,0.7); text-decoration:none; font-size:13.5px; font-weight:500; }
    .topnav a:hover { color:white; }
    .topactions { display:flex; align-items:center; gap:14px; }
    .btn-ghost-nav { color:rgba(255,255,255,0.85); text-decoration:none; font-size:13.5px; font-weight:600; }

    .btn-glow {
      position:relative; display:inline-flex; align-items:center; padding:11px 22px; border-radius:11px;
      background:linear-gradient(135deg,#7C5CFF,#F857C1); color:white; font-weight:600; font-size:13.5px;
      text-decoration:none; transition:transform 200ms; background-size:160% 160%; background-position:0% 0%;
    }
    .btn-glow:hover {
      transform:translateY(-2px); box-shadow:0 0 28px rgba(124,92,255,0.55); background-position:100% 100%;
      transition:transform 200ms, box-shadow 300ms, background-position 600ms;
    }
    .btn-glow.large { padding:14px 28px; font-size:14.5px; }

    .btn-secondary {
      display:inline-flex; align-items:center; padding:13px 24px; border-radius:11px;
      border:1.5px solid rgba(255,255,255,0.18); color:white; text-decoration:none; font-size:14px; font-weight:600;
    }
    .btn-secondary:hover { border-color:rgba(255,255,255,0.4); }

    /* Hero */
    .hero { position:relative; padding:90px 48px 60px; overflow:hidden; }
    .aurora {
      position:fixed; inset:0; height:100vh;
      background:
        radial-gradient(circle at 15% 10%, rgba(124,92,255,0.32), transparent 45%),
        radial-gradient(circle at 85% 15%, rgba(248,87,193,0.26), transparent 45%),
        radial-gradient(circle at 30% 75%, rgba(34,211,238,0.16), transparent 45%),
        radial-gradient(circle at 75% 85%, rgba(124,92,255,0.2), transparent 45%);
      animation: aurora-drift 22s ease-in-out infinite alternate;
      filter:blur(40px); z-index:0; pointer-events:none;
    }
    @keyframes aurora-drift {
      0% { transform: translate(0,0) rotate(0deg); }
      100% { transform: translate(40px,30px) rotate(8deg); }
    }

    .hero-content { position:relative; z-index:1; display:grid; grid-template-columns:1fr; gap:48px; max-width:1240px; margin:0 auto; align-items:center; }
    @media (min-width:980px) { .hero-content { grid-template-columns: 1fr 1.1fr; } }

    .eyebrow {
      display:inline-block; font-size:12px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
      color:#B7A6FF; background:rgba(124,92,255,0.12); padding:6px 14px; border-radius:999px; margin-bottom:18px;
    }
    .hero-text h1 { font-size:52px; font-weight:700; line-height:1.08; margin-bottom:20px; letter-spacing:-0.01em; }
    .hero-sub { font-size:16px; color:rgba(255,255,255,0.65); line-height:1.6; max-width:440px; margin-bottom:28px; }
    .hero-ctas { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:24px; }
    .trust-row { display:flex; gap:20px; font-size:12.5px; color:rgba(255,255,255,0.5); flex-wrap:wrap; }
    .trust-row span { display:flex; align-items:center; gap:6px; }

    .hero-visual { transition: transform 100ms ease-out; }
    .mock-window {
      background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:0;
      box-shadow:0 40px 90px rgba(0,0,0,0.5); animation: float 6s ease-in-out infinite;
      backdrop-filter: blur(8px);
    }
    @keyframes float { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-14px) rotate(1deg); } }
    .mock-topbar { display:flex; align-items:center; gap:8px; padding:14px 20px; border-bottom:1px solid rgba(255,255,255,0.07); font-size:12.5px; font-weight:600; color:rgba(255,255,255,0.7); }
    .mock-body { padding:24px; }
    .mock-greeting { font-size:16px; font-weight:600; margin-bottom:18px; }
    .mock-row { display:flex; gap:12px; margin-bottom:16px; }
    .mock-card { flex:1; background:rgba(255,255,255,0.04); border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:4px; }
    .mock-card.mock-pulse { background:linear-gradient(135deg, rgba(124,92,255,0.25), rgba(248,87,193,0.18)); }
    .mock-label { font-size:10.5px; color:rgba(255,255,255,0.5); }
    .mock-big { font-size:22px; font-weight:700; }
    .mock-delta { font-size:10px; color:#5EEAD4; }
    .mock-priority { display:flex; align-items:center; gap:9px; font-size:12px; color:rgba(255,255,255,0.75); padding:9px 0; border-top:1px solid rgba(255,255,255,0.06); }
    .mock-dot { width:6px; height:6px; border-radius:50%; background:#7C5CFF; flex-shrink:0; }

    /* Problem / convergence */
    .problem { max-width:1100px; margin:60px auto; padding:60px 48px; display:grid; grid-template-columns:1fr; gap:50px; align-items:center; }
    @media (min-width:900px) { .problem { grid-template-columns: 1fr 1fr; } }
    .problem-text h2 { font-size:34px; font-weight:700; margin-bottom:16px; }
    .problem-text p { color:rgba(255,255,255,0.6); font-size:15px; line-height:1.6; max-width:420px; }

    .convergence { position:relative; height:240px; }
    .source-chip {
      position:absolute; padding:9px 16px; border-radius:11px;
      border:1px solid rgba(255,255,255,0.16); font-size:12.5px; font-weight:700; color:white;
      animation: chip-drift 5s ease-in-out infinite;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    }
    .s1 { top:5px; left:80px; animation-delay:0s; background:linear-gradient(135deg, rgba(124,92,255,0.4), rgba(248,87,193,0.3)); }
    .s2 { top:170px; left:10px; animation-delay:1.2s;  background: linear-gradient(135deg, rgba(248,87,193,0.42), rgba(124,92,255,0.24)); }
    .s3 { top:75px; right:20px; animation-delay:0.6s; background: linear-gradient(135deg, rgba(248,87,193,0.42), rgba(34,211,238,0.18)); }
    .s4 { top:160px; right:30px; animation-delay:1.8s; background:linear-gradient(135deg, rgba(124,92,255,0.4), rgba(248,87,193,0.3)); }
    .s5 {
      top: 230px;
      left: 100px;
      animation-delay: .4s;
      background: linear-gradient(135deg, rgba(124,92,255,0.45), rgba(34,211,238,0.22));
    }

    .s6 {
      top: 0;
      left: 300px;
      animation-delay: 1s;
      background: linear-gradient(135deg, rgba(248,87,193,0.42), rgba(124,92,255,0.24));
    }

    .s7 {
      top: 220px;
      right: 125px;
      animation-delay: 1.4s;
      background: linear-gradient(135deg, rgba(34,211,238,0.42), rgba(124,92,255,0.24));
    }

    .s9 {
      top: 85px;
      left: 0px;
      animation-delay: 2s;
      background: linear-gradient(135deg, rgba(248,87,193,0.42), rgba(34,211,238,0.18));
    }
    @keyframes chip-drift { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    .convergence-lines { position:absolute; inset:0; width:100%; height:100%; }
    .convergence-lines .line {
      fill:none; stroke:rgba(124,92,255,0.45); stroke-width:2; stroke-dasharray:5 5;
      animation: line-flow 1.4s linear infinite;
    }
    @keyframes line-flow { to { stroke-dashoffset: -20; } }
    .convergence-pulse {
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      width:72px; height:72px; border-radius:50%; display:flex; align-items:center; justify-content:center;
      background: radial-gradient(circle, rgba(124,92,255,0.35), transparent 70%);
    }
    .convergence-pulse::before {
      content:''; position:absolute; inset:0; border-radius:50%;
      background: radial-gradient(circle, rgba(248,87,193,0.3), transparent 65%);
      animation: pulse-glow 2.4s ease-in-out infinite; filter: blur(8px);
    }
    @keyframes pulse-glow { 0%,100% { opacity:0.5; transform:scale(0.9); } 50% { opacity:1; transform:scale(1.15); } }

    /* Features */
    .features { max-width:1200px; margin:80px auto; padding:0 48px; }
    .section-title { text-align:center; font-size:30px; font-weight:700; margin-bottom:44px; }
    .feature-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:20px; }
    @media (min-width:768px) { .feature-grid { grid-template-columns:repeat(3,1fr); } }
    .feature-card {
      background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:20px; padding:26px;
      transition: transform 200ms, border-color 200ms;
    }
    .feature-card:hover { transform:translateY(-4px); border-color:rgba(124,92,255,0.4); }
    .feature-icon {
      width:44px; height:44px; border-radius:12px; background:rgba(124,92,255,0.12);
      display:flex; align-items:center; justify-content:center; margin-bottom:16px;
    }
    .feature-card h3 { font-size:15.5px; font-weight:600; margin-bottom:8px; }
    .feature-card p { font-size:13px; color:rgba(255,255,255,0.55); line-height:1.6; }

    /* Showcase tabs */
    .showcase { max-width:1100px; margin:90px auto; padding:0 48px; }
    .tab-bar { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:36px; }
    .tab-bar button {
      padding:9px 16px; border-radius:999px; background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.6);
      font-size:12.5px; font-weight:600; border:1px solid transparent; transition: all 200ms;
    }
    .tab-bar button.active { background:rgba(124,92,255,0.18); color:#B7A6FF; border-color:rgba(124,92,255,0.4); }
    .showcase-panel { display:grid; grid-template-columns:1fr; gap:30px; align-items:center; }
    @media (min-width:900px) { .showcase-panel { grid-template-columns:1fr 1fr; } }
    .showcase-text h3 { font-size:24px; font-weight:700; margin-bottom:12px; }
    .showcase-text p { color:rgba(255,255,255,0.6); font-size:14.5px; line-height:1.65; }
    .showcase-visual { position:relative; height:260px; }
    .showcase-glow {
      position:absolute; inset:20px; background:radial-gradient(circle, rgba(124,92,255,0.35), transparent 70%);
      filter:blur(30px);
    }
    .showcase-window {
      position:relative; height:100%; border-radius:20px; background:rgba(255,255,255,0.04);
      border:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center;
    }

    /* How it works */
    .how-it-works { max-width:1100px; margin:90px auto; padding:0 48px; }
    .steps { display:grid; grid-template-columns:1fr; gap:20px; }
    @media (min-width:768px) { .steps { grid-template-columns:repeat(5,1fr); } }
    .step { text-align:center; }
    .step-number {
      width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg,#7C5CFF,#F857C1);
      display:flex; align-items:center; justify-content:center; font-weight:700; margin:0 auto 14px;
    }
    .step h3 { font-size:14px; font-weight:600; margin-bottom:6px; }
    .step p { font-size:12px; color:rgba(255,255,255,0.5); line-height:1.5; }

    /* Final CTA */
    .final-cta { max-width:900px; margin:90px auto 60px; padding:0 48px; }
    .final-cta-inner {
      text-align:center; padding:60px 40px; border-radius:28px;
      background:linear-gradient(135deg, rgba(124,92,255,0.15), rgba(248,87,193,0.1));
      border:1px solid rgba(255,255,255,0.08);
    }
    .final-cta-inner h2 { font-size:30px; font-weight:700; margin-bottom:14px; }
    .final-cta-inner p { color:rgba(255,255,255,0.6); font-size:15px; margin-bottom:26px; }

    .footer { display:flex; align-items:center; justify-content:center; gap:12px; padding:36px; border-top:1px solid rgba(255,255,255,0.06); }
    .footer-copy { font-size:12.5px; color:rgba(255,255,255,0.4); }

    /* Scroll reveal */
    .reveal { opacity:0; transform:translateY(24px); transition: opacity 700ms ease-out, transform 700ms ease-out; }
    .reveal.visible { opacity:1; transform:translateY(0); }

    @media (prefers-reduced-motion: reduce) {
      .aurora, .mock-window, .source-chip, .convergence-lines .line, .convergence-pulse::before { animation:none; }
      .reveal { opacity:1; transform:none; transition:none; }
    }
  `]
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  activeTab = 'dashboard';
  tabs = FEATURE_TABS;

  constructor(private auth: AuthService) {}

  isLoggedIn(): boolean {
    return this.auth.isAuthenticated();
  }

  featureCards = [
    { icon: 'target', title: 'Trouvez les bonnes opportunités', description: "Clutchr analyse des centaines d'offres et ne vous montre que celles qui correspondent vraiment." },
    { icon: 'trending-up', title: 'Comprenez le marché', description: 'Tendances et analyses calculées depuis vos vraies offres collectées, pour prendre de meilleures décisions.' },
    { icon: 'calendar', title: 'Progressez en continu', description: 'Roadmap personnalisée et compétences à fort impact pour décrocher le poste visé.' },
    { icon: 'users', title: 'Développez votre réseau', description: 'Identifiez les bonnes personnes et préparez votre approche, sans scraping LinkedIn.' },
    { icon: 'pen-square', title: 'Soyez visible', description: 'Améliorez votre présence professionnelle et attirez les recruteurs.' },
    { icon: 'sparkles', title: 'Un copilote IA', description: 'Des recommandations concrètes et actionnables à chaque étape, jamais une statistique inventée.' },
  ];

  steps = [
    { title: 'Importez votre profil', description: 'Clutchr analyse votre CV et vos compétences.' },
    { title: 'Recevez vos correspondances', description: 'Les meilleures offres sont classées pour vous.' },
    { title: 'Passez à l\u2019action', description: 'Postulez, suivez et relancez au bon moment.' },
    { title: 'Progressez chaque jour', description: 'Suivez votre roadmap et développez vos compétences.' },
    { title: 'Décrochez le poste', description: 'Attirez les recruteurs et obtenez plus d\u2019entretiens.' },
  ];

  private mouseX = 0;
  private mouseY = 0;
  private rafId: number | null = null;
  private translateX = 0;
  private translateY = 0;
  private observer: IntersectionObserver | null = null;

  parallaxTransform(): string {
    return `translate(${this.translateX}px, ${this.translateY}px)`;
  }

  currentTab(): FeatureTab {
    return this.tabs.find(t => t.key === this.activeTab) || this.tabs[0];
  }

  iconForTab(key: string): string {
    const icons: Record<string, string> = {
      dashboard: 'home', swipe: 'heart', pipeline: 'layers',
      roadmap: 'calendar', linkedin: 'pen-square', intelligence: 'trending-up',
    };
    return icons[key] || 'sparkles';
  }

  ngOnInit() {}

  ngAfterViewInit() {
    this.observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.15 }
    );
    document.querySelectorAll('.reveal').forEach(el => this.observer!.observe(el));
  }

  onMouseMove(event: MouseEvent) {
    this.mouseX = (event.clientX / window.innerWidth - 0.5) * 16;
    this.mouseY = (event.clientY / window.innerHeight - 0.5) * 16;
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.translateX = this.mouseX;
        this.translateY = this.mouseY;
        this.rafId = null;
      });
    }
  }

  ngOnDestroy() {
    if (this.observer) this.observer.disconnect();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }
}
