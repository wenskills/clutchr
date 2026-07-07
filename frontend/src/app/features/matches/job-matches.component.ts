import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarComponent } from '../../shared/sidebar.component';
import { IconComponent } from '../../shared/icon.component';
import { NotifyService } from '../../core/notify/notify.service';

interface JobMatchVM {
  id: number;
  match_score: number;
  match_level: string;
  matched_skills: Record<string, boolean>;
  skill_gaps: Record<string, boolean>;
  location_fit: string;
  salary_fit: string;
  experience_fit: string;
  user_saved: boolean;
  user_applied: boolean;
  kanban_status: string;
  viewed: boolean;
  job: {
    title: string;
    company_name: string;
    location: string;
    remote_type: string;
    salary_min: number | null;
    salary_max: number | null;
    avg_salary: number | null;
    job_url: string;
    source: string;
    posted_date: string;
    description?: string;
  };
}

const SWIPE_THRESHOLD = 110;
const CLICK_MOVE_TOLERANCE = 8;

/**
 * Offres correspondantes — un seul écran, deux modes d'affichage
 * (Liste / Swipe).
 */
@Component({
  selector: 'app-job-matches',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarComponent, IconComponent],
  template: `
  <div class="layout">
    <app-sidebar active="/offres"></app-sidebar>

    <main class="main">
      <header class="page-header">
        <div>
          <h1>Offres correspondantes</h1>
          <p class="muted">Calculées à partir de vos compétences et de vos objectifs de profil.</p>
        </div>
        <div class="header-actions">
          <div class="mode-toggle">
            <button [class.active]="viewMode() === 'liste'" (click)="setViewMode('liste')" aria-label="Vue liste">
              <app-icon name="layers" [size]="15"></app-icon> Liste
            </button>
            <button [class.active]="viewMode() === 'swipe'" (click)="setViewMode('swipe')" aria-label="Vue swipe">
              <app-icon name="heart" [size]="15"></app-icon> Swipe
            </button>
          </div>
          <button class="btn-scrape" (click)="launchScrape()" [disabled]="scraping()">
            <app-icon [name]="scraping() ? 'refresh' : 'search'" [size]="15" [class.spin]="scraping()"></app-icon>
            {{ scraping() ? 'Recherche en cours...' : 'Lancer une recherche' }}
          </button>
        </div>
      </header>

      <div class="scrape-info" *ngIf="lastScrapeInfo()">
        <p>
          <strong>{{ lastScrapeInfo()?.total_available_on_source | number }}</strong> offre(s) au total chez Adzuna
          pour vos recherches · <strong>{{ lastScrapeInfo()?.new_jobs + lastScrapeInfo()?.updated_jobs }}</strong> récupérée(s)
          (limité volontairement pour rester dans le quota gratuit — relancez la recherche régulièrement
          pour en récupérer davantage au fil du temps).
        </p>
        <details>
          <summary>Voir le détail des recherches lancées</summary>
          <ul>
            <li *ngFor="let q of lastScrapeInfo()?.queries_detail">
              « {{ q.query }} » à {{ q.location }} : {{ q.total_found | number }} offre(s) au total, {{ q.fetched }} récupérée(s)
            </li>
          </ul>
        </details>
      </div>

      <div class="config-warning" *ngIf="notConfigured()">
        <app-icon name="info" [size]="15"></app-icon>
        Aucune source d'offres n'est configurée côté serveur. Créez un compte gratuit sur
        <a href="https://developer.adzuna.com/" target="_blank">developer.adzuna.com</a>
        puis renseignez <code>ADZUNA_APP_ID</code> et <code>ADZUNA_APP_KEY</code> dans le fichier
        <code>.env</code> du backend, et redémarrez le serveur Django.
      </div>

      <!-- VUE LISTE -->
      <ng-container *ngIf="viewMode() === 'liste'">
        <div class="empty-state" *ngIf="!loading() && matches().length === 0 && !notConfigured()">
          <app-icon name="target" [size]="32" color="#CBD5E1"></app-icon>
          <h2>Aucune offre pour l'instant</h2>
          <p class="muted">Lancez une recherche pour trouver des offres correspondant à votre profil.</p>
        </div>

        <div class="match-grid" *ngIf="matches().length">
          <article class="match-row" [class.viewed]="m.viewed" *ngFor="let m of matches()" (click)="openOffer(m, $event)">
            <div class="row-logo" [style.background]="logoFailed.has(m.id) ? avatarColor(m.job.company_name) : 'white'">
              <img *ngIf="!logoFailed.has(m.id)" [src]="logoUrlFor(m.job.company_name)" (error)="onLogoError(m.id)" alt="" loading="lazy">
              <span *ngIf="logoFailed.has(m.id)">{{ companyInitials(m.job.company_name) }}</span>
              <div class="viewed-badge" *ngIf="m.viewed" title="Déjà consultée">
                <app-icon name="check-circle" [size]="13" color="white"></app-icon>
              </div>
            </div>

            <div class="row-main">
              <div class="row-top-line">
                <div>
                  <h3>{{ m.job.title }}</h3>
                  <p class="company">
                    {{ m.job.company_name }}
                    <span class="meta-dot" *ngIf="m.job.location"> · {{ m.job.location }}</span>
                    <span class="meta-dot" *ngIf="m.job.remote_type === 'remote'"> · Télétravail</span>
                    <span class="meta-dot" *ngIf="m.job.remote_type === 'hybrid'"> · Hybride</span>
                  </p>
                </div>
                <div class="row-match-badge">
                  <span class="match-pct" [style.color]="ringColor(m.match_level)">{{ m.match_score }}%</span>
                  <span class="match-word" [style.color]="ringColor(m.match_level)">{{ matchWord(m.match_level) }}</span>
                  <div class="match-bar"><div class="match-bar-fill" [style.width.%]="m.match_score" [style.background]="ringColor(m.match_level)"></div></div>
                </div>
              </div>

              <div class="skill-chips-row" *ngIf="objectKeys(m.matched_skills).length">
                <span class="skill-chip" [style.background]="skillChipBg(s)" [style.color]="skillChipColor(s)" *ngFor="let s of objectKeys(m.matched_skills).slice(0, 4)">{{ s }}</span>
                <span class="skill-chip overflow" *ngIf="objectKeys(m.matched_skills).length > 4">+{{ objectKeys(m.matched_skills).length - 4 }}</span>
              </div>

              <div class="reason-strip" *ngIf="objectKeys(m.matched_skills).length">
                <span class="reason-strip-label">Pourquoi ce match :</span>
                <span class="reason-item" *ngFor="let s of objectKeys(m.matched_skills).slice(0, 3)">
                  <app-icon name="check-circle" [size]="11" color="#0D9488"></app-icon> {{ s }}
                </span>
              </div>

              <div class="row-bottom-line">
                <span class="row-salary" *ngIf="m.job.avg_salary">{{ m.job.avg_salary | number }} € / an</span>
                <span class="row-salary muted" *ngIf="!m.job.avg_salary">Salaire non précisé</span>

                <div class="row-actions">
                  <button class="row-bookmark" [class.active]="m.user_saved" (click)="toggleSaved(m, $event)" aria-label="Enregistrer" title="Enregistrer">
                    <app-icon name="layers" [size]="13"></app-icon>
                  </button>
                  <button class="btn-secondary-action" (click)="quickDecide(m, 'pas_interesse', $event)">
                    <app-icon name="x-circle" [size]="12"></app-icon> Ignorer
                  </button>
                  <button class="icon-action heart" [class.active]="m.kanban_status === 'interesse'" (click)="quickDecide(m, 'interesse', $event)" aria-label="Intéressé" title="Intéressé">
                    <app-icon name="heart" [size]="14"></app-icon>
                  </button>
                  <button class="icon-action applied" [class.active]="m.kanban_status === 'postule'" (click)="toggleApplied(m, $event)" aria-label="Marquer postulé" title="Marquer postulé">
                    <app-icon name="check-circle" [size]="14"></app-icon>
                  </button>
                  <button class="btn-view-offer" (click)="$event.stopPropagation(); openOffer(m, $event)">
                    Voir l'offre <app-icon name="arrow-right" [size]="13"></app-icon>
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>

        <nav class="pagination" *ngIf="totalPages() > 1" aria-label="Pagination des offres">
          <span class="pagination-summary">{{ totalCount() }} offre{{ totalCount() > 1 ? 's' : '' }} au total</span>
          <div class="pagination-controls">
            <button class="page-btn" (click)="goToPage(currentPage() - 1)" [disabled]="currentPage() === 1" aria-label="Page précédente">
              <app-icon name="chevron-left" [size]="16"></app-icon>
            </button>
            <button class="page-btn" *ngIf="pageNumbers()[0] > 1" (click)="goToPage(1)">1</button>
            <span class="page-ellipsis" *ngIf="pageNumbers()[0] > 2">…</span>
            <button class="page-btn" *ngFor="let p of pageNumbers()" [class.active]="p === currentPage()" (click)="goToPage(p)">{{ p }}</button>
            <span class="page-ellipsis" *ngIf="pageNumbers()[pageNumbers().length - 1] < totalPages() - 1">…</span>
            <button class="page-btn" *ngIf="pageNumbers()[pageNumbers().length - 1] < totalPages()" (click)="goToPage(totalPages())">{{ totalPages() }}</button>
            <button class="page-btn" (click)="goToPage(currentPage() + 1)" [disabled]="currentPage() === totalPages()" aria-label="Page suivante">
              <app-icon name="chevron-right" [size]="16"></app-icon>
            </button>
          </div>
        </nav>
      </ng-container>

      <!-- VUE SWIPE -->
      <ng-container *ngIf="viewMode() === 'swipe'">
        <div class="deck-area" *ngIf="!loadingDeck()">
          <div class="empty-state" *ngIf="!currentCard()">
            <app-icon name="check-circle" [size]="32" color="#2DD4BF"></app-icon>
            <h2>Pile épuisée</h2>
            <p>Vous avez examiné toutes les offres disponibles pour le moment. Relancez une recherche pour en découvrir d'autres.</p>
          </div>

          <div class="card-stack" *ngIf="currentCard()">
            <!-- Cartes de la pile, dessous, juste pour l'effet d'épaisseur -->
            <div class="stack-layer layer-4" *ngIf="deck().length > deckIndex() + 3"></div>
            <div class="stack-layer layer-3" *ngIf="deck().length > deckIndex() + 2"></div>
            <div class="stack-layer layer-2" *ngIf="deck().length > deckIndex() + 1"></div>

            <div
              class="swipe-card"
              [style.transform]="cardTransform()"
              [style.transition]="dragging() ? 'none' : 'transform 280ms cubic-bezier(.2,.8,.2,1)'"
              (pointerdown)="onPointerDown($event)"
              (pointermove)="onPointerMove($event)"
              (pointerup)="onPointerUp($event)"
              (pointercancel)="onPointerUp($event)"
            >
              <div class="swipe-badge like" [style.opacity]="likeOpacity()">Intéressé</div>
              <div class="swipe-badge pass" [style.opacity]="passOpacity()">Pas pour moi</div>

              <div class="card-scroll">
                <div class="card-head-row">
                  <div class="match-badge" [class]="'level-' + currentCard()!.match_level">
                    <span class="match-pct">{{ currentCard()!.match_score }}%</span>
                    <span class="match-word">{{ matchWord(currentCard()!.match_level) }}</span>
                  </div>
                  <span class="source-tag">{{ currentCard()!.job.source }}</span>
                </div>

                <div class="company-row">
                  <div class="company-avatar" [style.background]="logoFailed.has(currentCard()!.id) ? avatarColor(currentCard()!.job.company_name) : 'white'">
                    <img *ngIf="!logoFailed.has(currentCard()!.id)" [src]="logoUrlFor(currentCard()!.job.company_name)" (error)="onLogoError(currentCard()!.id)" alt="">
                    <span *ngIf="logoFailed.has(currentCard()!.id)">{{ companyInitials(currentCard()!.job.company_name) }}</span>
                  </div>
                  <span class="company-name">{{ currentCard()!.job.company_name }}</span>
                </div>

                <h2 class="job-title">{{ currentCard()!.job.title }}</h2>

                <div class="chip-row">
                  <span class="info-chip" *ngIf="currentCard()!.job.location">
                    <app-icon name="map-pin" [size]="11"></app-icon> {{ currentCard()!.job.location }}
                  </span>
                  <span class="info-chip" *ngIf="currentCard()!.job.remote_type === 'remote'">
                    <app-icon name="home" [size]="11"></app-icon> Télétravail
                  </span>
                  <span class="info-chip chip-salary" *ngIf="currentCard()!.job.avg_salary">
                    {{ currentCard()!.job.avg_salary | number }} € / an
                  </span>
                </div>

                <div class="match-reason-grid">
                  <div class="reason-box reason-match" *ngIf="objectKeys(currentCard()!.matched_skills).length">
                    <div class="reason-head"><app-icon name="check-circle" [size]="13" color="#0D9488"></app-icon> Pourquoi ce match</div>
                    <div class="reason-chips">
                      <span class="reason-chip chip-yes" *ngFor="let s of objectKeys(currentCard()!.matched_skills)">{{ s }}</span>
                    </div>
                  </div>
                  <div class="reason-box reason-gap" *ngIf="objectKeys(currentCard()!.skill_gaps).length">
                    <div class="reason-head"><app-icon name="info" [size]="13" color="#92400E"></app-icon> Il manque</div>
                    <div class="reason-chips">
                      <span class="reason-chip chip-no" *ngFor="let s of objectKeys(currentCard()!.skill_gaps)">{{ s }}</span>
                    </div>
                  </div>
                </div>

                <p class="description-excerpt" *ngIf="truncatedDescription()">{{ truncatedDescription() }}</p>
              </div>

              <p class="tap-hint">Touchez la carte pour voir l'offre complète</p>
            </div>
          </div>

          <div class="action-row" *ngIf="currentCard()">
            <button class="action-btn pass-btn" (click)="decide('pas_interesse')" aria-label="Pas intéressé">
              <app-icon name="x-circle" [size]="26"></app-icon>
            </button>
            <button class="action-btn like-btn" (click)="decide('interesse')" aria-label="Intéressé">
              <app-icon name="heart" [size]="26"></app-icon>
            </button>
          </div>

          <div class="deck-dots" *ngIf="currentCard()">
            <span class="dot" *ngFor="let d of dotsWindow()" [class.active]="d === deckIndex()"></span>
          </div>
          <p class="deck-progress" *ngIf="currentCard()">{{ deckIndex() + 1 }} / {{ deck().length }}</p>
        </div>
      </ng-container>
    </main>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; }
    .layout { display:flex; min-height:100vh; background:#f7f7fa; }
    .main { flex:1; padding:32px 36px; max-width: 1500px; }

    .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom: 8px; }
    .page-header h1 { font-size:26px; margin-bottom:4px; }
    .muted { color:#888; font-size:14px; }
    .header-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }

    .mode-toggle { display:flex; background:white; border-radius:11px; padding:4px; box-shadow:0 1px 2px rgba(15,23,42,0.05); }
    .mode-toggle button {
      display:flex; align-items:center; gap:6px; padding:9px 16px; border-radius:8px; font-size:12.5px; font-weight:600; color:#94A3B8;
    }
    .mode-toggle button.active { background:linear-gradient(135deg,#7C5CFF,#6645E0); color:white; }

    .btn-scrape {
      padding:12px 20px; border:none; border-radius:11px; background:linear-gradient(90deg,#7C5CFF,#F857C1);
      color:white; font-weight:600; font-size:13.5px; cursor:pointer; white-space:nowrap;
      transition: transform .15s;
    }
    .btn-scrape:hover:not(:disabled) { transform: translateY(-1px); }
    .btn-scrape:disabled { opacity:.7; cursor:not-allowed; }
    .spin { display:inline-block; animation: spin 1.2s linear infinite; }
    @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }


    .scrape-info {
      background:#F1EEFF; border-radius:12px; padding:14px 18px; margin:16px 0; font-size:13px; color:#5b21b6;
    }
    .scrape-info p { margin:0 0 6px; line-height:1.6; }
    .scrape-info details { font-size:12.5px; cursor:pointer; }
    .scrape-info summary { font-weight:600; color:#7C5CFF; }
    .scrape-info ul { margin:8px 0 0; padding-left:18px; }
    .scrape-info li { margin-bottom:4px; color:#666; }

    .config-warning {
      background:#fffbeb; color:#92400e; padding:16px 20px; border-radius:12px; font-size:13.5px;
      margin:20px 0; line-height:1.6; border:1px solid #fde68a; display:flex; align-items:flex-start; gap:9px;
    }
    .config-warning app-icon { flex-shrink:0; margin-top:2px; }
    .config-warning a { color:#7C5CFF; font-weight:600; }
    .config-warning code { background:rgba(0,0,0,0.06); padding:2px 6px; border-radius:5px; font-size:12px; }

    .empty-state { text-align:center; padding: 70px 20px; display:flex; flex-direction:column; align-items:center; gap:12px; }
    .empty-state h2 { font-size:20px; margin-bottom:2px; }

    .match-grid { display:flex; flex-direction:column; gap:18px; margin-top:20px; }

    .match-row {
      display:flex; gap:22px; align-items:stretch;
      background:linear-gradient(135deg,#ffffff 0%,#ffffff 60%,#FBF9FF 100%);
      border-radius:12px; padding:24px 26px; box-shadow:0 2px 12px rgba(85,52,180,.07), 0 5px 0 -2px #EDE7FF, 0 8px 0 -4px #E3D9FF;
      cursor:pointer; transition: transform 150ms, box-shadow 150ms; animation: rise-in .35s ease both;
    }
    .match-row:hover {
      transform: translateY(-2px);
      box-shadow:0 12px 26px rgba(85,52,180,.16), 0 5px 0 -2px #EDE7FF, 0 8px 0 -4px #E3D9FF;
    }
    @keyframes rise-in { from { opacity:0; transform: translateY(8px);} to { opacity:1; transform:none; } }

    .row-logo {
      width:120px; border-radius:10px; flex-shrink:0; position:relative;
      display:flex; align-items:center; justify-content:center;
      font-weight:800; font-size:28px; color:white;
      box-shadow:0 1px 2px rgba(15,23,42,0.05);
      overflow:hidden;
    }
    .row-logo img { width:60%; height:60%; object-fit:contain; }
    .viewed-badge {
      position:absolute; bottom:6px; right:6px; width:22px; height:22px; border-radius:50%;
      background:#7C5CFF; display:flex; align-items:center; justify-content:center;
      box-shadow:0 0 0 2.5px white;
    }
    .match-row.viewed {
      background: #E7E5EF;
      box-shadow: 0 1px 4px rgba(85,52,180,.05), 0 5px 0 -2px #DCD8E8, 0 8px 0 -4px #D2CCE0;
    }
    .match-row.viewed .row-main h3 { color: #6B7280; }
    .match-row.viewed .company { color: #8B7FB8 !important; }
    .match-row.viewed .row-logo { filter: grayscale(0.5) opacity(0.7); }
    .match-row.viewed:hover { background: #DEDBE8; box-shadow:0 8px 20px rgba(85,52,180,.10), 0 5px 0 -2px #DCD8E8, 0 8px 0 -4px #D2CCE0; }
    .icon-action.applied.active { background:#ECFDF5; color:#0D9488; }

    .row-main { min-width:0; flex:1; display:flex; flex-direction:column; gap:14px; }

    .row-top-line { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
    .row-main h3 { font-size:17px; font-weight:700; color:#0F172A; margin:0 0 4px; }
    .row-main .company { font-size:13px; color:#7C5CFF; font-weight:600; margin:0; }
    .meta-dot { color:#94A3B8; font-weight:500; }

    .row-match-badge { text-align:right; flex-shrink:0; min-width:120px; }
    .match-pct { font-size:20px; font-weight:800; }
    .match-word { display:block; font-size:11px; font-weight:700; margin-top:1px; }
    .match-bar { height:5px; background:#EEF1F6; border-radius:999px; overflow:hidden; margin-top:7px; width:120px; margin-left:auto; }
    .match-bar-fill { height:100%; border-radius:999px; }

    .skill-chips-row { display:flex; gap:6px; flex-wrap:wrap; }
    .skill-chip { font-size:11px; font-weight:600; padding:4px 10px; border-radius:999px; }
    .skill-chip.overflow { background:#F1EEFF; color:#7C5CFF; }

    .reason-strip {
      display:flex; align-items:center; gap:14px; flex-wrap:wrap; background:#F8FAFC; border-radius:12px; padding:10px 14px;
    }
    .reason-strip-label { font-size:11px; font-weight:700; color:#94A3B8; white-space:nowrap; }
    .reason-item { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:#334155; }

    .row-bottom-line { display:flex; justify-content:space-between; align-items:center; gap:16px; }
    .row-salary { font-size:14px; font-weight:700; color:#0F172A; }
    .row-salary.muted { color:#CBD5E1; font-weight:600; font-size:12.5px; }

    .row-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
    .row-bookmark, .icon-action {
      width:32px; height:32px; border-radius:9px; background:#F8FAFC; color:#94A3B8;
      display:flex; align-items:center; justify-content:center; flex-shrink:0;
    }
    .row-bookmark:hover, .row-bookmark.active, .icon-action:hover, .icon-action.active { background:#F1EEFF; color:#7C5CFF; }
    .icon-action.heart.active { background:#FDF2F8; color:#DB2777; }
    .btn-secondary-action {
      display:flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600; color:#94A3B8;
      padding:7px 11px; border-radius:8px;
    }
    .btn-secondary-action:hover { background:#FFFBEB; color:#D97706; }
    .btn-view-offer {
      display:flex; align-items:center; gap:6px; padding:10px 18px; border-radius:10px;
      background:#15101f; color:white; font-weight:600; font-size:12.5px; white-space:nowrap; margin-left:6px;
    }

    @media (max-width: 900px) {
      .match-row { flex-direction:column; }
      .row-top-line { flex-direction:column; }
      .row-match-badge { text-align:left; }
      .match-bar { margin-left:0; }
      .row-bottom-line { flex-wrap:wrap; }
    }

    .pagination { display:flex; flex-direction:column; align-items:center; gap:12px; margin-top:28px; padding-bottom: 12px; }
    .pagination-summary { font-size:12.5px; color:#94A3B8; }
    .pagination-controls { display:flex; align-items:center; gap:5px; }
    .page-btn {
      min-width:34px; height:34px; padding:0 8px; border-radius:9px; background:white; border:1.5px solid #E6E9EF;
      font-size:13px; color:#475569; display:flex; align-items:center; justify-content:center;
    }
    .page-btn:hover:not(:disabled) { border-color:#7C5CFF; color:#7C5CFF; }
    .page-btn.active { background:#7C5CFF; border-color:#7C5CFF; color:white; font-weight:600; }
    .page-btn:disabled { opacity:.4; cursor:not-allowed; }
    .page-ellipsis { color:#CBD5E1; font-size:13px; padding:0 2px; }

    /* SWIPE */
    .deck-area { max-width:680px; margin:64px auto 0; }
    .card-stack { position:relative; height:600px; touch-action: none; }

    .stack-layer {
      position:absolute; inset:0; border-radius:28px;
      box-shadow:0 25px 50px rgba(85,52,180,.18);
    }
    .layer-2 {
      background:linear-gradient(160deg,#EDE7FF,#D9CCFF);
      transform: scale(0.94) translate(70px,10px) rotate(3deg);
      z-index:1;
    }
    .layer-3 {
      background:linear-gradient(160deg,#D9CCFF,#B7A6FF);
      transform: scale(0.88) translate(145px,22px) rotate(6deg);
      z-index:0;
    }
    .layer-4 {
      background:linear-gradient(160deg,#B7A6FF,#9C85FF);
      transform: scale(0.82) translate(220px,36px) rotate(9deg);
      z-index:-1;
    }

    .swipe-card {
      position:absolute; inset:0; border-radius:28px; padding:0; cursor:pointer; user-select:none;
      display:flex; flex-direction:column; overflow:hidden; background:linear-gradient(180deg,#ffffff,#faf7ff);
      box-shadow:0 35px 80px rgba(85,52,180,.18); z-index:2;
    }

    .swipe-badge {
      position:absolute; top:24px; padding:7px 16px; border-radius:10px; font-size:13px; font-weight:700;
      border:2.5px solid; text-transform:uppercase; letter-spacing:.03em; pointer-events:none; z-index:2;
    }
    .swipe-badge.like { left:24px; color:#0D9488; border-color:#0D9488; background:white; transform:rotate(-8deg); }
    .swipe-badge.pass { right:24px; color:#D97706; border-color:#D97706; background:white; transform:rotate(8deg); }

    .card-scroll { padding:26px 26px 14px; overflow-y:auto; flex:1; }

    .card-head-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .match-badge {
      display:flex; align-items:center; gap:8px; padding:8px 16px; border-radius:14px;
      box-shadow:0 0 0 1px rgba(124,92,255,0.12);
    }
    .match-badge.level-perfect, .match-badge.level-excellent { background:#ECFDF5; }
    .match-badge.level-good { background:#F1EEFF; }
    .match-badge.level-potential { background:#FFFBEB; }
    .match-badge.level-low { background:#F1F5F9; }
    .match-pct { font-size:20px; font-weight:800; color:#0F172A; }
    .match-word { font-size:11.5px; font-weight:700; color:#6645E0; }
    .match-badge.level-perfect .match-word, .match-badge.level-excellent .match-word { color:#0D9488; }
    .match-badge.level-potential .match-word { color:#92400E; }
    .source-tag { font-size:11px; color:#94A3B8; text-transform:capitalize; font-weight:600; }

    .company-row { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
    .company-avatar {
      width:34px; height:34px; border-radius:10px; color:white; overflow:hidden;
      display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; flex-shrink:0;
    }
    .company-avatar img { width:22px; height:22px; object-fit:contain; }
    .company-name { font-size:13.5px; font-weight:600; color:#475569; }

    .job-title { font-size:30px; font-weight:800; color:#0F172A; line-height:1.15; margin:0 0 16px; letter-spacing:-0.01em; }

    .chip-row { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
    .info-chip {
      display:flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:#475569;
      background:#F8FAFC; padding:6px 12px; border-radius:999px;
    }
    .info-chip.chip-salary { background:#F1EEFF; color:#6645E0; }

    .match-reason-grid { display:flex; flex-direction:column; gap:12px; margin-bottom:16px; }
    .reason-box { border-radius:16px; padding:14px; }
    .reason-box.reason-match { background:#ECFDF5; }
    .reason-box.reason-gap { background:#FFFBEB; }
    .reason-head { display:flex; align-items:center; gap:7px; font-size:12px; font-weight:700; color:#334155; margin-bottom:9px; }
    .reason-chips { display:flex; flex-wrap:wrap; gap:6px; }
    .reason-chip { font-size:12px; font-weight:600; padding:5px 11px; border-radius:999px; }
    .chip-yes { background:white; color:#0D9488; }
    .chip-no { background:white; color:#92400E; }

    .description-excerpt { font-size:12.5px; color:#94A3B8; line-height:1.6; margin:0; }
    .tap-hint {
      font-size:10.5px; color:#CBD5E1; text-align:center; margin:0; padding:10px 0; flex-shrink:0;
      border-top:1px solid #F8FAFC; background:white;
    }

    .action-row { display:flex; justify-content:center; align-items:center; gap:28px; margin-top:28px; }
    .action-btn {
      width:68px; height:68px; border-radius:50%; display:flex; align-items:center; justify-content:center;
      background:white; box-shadow:0 10px 30px rgba(85,52,180,.18); border:none;
      transition: transform 180ms, box-shadow 180ms;
    }
    .action-btn:hover { transform: translateY(-3px) scale(1.06); box-shadow:0 14px 36px rgba(85,52,180,.26); }
    .pass-btn { color:#D97706; }
    .like-btn { color:#0D9488; }

    .deck-dots { display:flex; justify-content:center; gap:6px; margin-top:18px; }
    .dot { width:6px; height:6px; border-radius:50%; background:#E6E9EF; }
    .dot.active { background:#7C5CFF; width:18px; border-radius:3px; transition: all 200ms; }

    .deck-progress { text-align:center; font-size:12px; color:#94A3B8; margin-top:8px; }

    @media (max-width: 900px) { .main { padding:20px; } }
  `]
})
export class JobMatchesComponent implements OnInit {
  private apiUrl = 'http://localhost:8000/api/v1';

