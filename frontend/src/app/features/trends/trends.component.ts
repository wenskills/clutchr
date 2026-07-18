import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarComponent } from '../../shared/sidebar.component';
import { IconComponent } from '../../shared/icon.component';

interface SkillTrend { skill: string; count: number; share: number; }
interface TechTrend { full_name: string; description: string; language: string; stars_period: number; stars_total: number; url: string; }

/**
 * Veille & Tendances — deux sources distinctes :
 * - "Tendances pour vous" : présence réelle des compétences dans VOS
 *   offres déjà collectées (pas une fausse tendance % inventée).
 * - "Tendances tech (GitHub Trending)" : scraping HTML
 */
@Component({
  selector: 'app-trends',
  standalone: true,
  imports: [CommonModule, SidebarComponent, IconComponent],
  template: `
  <div class="layout">
    <app-sidebar active="/veille"></app-sidebar>

    <main class="main">
      <header class="page-header">
        <h1>Veille &amp; Tendances</h1>
      </header>

      <div class="tabs">
        <button [class.active]="view() === 'offres'" (click)="view.set('offres')">Tendances pour vous</button>
        <button [class.active]="view() === 'github'" (click)="view.set('github')">Tendances tech (GitHub)</button>
      </div>

      <!-- TENDANCES DANS VOS OFFRES -->
      <section *ngIf="view() === 'offres'">
        <div class="card">
          <div class="card-head">
            <h2>Compétences en hausse dans vos offres</h2>
            <span class="total-pill" *ngIf="skillTrends().length">{{ totalOffers() }} offres analysées</span>
          </div>

          <p class="empty-hint" *ngIf="!loadingSkills() && !skillTrends().length">
            Aucune offre analysée pour l'instant. Lancez une recherche depuis "Offres &amp; Matching".
          </p>

          <div class="skill-trend-row" *ngFor="let s of skillTrends()">
            <div class="skill-trend-label">{{ s.skill }}</div>
            <div class="skill-trend-track"><div class="skill-trend-fill" [style.width.%]="s.share"></div></div>
            <div class="skill-trend-value">{{ s.share }}% <span class="muted">({{ s.count }} offres)</span></div>
          </div>
        </div>
      </section>

      <!-- TENDANCES TECH GITHUB -->
      <section *ngIf="view() === 'github'">
        <div class="card">
          <div class="card-head">
            <h2>Dépôts en tendance aujourd'hui</h2>
            <button class="btn-refresh" (click)="refreshTech()" [disabled]="refreshing()">
              <app-icon name="refresh" [size]="14"></app-icon> {{ refreshing() ? 'Actualisation...' : 'Actualiser' }}
            </button>
          </div>
          <p class="muted small" *ngIf="lastScraped()">Dernière mise à jour : {{ lastScraped() | date:'short' }}</p>

          <div class="config-warning" *ngIf="scrapeError()">{{ scrapeError() }}</div>

          <p class="empty-hint" *ngIf="!loadingTech() && !techTrends().length && !scrapeError()">
            Aucune donnée pour l'instant. Cliquez sur "Actualiser" pour lancer le scraping.
          </p>

          <a class="tech-row" *ngFor="let t of techTrends()" [href]="t.url" target="_blank" rel="noopener">
            <div class="tech-info">
              <div class="tech-name">{{ t.full_name }}</div>
              <div class="tech-desc">{{ t.description }}</div>
            </div>
            <div class="tech-meta">
              <span class="lang-pill" *ngIf="t.language">{{ t.language }}</span>
              <span class="stars"><app-icon name="star" [size]="11"></app-icon> +{{ t.stars_period }}</span>
            </div>
          </a>
        </div>
      </section>
    </main>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; }
    .layout { display:flex; min-height:100vh; background:#F5F7FA; }
    .main { flex:1; padding:32px 40px; max-width:1200px; }

    .page-header h1 { font-size:24px; font-weight:600; margin-bottom:18px; }

    .tabs { display:flex; gap:6px; margin-bottom:20px; border-bottom:1px solid #E6E9EF; }
    .tabs button { padding:10px 16px; font-size:13.5px; font-weight:500; color:#64748B; border-bottom:2px solid transparent; margin-bottom:-1px; }
    .tabs button.active { color:#7C5CFF; border-bottom-color:#7C5CFF; font-weight:600; }

    .card { background:white; border-radius:18px; padding:24px; box-shadow:0 1px 2px rgba(15,23,42,0.04); }
    .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px; }
    .card-head h2 { font-size:15.5px; font-weight:600; margin:0; }
    .total-pill { font-size:11.5px; background:#F1EEFF; color:#7C5CFF; padding:4px 10px; border-radius:999px; font-weight:600; }

    .muted { color:#94A3B8; }
    .muted.small { font-size:12px; margin-bottom:16px; }
    .empty-hint { color:#94A3B8; font-size:13px; padding:20px 0; text-align:center; }

    .skill-trend-row { display:grid; grid-template-columns: 130px 1fr 130px; align-items:center; gap:14px; padding:11px 0; border-bottom:1px solid #F8FAFC; }
    .skill-trend-label { font-size:13px; font-weight:600; color:#0F172A; }
    .skill-trend-track { height:8px; background:#EEF1F6; border-radius:999px; overflow:hidden; }
    .skill-trend-fill { height:100%; background:linear-gradient(90deg,#7C5CFF,#F857C1); border-radius:999px; transition:width .6s; }
    .skill-trend-value { font-size:12.5px; color:#475569; text-align:right; }

    .btn-refresh {
      display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#7C5CFF;
      background:#F1EEFF; padding:7px 13px; border-radius:9px;
    }
    .btn-refresh:disabled { opacity:.6; cursor:not-allowed; }

    .config-warning { background:#FFFBEB; color:#92400E; padding:14px 18px; border-radius:12px; font-size:13px; margin: 12px 0; }

    .tech-row {
      display:flex; justify-content:space-between; align-items:center; gap:14px; padding:14px 0;
      border-bottom:1px solid #F8FAFC; text-decoration:none; color:inherit;
    }
    .tech-row:hover .tech-name { color:#7C5CFF; }
    .tech-info { min-width:0; }
    .tech-name { font-size:13.5px; font-weight:600; color:#0F172A; transition: color 150ms; }
    .tech-desc { font-size:12px; color:#94A3B8; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:480px; }
    .tech-meta { display:flex; align-items:center; gap:10px; flex-shrink:0; }
    .lang-pill { font-size:11px; background:#F1EEFF; color:#6645E0; padding:3px 9px; border-radius:999px; font-weight:600; }
    .stars { font-size:12.5px; color:#F59E0B; font-weight:600; display:inline-flex; align-items:center; gap:4px; }

    @media (max-width: 900px) {
      .main { padding:20px; }
      .skill-trend-row { grid-template-columns: 90px 1fr 90px; gap:8px; }
      .tech-desc { max-width: 200px; }
    }
  `]
})
export class TrendsComponent implements OnInit {
  private apiUrl = 'http://localhost:8000/api/v1';

