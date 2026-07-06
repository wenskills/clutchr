import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { SidebarComponent } from '../../shared/sidebar.component';
import { IconComponent } from '../../shared/icon.component';

interface GapEntry { skill: string; count: number; share: number; }

/**
 * Analyse d'écart de compétences — agrégée depuis les `skill_gaps` déjà
 * calculés par offre lors du matching. Aucune nouvelle source externe :
 * c'est une lecture different de données qu'on a déjà.
 */
@Component({
  selector: 'app-skill-gap',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarComponent, IconComponent],
  template: `
  <div class="layout">
    <app-sidebar active="/analyse-ecart"></app-sidebar>

    <main class="main">
      <header class="page-header">
        <h1>Analyse d'écart de compétences</h1>
        <p class="muted">Les compétences qui manquent le plus souvent dans vos offres correspondantes — ce qui vaut le plus la peine d'être appris.</p>
      </header>

      <div class="empty-state" *ngIf="!loading() && !gaps().length">
        <app-icon name="target" [size]="32" color="#CBD5E1"></app-icon>
        <p>Pas encore assez de données. Lancez une recherche depuis "Offres &amp; Matching" pour voir apparaître votre analyse.</p>
        <a routerLink="/offres" class="btn-primary-action">Aller à Offres &amp; Matching</a>
      </div>

      <div class="coverage-banner" *ngIf="coverageScore() !== null">
        <div class="coverage-ring">
          <svg viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="25" fill="none" stroke="#EEF1F6" stroke-width="6"/>
            <circle cx="30" cy="30" r="25" fill="none" stroke="#2DD4BF" stroke-width="6"
              [attr.stroke-dasharray]="(coverageScore()! / 100) * 157 + ' 157'"
              stroke-linecap="round" transform="rotate(-90 30 30)"/>
          </svg>
          <div class="coverage-number">{{ coverageScore() }}%</div>
        </div>
        <p>Vous possédez déjà <strong>{{ coverageScore() }}%</strong> des compétences demandées dans vos offres correspondantes.</p>
      </div>

      <div class="gap-layout">
        <div class="card" *ngIf="gaps().length">
          <div class="card-head">
            <h2>Compétences manquantes les plus fréquentes</h2>
            <span class="total-pill">{{ totalOffers() }} offres analysées</span>
          </div>

          <div class="gap-row" *ngFor="let g of gaps()">
            <div class="gap-label">{{ g.skill }}</div>
            <div class="gap-track"><div class="gap-fill" [style.width.%]="g.share"></div></div>
            <div class="gap-value">{{ g.share }}% <span class="muted">({{ g.count }} offres)</span></div>
          </div>

          <p class="hint">
            <app-icon name="sparkles" [size]="13"></app-icon>
            Priorisez les compétences en haut de cette liste : ce sont celles qui débloqueraient le plus d'offres correspondantes.
          </p>
        </div>

        <div class="card radar-side" *ngIf="salaryRadar().length">
          <div class="card-head">
            <h2>Radar de salaire</h2>
          </div>
          <p class="muted small">Écart de salaire moyen observé dans vos offres, calculé sur votre échantillon — pas une moyenne de marché.</p>

          <div class="radar-row" *ngFor="let r of salaryRadar()">
            <span class="radar-skill">{{ r.skill }}</span>
            <span class="radar-value" *ngIf="r.salary_impact !== null" [class.positive]="r.salary_impact >= 0">
              {{ r.salary_impact >= 0 ? '+' : '' }}{{ r.salary_impact }} €
            </span>
            <span class="radar-value muted" *ngIf="r.salary_impact === null">Données insuffisantes</span>
          </div>
        </div>
      </div>
    </main>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; }
    .layout { display:flex; min-height:100vh; background:#F5F7FA; }
    .main { flex:1; padding:32px 40px; max-width:1320px; }

    .page-header h1 { font-size:24px; font-weight:600; margin-bottom:6px; }
    .muted { color:#94A3B8; font-size:13.5px; margin-bottom:20px; }

    .empty-state { text-align:center; padding:70px 20px; display:flex; flex-direction:column; align-items:center; gap:14px; }
    .empty-state p { color:#94A3B8; font-size:13.5px; max-width:400px; }
    .btn-primary-action {
      padding:11px 18px; border-radius:11px; background:linear-gradient(135deg,#7C5CFF,#6645E0);
      color:white; font-weight:600; font-size:13px; text-decoration:none;
    }

    .card { background:white; border-radius:18px; padding:24px; box-shadow:0 1px 2px rgba(15,23,42,0.04); }

    .gap-layout { display:grid; grid-template-columns:1fr; gap:20px; align-items:start; }
    @media (min-width: 980px) { .gap-layout { grid-template-columns: 1.6fr 1fr; } }
    .radar-side { position:sticky; top:32px; }
    .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; flex-wrap:wrap; gap:8px; }
    .card-head h2 { font-size:15.5px; font-weight:600; margin:0; }
    .total-pill { font-size:11.5px; background:#F1EEFF; color:#7C5CFF; padding:4px 10px; border-radius:999px; font-weight:600; }

    .gap-row { display:grid; grid-template-columns: 150px 1fr 140px; align-items:center; gap:14px; padding:11px 0; border-bottom:1px solid #F8FAFC; }

    .coverage-banner { background:white; border-radius:18px; padding:20px 24px; box-shadow:0 1px 2px rgba(15,23,42,0.04); margin-bottom:20px; display:flex; align-items:center; gap:18px; }
    .coverage-ring { position:relative; width:60px; height:60px; flex-shrink:0; }
    .coverage-ring svg { width:100%; height:100%; }
    .coverage-number { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; }
    .coverage-banner p { font-size:13.5px; color:#334155; line-height:1.5; margin:0; }

    .radar-row { display:flex; justify-content:space-between; align-items:center; padding:11px 0; border-bottom:1px solid #F8FAFC; }
    .radar-row:last-child { border-bottom:none; }
    .radar-skill { font-size:13px; font-weight:600; color:#0F172A; }
    .radar-value { font-size:14px; font-weight:700; color:#F59E0B; }
    .radar-value.positive { color:#2DD4BF; }
    .radar-value.muted { font-size:12px; font-weight:500; color:#CBD5E1; }
    .gap-label { font-size:13px; font-weight:600; color:#0F172A; }
    .gap-track { height:8px; background:#EEF1F6; border-radius:999px; overflow:hidden; }
    .gap-fill { height:100%; background:linear-gradient(90deg,#F59E0B,#DC2626); border-radius:999px; transition:width .6s; }
    .gap-value { font-size:12.5px; color:#475569; text-align:right; }

    .hint { font-size:12.5px; color:#64748B; margin-top:18px; background:#F8FAFC; padding:12px 14px; border-radius:10px; display:flex; align-items:flex-start; gap:8px; }
    .hint app-icon { flex-shrink:0; margin-top:2px; }

    @media (max-width: 900px) {
      .main { padding:20px; }
      .gap-row { grid-template-columns: 90px 1fr 90px; gap:8px; }
    }
  `]
})
export class SkillGapComponent implements OnInit {
  private apiUrl = 'http://localhost:8000/api/v1';

  gaps = signal<GapEntry[]>([]);
  totalOffers = signal(0);
  loading = signal(true);
  coverageScore = signal<number | null>(null);
  salaryRadar = signal<{ skill: string; salary_impact: number | null; sample_size: number }[]>([]);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<any>(`${this.apiUrl}/matches/skill_gap_summary/`).subscribe({
      next: (res) => {
        this.gaps.set(res.gaps || []);
        this.totalOffers.set(res.total_offers || 0);
        this.coverageScore.set(res.coverage_score ?? null);
        this.salaryRadar.set(res.salary_radar || []);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); }
    });
  }
}