  viewMode = signal<'liste' | 'swipe'>('liste');

  // --- Liste ---
  matches = signal<JobMatchVM[]>([]);
  loading = signal(true);
  currentPage = signal(1);
  totalCount = signal(0);
  totalPages = signal(1);
  readonly pageSize = 20;
  scraping = signal(false);
  notConfigured = signal(false);
  lastScrapeInfo = signal<any>(null);

  // --- Swipe ---
  deck = signal<JobMatchVM[]>([]);
  deckIndex = signal(0);
  loadingDeck = signal(true);
  dragging = signal(false);
  private dragStartX = 0;
  private dragStartY = 0;
  private maxMove = 0;
  private dragX = signal(0);
  private dragY = signal(0);
  private activePointerId: number | null = null;

  // --- Gamification légère (session en cours, non persistée) ---
  sessionExplored = signal(0);

  constructor(private http: HttpClient, private auth: AuthService, private route: ActivatedRoute, private notify: NotifyService) {}

  ngOnInit() {
    this.loadMatches();
    if (this.route.snapshot.queryParamMap.get('vue') === 'swipe') {
      this.setViewMode('swipe');
    }
  }

  setViewMode(mode: 'liste' | 'swipe') {
    this.viewMode.set(mode);
    if (mode === 'swipe' && !this.deck().length) {
      this.loadDeck();
    }
  }