  view = signal<'offres' | 'github'>('offres');

  skillTrends = signal<SkillTrend[]>([]);
  totalOffers = signal(0);
  loadingSkills = signal(true);

  techTrends = signal<TechTrend[]>([]);
  lastScraped = signal<string | null>(null);
  loadingTech = signal(true);
  refreshing = signal(false);
  scrapeError = signal('');

  constructor(private http: HttpClient, private auth: AuthService) {}

  ngOnInit() {
    this.loadSkillTrends();
    this.loadTechTrends();
  }

  loadSkillTrends() {
    this.loadingSkills.set(true);
    this.http.get<any>(`${this.apiUrl}/trends/skills_in_offers/`).subscribe({
      next: (res) => {
        this.skillTrends.set(res.skills || []);
        this.totalOffers.set(res.total_offers || 0);
        this.loadingSkills.set(false);
      },
      error: () => { this.loadingSkills.set(false); }
    });
  }

  loadTechTrends() {
    this.loadingTech.set(true);
    this.http.get<any>(`${this.apiUrl}/trends/tech/`).subscribe({
      next: (res) => {
        this.techTrends.set(res.trends || []);
        this.lastScraped.set(res.last_scraped);
        this.loadingTech.set(false);
      },
      error: () => { this.loadingTech.set(false); }
    });
  }

  refreshTech() {
    this.refreshing.set(true);
    this.scrapeError.set('');
    this.http.post<any>(`${this.apiUrl}/trends/refresh-tech/`, {}).subscribe({
      next: () => { this.refreshing.set(false); this.loadTechTrends(); },
      error: (err) => {
        this.refreshing.set(false);
        this.scrapeError.set(AuthService.extractErrorMessage(err) || "Scraping indisponible pour le moment.");
      }
    });
  }
}