  objectKeys(obj: Record<string, any>): string[] {
    return obj ? Object.keys(obj) : [];
  }

  private loadMatches(page: number = 1) {
    this.loading.set(true);
    this.http.get<any>(`${this.apiUrl}/matches/?page=${page}`).subscribe({
      next: (data: any) => {
        if (Array.isArray(data)) {
          this.matches.set(data);
          this.totalCount.set(data.length);
          this.totalPages.set(1);
        } else {
          this.matches.set(data.results || []);
          this.totalCount.set(data.count || 0);
          this.totalPages.set(Math.max(1, Math.ceil((data.count || 0) / this.pageSize)));
        }
        this.currentPage.set(page);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); }
    });
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) return;
    this.loadMatches(page);
  }

  pageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const window = 2;
    const start = Math.max(1, current - window);
    const end = Math.min(total, current + window);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  launchScrape() {
    this.scraping.set(true);
    this.notConfigured.set(false);
    this.http.post<any>(`${this.apiUrl}/matches/scrape/`, {}).subscribe({
      next: (res) => {
        this.scraping.set(false);
        this.lastScrapeInfo.set(res);
        if (res.new_jobs > 0) {
          this.showToast(`J'ai trouvé ${res.new_jobs} nouvelle${res.new_jobs > 1 ? 's' : ''} offre${res.new_jobs > 1 ? 's' : ''} pour vous.`);
        } else {
          this.showToast(`Rien de nouveau cette fois — je continue de surveiller pour vous.`);
        }
        this.loadMatches();
        this.deck.set([]); // force un rechargement de la pile swipe à la prochaine ouverture
      },
      error: (err) => {
        this.scraping.set(false);
        if (err.status === 501) {
          this.notConfigured.set(true);
        } else {
          this.showToast(AuthService.extractErrorMessage(err), true);
        }
      }
    });
  }

  openOffer(m: JobMatchVM, event: MouseEvent) {
    // Ignore le clic s'il provient d'un des boutons d'action internes à la carte
    const target = event.target as HTMLElement;
    if (target.closest('.row-bookmark') || target.closest('.btn-secondary-action') || target.closest('.icon-action')) return;
    if (!m.viewed) {
      m.viewed = true;
      this.http.patch(`${this.apiUrl}/matches/${m.id}/mark-viewed/`, {}).subscribe({
        error: () => { m.viewed = false; }
      });
    }
    window.open(m.job.job_url, '_blank', 'noopener');
  }

  toggleSaved(m: JobMatchVM, event: MouseEvent) {
    event.stopPropagation();
    const nextStatus = m.user_saved ? 'nouveau' : 'interesse';
    this.http.patch<any>(`${this.apiUrl}/matches/${m.id}/update_status/`, { kanban_status: nextStatus }).subscribe({
      next: (res) => {
        m.user_saved = res.user_saved;
        m.user_applied = res.user_applied;
        m.kanban_status = res.kanban_status;
        this.matches.set([...this.matches()]);
      },
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  toggleApplied(m: JobMatchVM, event: MouseEvent) {
    event.stopPropagation();
    const nextStatus = m.kanban_status === 'postule' ? 'nouveau' : 'postule';
    this.http.patch<any>(`${this.apiUrl}/matches/${m.id}/update_status/`, { kanban_status: nextStatus }).subscribe({
      next: (res) => {
        m.user_saved = res.user_saved;
        m.user_applied = res.user_applied;
        m.kanban_status = res.kanban_status;
        this.matches.set([...this.matches()]);
        this.showToast(nextStatus === 'postule' ? 'Marqué comme postulé.' : 'Retiré des candidatures.');
      },
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  // ---------- SWIPE ----------

  private loadDeck() {
    this.loadingDeck.set(true);
    this.http.get<any>(`${this.apiUrl}/matches/swipe_deck/`).subscribe({
      next: (res) => {
        this.deck.set(res.deck || []);
        this.deckIndex.set(0);
        this.loadingDeck.set(false);
      },
      error: () => { this.loadingDeck.set(false); }
    });
  }

  currentCard(): JobMatchVM | null {
    return this.deck()[this.deckIndex()] || null;
  }

  truncatedDescription(): string {
    const desc = this.currentCard()?.job.description || '';
    return desc.length > 200 ? desc.slice(0, 200) + '…' : desc;
  }

  matchWord(level: string): string {
    const words: Record<string, string> = {
      perfect: 'Match parfait', excellent: 'Excellent match', good: 'Bon match', potential: 'Match potentiel', low: 'Match faible',
    };
    return words[level] || 'Match';
  }

  companyInitials(name: string): string {
    return (name || '?').trim().slice(0, 2).toUpperCase();
  }

  /**
   * Couleur d'avatar déterministe par entreprise, utilisée en repli
   * si aucun logo réel n'est trouvé.
   */
  avatarColor(companyName: string): string {
    // Restreint à la palette de marque (violet/rose), plus de couleurs
    // arc-en-ciel qui sortaient de la DA de l'app.
    const palette = ['#7C5CFF', '#C026D3'];
    let hash = 0;
    for (const ch of companyName) hash = (hash * 31 + ch.charCodeAt(0)) % palette.length;
    return palette[Math.abs(hash)];
  }

  logoFailed = new Set<number>();

  /**
   * Tente un vrai logo via favicon.im, à partir d'un domaine deviné
   * (nom d'entreprise -> nom.com). Contrairement au service de
   * favicons de Google (essayé avant, abandonné), favicon.im renvoie
   * une vraie erreur 404 sur domaine inconnu quand on demande
   * throw-error-on-404=true — donc le repli vers l'avatar coloré se
   * déclenche réellement, au lieu de toujours afficher une icône
   * "globe" générique. Reste un essai au mieux : beaucoup d'entreprises
   * n'ont pas le domaine deviné exact.
   */
  logoUrlFor(companyName: string): string {
    const guessedDomain = (companyName || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '') + '.com';
    return `https://favicon.im/${guessedDomain}?throw-error-on-404=true`;
  }

  onLogoError(matchId: number) {
    this.logoFailed.add(matchId);
  }

  /** Couleur de chip déterministe par compétence, pour casser la monotonie visuelle. */
  private skillPalette = [
    { bg: '#ECFDF5', fg: '#0D9488' },
    { bg: '#EFF6FF', fg: '#1D4ED8' },
    { bg: '#FFFBEB', fg: '#B45309' },
    { bg: '#F1EEFF', fg: '#6645E0' },
    { bg: '#FDF2F8', fg: '#BE185D' },
  ];

  private skillPaletteIndex(skill: string): number {
    let hash = 0;
    for (const ch of skill) hash = (hash * 31 + ch.charCodeAt(0)) % this.skillPalette.length;
    return Math.abs(hash);
  }

  skillChipBg(skill: string): string {
    return this.skillPalette[this.skillPaletteIndex(skill)].bg;
  }

  skillChipColor(skill: string): string {
    return this.skillPalette[this.skillPaletteIndex(skill)].fg;
  }

  ringColor(level: string): string {
    const colors: Record<string, string> = {
      perfect: '#0D9488', excellent: '#0D9488', good: '#7C5CFF', potential: '#D97706', low: '#94A3B8',
    };
    return colors[level] || '#7C5CFF';
  }

  /** Décision rapide depuis la liste, sans passer par la pile swipe. */
  quickDecide(m: JobMatchVM, status: 'interesse' | 'pas_interesse', event: MouseEvent) {
    event.stopPropagation();
    const previousStatus = m.kanban_status;
    m.kanban_status = m.kanban_status === status ? 'nouveau' : status;
    this.http.patch(`${this.apiUrl}/matches/${m.id}/update_status/`, { kanban_status: m.kanban_status }).subscribe({
      error: () => { m.kanban_status = previousStatus; this.showToast('Erreur de connexion, statut non enregistré.', true); }
    });
  }

  dotsWindow(): number[] {
    // Affiche au plus 5 points autour de la position actuelle, pour ne pas
    // étaler 50 points sur l'écran quand la pile est longue.
    const total = this.deck().length;
    const current = this.deckIndex();
    const windowSize = 5;
    let start = Math.max(0, current - 2);
    start = Math.min(start, Math.max(0, total - windowSize));
    const end = Math.min(total, start + windowSize);
    return Array.from({ length: end - start }, (_, i) => start + i);
  }

  cardTransform(): string {
    const x = this.dragX();
    const y = this.dragY();
    const rotation = x / 14;
    return `translate(${x}px, ${y}px) rotate(${rotation}deg)`;
  }

  likeOpacity(): number {
    return Math.max(0, Math.min(this.dragX() / SWIPE_THRESHOLD, 1));
  }

  passOpacity(): number {
    return Math.max(0, Math.min(-this.dragX() / SWIPE_THRESHOLD, 1));
  }

  onPointerDown(event: PointerEvent) {
    this.activePointerId = event.pointerId;
    this.dragging.set(true);
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.maxMove = 0;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event: PointerEvent) {
    if (!this.dragging() || event.pointerId !== this.activePointerId) return;
    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;
    this.maxMove = Math.max(this.maxMove, Math.abs(dx), Math.abs(dy));
    this.dragX.set(dx);
    this.dragY.set(dy);
  }

  onPointerUp(event: PointerEvent) {
    if (event.pointerId !== this.activePointerId) return;
    this.dragging.set(false);

    const finalX = this.dragX();

    if (finalX > SWIPE_THRESHOLD) {
      this.flyOutAndDecide('interesse', 1);
    } else if (finalX < -SWIPE_THRESHOLD) {
      this.flyOutAndDecide('pas_interesse', -1);
    } else if (this.maxMove < CLICK_MOVE_TOLERANCE) {
      // Geste sans déplacement significatif : c'est un clic, pas un balayage.
      const card = this.currentCard();
      if (card) window.open(card.job.job_url, '_blank', 'noopener');
      this.dragX.set(0);
      this.dragY.set(0);
    } else {
      this.dragX.set(0);
      this.dragY.set(0);
    }
    this.activePointerId = null;
  }

  private flyOutAndDecide(status: 'interesse' | 'pas_interesse', direction: 1 | -1) {
    this.dragX.set(direction * 600);
    setTimeout(() => this.decide(status, true), 200);
  }

  decide(status: 'interesse' | 'pas_interesse', alreadyAnimated = false) {
    const card = this.currentCard();
    if (!card) return;

    if (!alreadyAnimated) {
      this.dragX.set(status === 'interesse' ? 600 : -600);
    }

    this.http.patch(`${this.apiUrl}/matches/${card.id}/update_status/`, { kanban_status: status }).subscribe({
      error: () => this.showToast('Erreur de connexion, statut non enregistré.')
    });

    this.sessionExplored.set(this.sessionExplored() + 1);
    if (this.sessionExplored() === 5) {
      this.notify.info('Bonne dynamique !', "5 offres explorées aujourd'hui — continuez, ça nourrit votre Traction.");
    }

    setTimeout(() => {
      this.dragX.set(0);
      this.dragY.set(0);
      this.deckIndex.set(this.deckIndex() + 1);
    }, 220);
  }

  private showToast(msg: string, isError = false) {
    if (isError) this.notify.error('Oups', msg);
    else this.notify.success('Fait', msg);
  }
}
