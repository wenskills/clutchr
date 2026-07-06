import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarComponent } from '../../shared/sidebar.component';
import { IconComponent } from '../../shared/icon.component';

interface Priority {
  type: string;
  title: string;
  subtitle: string;
  route: string;
  completed?: boolean;
}

interface ActivityEvent {
  type: string;
  description: string;
  timestamp: string;
  route: string;
}

interface SkillTrend {
  skill: string;
  current_share: number;
  previous_share: number;
  delta: number;
}

const PRIORITY_ICONS: Record<string, string> = {
  offers: 'briefcase',
  skill: 'target',
  network: 'users',
};

/**
 * Tableau de bord décisionnel — chaque élément répond à "qu'est-ce que
 * je fais aujourd'hui ?". Aucune donnée affichée n'est inventée : les
 * priorités sont calculées côté serveur depuis l'historique réel, pas
 * générées par un modèle de langage.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarComponent, IconComponent],
  template: `
  <div class="layout">
    <app-sidebar active="/tableau-de-bord"></app-sidebar>

    <main class="main">
      <header class="header">
        <h1>{{ greeting() }}, {{ firstName() }}</h1>
        <p class="muted">Voici ce qui mérite votre attention aujourd'hui.</p>
      </header>

      <div class="skeleton-block" *ngIf="loading()"></div>

      <ng-container *ngIf="!loading() && data()">

        <div class="top-row">
          <section class="card priorities-card">
            <div class="card-head">
              <h2>Mission du jour</h2>
              <span class="progress-text" *ngIf="priorities().length">{{ completedCount() }} / {{ priorities().length }}</span>
            </div>
            <p class="card-subtitle" *ngIf="priorities().length">On avance ensemble, une action à la fois.</p>

            <div class="progress-track" *ngIf="priorities().length">
              <div class="progress-fill" [style.width.%]="(completedCount() / priorities().length) * 100"></div>
            </div>

            <div class="priority-list" *ngIf="priorities().length; else noPriorities">
              <div class="priority-item" *ngFor="let p of priorities()" [class.done]="p.completed">
                <button class="priority-checkbox" (click)="togglePriority(p)" [attr.aria-label]="p.completed ? 'Marquer à refaire' : 'Marquer comme fait'">
                  <app-icon [name]="p.completed ? 'check-circle' : 'circle'" [size]="19"></app-icon>
                </button>
                <a class="priority-link" [routerLink]="p.route">
                  <div class="priority-icon">
                    <app-icon [name]="iconFor(p.type)" [size]="17"></app-icon>
                  </div>
                  <div class="priority-text">
                    <div class="priority-title">{{ p.title }}</div>
                    <div class="priority-subtitle">{{ p.subtitle }}</div>
                  </div>
                  <app-icon name="chevron-right" [size]="16" color="#94A3B8"></app-icon>
                </a>
              </div>
            </div>
            <ng-template #noPriorities>
              <p class="empty-hint">Rien d'urgent pour l'instant. Lancez une recherche pour que je trouve de nouvelles pistes.</p>
            </ng-template>
          </section>

          <section class="card pulse-card">
            <div class="card-head">
              <div class="card-head-title">
                <h2>Traction</h2>
                <span class="info-dot" title="Score global calculé à partir de 5 axes : employabilité, compétences, réseau, documents, visibilité. Mesure l'état de votre profil, pas votre activité récente (voir Momentum).">
                  <app-icon name="info" [size]="13"></app-icon>
                </span>
              </div>
              <span class="pulse-state-badge" [class]="'state-' + data()!.pulse.state.state">{{ data()!.pulse.state.label }}</span>
            </div>
            <p class="card-subtitle">{{ pulseNarrative() }}</p>
            <div class="pulse-main">
              <div class="pulse-score" *ngIf="data()!.pulse.score !== null">{{ animatedPulse() }}</div>
              <div class="pulse-score muted-score" *ngIf="data()!.pulse.score === null">—</div>
              <div class="pulse-delta" *ngIf="data()!.pulse.delta_7d !== null"
                   [class.negative]="data()!.pulse.delta_7d! < 0">
                <app-icon [name]="data()!.pulse.delta_7d! >= 0 ? 'trending-up' : 'arrow-right'" [size]="13"></app-icon>
                {{ data()!.pulse.delta_7d! >= 0 ? '+' : '' }}{{ data()!.pulse.delta_7d }} sur 7 jours
              </div>
              <div class="pulse-delta muted-score" *ngIf="data()!.pulse.delta_7d === null">
                Historique en cours de constitution
              </div>
            </div>

            <svg class="sparkline" *ngIf="sparklinePoints()" viewBox="0 0 240 56" preserveAspectRatio="none">
              <polyline [attr.points]="sparklinePoints()" fill="none" stroke="#7C5CFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>

            <div class="breakdown-list">
              <div class="breakdown-row" *ngFor="let b of breakdownRows()">
                <span class="breakdown-label">
                  {{ b.label }}
                  <app-icon name="info" [size]="11" class="breakdown-info" [attr.title]="breakdownHint(b.label)"></app-icon>
                </span>
                <div class="breakdown-track">
                  <div class="breakdown-fill" [style.width.%]="b.value ?? 0" [class.unavailable]="b.value === null"></div>
                </div>
                <span class="breakdown-value">{{ b.value !== null ? b.value + '%' : 'n/d' }}</span>
              </div>
            </div>

            <div class="momentum-block">
              <div class="momentum-head">
                <span class="momentum-title">Momentum</span>
                <span class="momentum-state" [class]="'mstate-' + data()!.momentum.state">{{ data()!.momentum.label }}</span>
              </div>
              <p class="momentum-sub">{{ momentumNarrative() }}</p>
              <div class="momentum-track"><div class="momentum-fill" [class]="'mstate-' + data()!.momentum.state" [style.width.%]="data()!.momentum.score"></div></div>
            </div>
          </section>
        </div>

        <div class="stat-row">
          <div class="stat-chip">
            <div class="stat-value">{{ data()!.opportunity_stats.excellent_count }}</div>
            <div class="stat-label">Offres &gt; 90 % match</div>
            <div class="stat-hint">Très forte correspondance avec votre profil</div>
          </div>
          <div class="stat-chip">
            <div class="stat-value">{{ data()!.opportunity_stats.new_since_yesterday }}</div>
            <div class="stat-label">Nouvelles depuis hier</div>
            <div class="stat-hint">Apparues lors de votre dernière recherche</div>
          </div>
          <div class="stat-chip">
            <div class="stat-value">{{ data()!.opportunity_stats.total }}</div>
            <div class="stat-label">Offres correspondantes</div>
            <div class="stat-hint">Toutes correspondances actives, tous niveaux</div>
          </div>
          <div class="stat-chip">
            <div class="stat-value" *ngIf="data()!.opportunity_stats.employability_delta_7d !== null"
                 [class.negative-text]="data()!.opportunity_stats.employability_delta_7d! < 0">
              {{ data()!.opportunity_stats.employability_delta_7d! >= 0 ? '+' : '' }}{{ data()!.opportunity_stats.employability_delta_7d }}
            </div>
            <div class="stat-value muted-score" *ngIf="data()!.opportunity_stats.employability_delta_7d === null">n/d</div>
            <div class="stat-label">Qualité moyenne vs 7 jours</div>
            <div class="stat-hint" *ngIf="data()!.opportunity_stats.employability_delta_7d === null">Disponible après 7 jours d'historique</div>
            <div class="stat-hint" *ngIf="data()!.opportunity_stats.employability_delta_7d !== null">Évolution du score moyen de vos offres</div>
          </div>
        </div>

        <section class="card stage-card">
          <div class="card-head"><h2>Votre progression</h2></div>
          <div class="stage-map">
            <div class="stage-step" *ngFor="let s of data()!.career_stage.all_stages; let i = index"
                 [class.done]="i < data()!.career_stage.stage_index"
                 [class.current]="i === data()!.career_stage.stage_index"
                 [class.upcoming]="i > data()!.career_stage.stage_index">
              <div class="stage-dot">
                <app-icon *ngIf="i < data()!.career_stage.stage_index" name="check-circle" [size]="13"></app-icon>
              </div>
              <span class="stage-label">{{ s.label }}</span>
            </div>
          </div>
          <p class="stage-description">{{ data()!.career_stage.current.description }}</p>
        </section>

        <div class="bento-row">
          <section class="card">
            <div class="card-head">
              <h2>Pipeline de candidatures</h2>
              <a routerLink="/suivi" class="link-manage">Voir le suivi <app-icon name="arrow-right" [size]="12"></app-icon></a>
            </div>
            <p class="card-subtitle">Répartition de vos candidatures par étape, du plus récent au plus avancé.</p>
            <div class="pipeline-row" *ngFor="let p of pipelineRows()">
              <span class="pipeline-label">{{ p.label }}</span>
              <div class="pipeline-track"><div class="pipeline-fill" [style.width.%]="p.percent"></div></div>
              <span class="pipeline-count">{{ p.count }}</span>
            </div>
            <p class="empty-hint" *ngIf="!pipelineTotal()">Aucune candidature suivie pour l'instant. Marquez une offre "Intéressé" ou "Postulé" pour la voir apparaître ici.</p>
          </section>

          <section class="card">
            <div class="card-head">
              <h2>Tendances dans vos offres</h2>
              <a routerLink="/veille" class="link-manage">Tout voir <app-icon name="arrow-right" [size]="12"></app-icon></a>
            </div>
            <p class="card-subtitle">Compétences en progression dans les offres qui vous correspondent.</p>
            <div class="trend-row" *ngFor="let t of data()!.skill_trends">
              <span class="trend-skill">{{ t.skill }}</span>
              <span class="trend-delta" [class.negative]="t.delta < 0">
                <app-icon [name]="t.delta >= 0 ? 'trending-up' : 'arrow-right'" [size]="12"></app-icon>
                {{ t.delta >= 0 ? '+' : '' }}{{ t.delta }} pts
              </span>
            </div>
            <p class="empty-hint" *ngIf="!data()!.skill_trends.length">
              Pas encore assez d'historique pour calculer une tendance (revenez dans quelques jours).
            </p>
          </section>
        </div>

        <section class="card hiring-card" *ngIf="data()!.companies_hiring_today?.length">
          <div class="card-head"><h2>Entreprises qui recrutent aujourd'hui</h2></div>
          <p class="card-subtitle">Parmi les entreprises que vous suivez dans Réseau &amp; Contacts.</p>
          <div class="hiring-chips">
            <a class="hiring-chip" *ngFor="let c of data()!.companies_hiring_today" routerLink="/offres">{{ c }}</a>
          </div>
        </section>

        <a class="card gap-cta" routerLink="/analyse-ecart" *ngIf="data()!.skill_gap_teaser?.coverage_score !== null">
          <div class="gap-cta-icon"><app-icon name="target" [size]="20" color="#7C5CFF"></app-icon></div>
          <div class="gap-cta-text">
            <strong>Vous possédez {{ data()!.skill_gap_teaser.coverage_score }}% des compétences demandées</strong>
            <span *ngIf="data()!.skill_gap_teaser.top_missing_skill">
              « {{ data()!.skill_gap_teaser.top_missing_skill }} » est la compétence la plus fréquemment manquante.
            </span>
          </div>
          <app-icon name="arrow-right" [size]="16" color="#94A3B8"></app-icon>
        </a>

        <section class="card activity-card">
          <div class="card-head"><h2>Activité récente</h2></div>
          <a class="activity-row" *ngFor="let a of data()!.recent_activity" [routerLink]="a.route">
            <app-icon [name]="a.type === 'new_listing' ? 'briefcase' : 'layers'" [size]="15" color="#7C5CFF"></app-icon>
            <span class="activity-desc">{{ a.description }}</span>
            <span class="activity-time">{{ relativeTime(a.timestamp) }}</span>
          </a>
          <p class="empty-hint" *ngIf="!data()!.recent_activity.length">
            Rien à signaler pour l'instant — suivez des entreprises et lancez des recherches pour alimenter cette section.
          </p>
        </section>

        <section class="card completeness-card" *ngIf="data()!.profile_completeness.percentage < 100">
          <div class="completeness-ring">
            <svg viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="25" fill="none" stroke="#EEF1F6" stroke-width="6"/>
              <circle cx="30" cy="30" r="25" fill="none" stroke="#7C5CFF" stroke-width="6"
                [attr.stroke-dasharray]="(data()!.profile_completeness.percentage / 100) * 157 + ' 157'"
                stroke-linecap="round" transform="rotate(-90 30 30)"/>
            </svg>
            <div class="completeness-number">{{ data()!.profile_completeness.percentage }}%</div>
          </div>
          <div>
            <div class="completeness-title">Profil incomplet</div>
            <div class="completeness-sub">{{ missingLabel() }}</div>
          </div>
          <a routerLink="/profil" class="btn-complete">Compléter</a>
        </section>

      </ng-container>
    </main>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; }
    .layout { display:flex; min-height:100vh; background:#F5F7FA; }
    .main { flex:1; padding:32px 40px; max-width: 1500px; }

    .header h1 { font-size:24px; font-weight:600; margin-bottom:4px; }
    .muted { color:#64748B; font-size:14px; margin-bottom:24px; }

    .skeleton-block { height: 320px; border-radius: 18px; background: linear-gradient(90deg,#EEF1F6 25%,#F5F7FA 50%,#EEF1F6 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .top-row { display:grid; grid-template-columns: 1fr; gap:16px; margin-bottom:16px; }
    @media (min-width: 980px) { .top-row { grid-template-columns: 1.3fr 1fr; } }

    .card { background:white; border-radius:18px; padding:24px; box-shadow:0 1px 2px rgba(15,23,42,0.04); }
    .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .card-head-title { display:flex; align-items:center; gap:7px; }
    .info-dot { color:#CBD5E1; display:inline-flex; align-items:center; cursor:help; }
    .info-dot:hover { color:#7C5CFF; }
    .card-subtitle { font-size:12.5px; color:#94A3B8; margin:-10px 0 16px; }

    .pulse-state-badge {
      font-size:11px; font-weight:700; padding:4px 11px; border-radius:999px; white-space:nowrap;
    }
    .pulse-state-badge.state-acceleration { background:#ECFDF5; color:#0D9488; }
    .pulse-state-badge.state-stable { background:#F1EEFF; color:#6645E0; }
    .pulse-state-badge.state-ralentissement { background:#FFFBEB; color:#92400E; }
    .pulse-state-badge.state-demarrage { background:#F1F5F9; color:#64748B; }

    .momentum-block { margin-top:18px; padding-top:16px; border-top:1px solid #F1F4F8; }
    .momentum-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
    .momentum-title { font-size:12.5px; font-weight:700; color:#334155; }
    .momentum-state { font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:999px; }
    .momentum-state.mstate-acceleration { background:#ECFDF5; color:#0D9488; }
    .momentum-state.mstate-stable { background:#F1EEFF; color:#6645E0; }
    .momentum-state.mstate-ralenti { background:#FFFBEB; color:#92400E; }
    .momentum-state.mstate-inactif { background:#F1F5F9; color:#94A3B8; }
    .momentum-sub { font-size:11.5px; color:#94A3B8; margin:0 0 8px; line-height:1.5; }
    .momentum-track { height:6px; background:#EEF1F6; border-radius:999px; overflow:hidden; }
    .momentum-fill { height:100%; border-radius:999px; transition:width .6s; }
    .momentum-fill.mstate-acceleration { background:linear-gradient(90deg,#2DD4BF,#0D9488); }
    .momentum-fill.mstate-stable { background:linear-gradient(90deg,#7C5CFF,#6645E0); }
    .momentum-fill.mstate-ralenti { background:linear-gradient(90deg,#F59E0B,#D97706); }
    .momentum-fill.mstate-inactif { background:#CBD5E1; }

    .stage-card { margin-bottom:16px; }
    .stage-map { display:flex; align-items:center; margin:12px 0 10px; }
    .stage-step { display:flex; flex-direction:column; align-items:center; gap:8px; flex:1; position:relative; }
    .stage-step:not(:last-child)::after {
      content:''; position:absolute; top:9px; left:50%; width:100%; height:2px; background:#E6E9EF; z-index:0;
    }
    .stage-step.done:not(:last-child)::after { background:#2DD4BF; }
    .stage-dot {
      width:20px; height:20px; border-radius:50%; background:#E6E9EF; z-index:1; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; color:white;
    }
    .stage-step.done .stage-dot { background:#2DD4BF; }
    .stage-step.current .stage-dot { background:#7C5CFF; box-shadow:0 0 0 4px rgba(124,92,255,0.18); }
    .stage-label { font-size:11px; font-weight:600; color:#94A3B8; text-align:center; }
    .stage-step.current .stage-label { color:#7C5CFF; }
    .stage-step.done .stage-label { color:#0F172A; }
    .stage-description { font-size:12.5px; color:#64748B; margin:0; }
    .breakdown-info { color:#CBD5E1; margin-left:5px; cursor:help; vertical-align:-1px; }
    .breakdown-info:hover { color:#7C5CFF; }
    .stat-hint { font-size:10px; color:#CBD5E1; margin-top:3px; line-height:1.3; }

    .gap-cta {
      display:flex; align-items:center; gap:14px; text-decoration:none; margin-bottom:16px;
      transition: transform 150ms;
    }
    .gap-cta:hover { transform: translateX(2px); }
    .gap-cta-icon { width:40px; height:40px; border-radius:11px; background:#F1EEFF; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .gap-cta-text { flex:1; display:flex; flex-direction:column; gap:3px; }
    .gap-cta-text strong { font-size:13.5px; color:#0F172A; }
    .gap-cta-text span { font-size:12px; color:#64748B; }
    .card-head h2 { font-size:15px; font-weight:600; margin:0; }
    .link-manage { font-size:12.5px; font-weight:600; color:#7C5CFF; text-decoration:none; display:flex; align-items:center; gap:4px; }

    .priority-list { display:flex; flex-direction:column; gap:8px; }
    .progress-text { font-size:12px; font-weight:600; color:#7C5CFF; }
    .progress-track { height:5px; background:#EEF1F6; border-radius:999px; overflow:hidden; margin-bottom:14px; }
    .progress-fill { height:100%; background:linear-gradient(90deg,#7C5CFF,#2DD4BF); border-radius:999px; transition: width .4s; }

    .priority-item { display:flex; align-items:center; gap:8px; border-radius:12px; transition: background 150ms; }
    .priority-item.done { opacity:.5; }
    .priority-item.done .priority-title { text-decoration:line-through; }
    .priority-checkbox { color:#CBD5E1; flex-shrink:0; padding:6px; }
    .priority-checkbox:hover { color:#7C5CFF; }
    .priority-item.done .priority-checkbox { color:#2DD4BF; }
    .priority-link { display:flex; align-items:center; gap:13px; flex:1; padding:10px 8px; text-decoration:none; min-width:0; border-radius:10px; }
    .priority-link:hover { background:#F8FAFC; }
    .priority-icon { width:34px; height:34px; border-radius:10px; background:#F1EEFF; color:#7C5CFF; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .priority-text { flex:1; min-width:0; }
    .priority-title { font-size:13.5px; font-weight:600; color:#0F172A; }
    .priority-subtitle { font-size:12px; color:#94A3B8; margin-top:2px; }

    .empty-hint { color:#94A3B8; font-size:13px; padding: 8px 0; }

    .pulse-main { margin-bottom:14px; }
    .pulse-score { font-size:38px; font-weight:700; color:#0F172A; line-height:1; }
    .pulse-score.muted-score { color:#CBD5E1; }
    .pulse-delta { font-size:12.5px; color:#2DD4BF; font-weight:600; display:flex; align-items:center; gap:4px; margin-top:6px; }
    .pulse-delta.negative { color:#F59E0B; }
    .pulse-delta.muted-score { color:#94A3B8; font-weight:500; }

    .sparkline { width:100%; height:48px; margin-bottom:16px; }

    .breakdown-list { display:flex; flex-direction:column; gap:9px; }
    .breakdown-row { display:grid; grid-template-columns: 92px 1fr 38px; align-items:center; gap:10px; }
    .breakdown-label { font-size:11.5px; color:#64748B; }
    .breakdown-track { height:6px; background:#EEF1F6; border-radius:999px; overflow:hidden; }
    .breakdown-fill { height:100%; background:#7C5CFF; border-radius:999px; transition: width .5s; }
    .breakdown-fill.unavailable { background:#E2E8F0; width:0 !important; }
    .breakdown-value { font-size:11px; color:#94A3B8; text-align:right; }

    .stat-row { display:grid; grid-template-columns: repeat(2,1fr); gap:14px; margin-bottom:16px; }
    @media (min-width: 768px) { .stat-row { grid-template-columns: repeat(4,1fr); } }
    .stat-chip { background:white; border-radius:14px; padding:16px; box-shadow:0 1px 2px rgba(15,23,42,0.04); }
    .stat-value { font-size:22px; font-weight:700; color:#0F172A; }
    .stat-value.muted-score { color:#CBD5E1; font-size:16px; }
    .stat-value.negative-text { color:#F59E0B; }
    .stat-label { font-size:11.5px; color:#94A3B8; margin-top:4px; }

    .bento-row { display:grid; grid-template-columns:1fr; gap:16px; margin-bottom:16px; }
    @media (min-width: 980px) { .bento-row { grid-template-columns: 1fr 1fr; } }

    .pipeline-row { display:grid; grid-template-columns: 90px 1fr 30px; align-items:center; gap:10px; padding:7px 0; }
    .pipeline-label { font-size:12px; color:#475569; }
    .pipeline-track { height:8px; background:#EEF1F6; border-radius:999px; overflow:hidden; }
    .pipeline-fill { height:100%; background:linear-gradient(90deg,#7C5CFF,#F857C1); border-radius:999px; transition: width .5s; }
    .pipeline-count { font-size:12.5px; font-weight:600; text-align:right; }

    .trend-row { display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid #F8FAFC; }
    .trend-row:last-child { border-bottom:none; }
    .trend-skill { font-size:13px; font-weight:600; color:#0F172A; }
    .trend-delta { font-size:12px; font-weight:600; color:#2DD4BF; display:flex; align-items:center; gap:4px; }
    .trend-delta.negative { color:#F59E0B; }

    .hiring-card { margin-bottom:16px; }
    .hiring-chips { display:flex; flex-wrap:wrap; gap:9px; }
    .hiring-chip {
      font-size:12.5px; font-weight:600; color:#7C5CFF; background:#F1EEFF; padding:8px 15px; border-radius:999px;
      text-decoration:none;
    }
    .hiring-chip:hover { background:#E5DEFF; }

    .activity-card { margin-bottom:16px; }
    .activity-row { display:flex; align-items:center; gap:11px; padding:10px 0; border-bottom:1px solid #F8FAFC; text-decoration:none; color:inherit; }
    .activity-row:last-child { border-bottom:none; }
    .activity-desc { flex:1; font-size:12.5px; color:#334155; }
    .activity-time { font-size:11px; color:#94A3B8; flex-shrink:0; }

    .completeness-card { display:flex; align-items:center; gap:18px; }
    .completeness-ring { position:relative; width:60px; height:60px; flex-shrink:0; }
    .completeness-ring svg { width:100%; height:100%; }
    .completeness-number { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; }
    .completeness-title { font-size:13.5px; font-weight:600; color:#0F172A; }
    .completeness-sub { font-size:12px; color:#94A3B8; margin-top:2px; }
    .btn-complete { margin-left:auto; padding:9px 16px; border-radius:10px; background:#1B1C2A; color:white; font-size:12.5px; font-weight:600; text-decoration:none; flex-shrink:0; }

    @media (max-width: 900px) { .main { padding:20px; } }
  `]
})
export class DashboardComponent implements OnInit {
  private apiUrl = 'http://localhost:8000/api/v1';

  loading = signal(true);
  data = signal<any>(null);
  firstName = signal('');
  animatedPulse = signal(0);

  constructor(private http: HttpClient, private auth: AuthService, private router: Router) {}

  ngOnInit() {
    const user = this.auth.getCurrentUser();
    this.firstName.set(user?.first_name || user?.username || '');

    this.http.get<any>(`${this.apiUrl}/profile/today/`).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
        if (res.pulse.score !== null) this.animateCountUp(res.pulse.score);
      },
      error: () => { this.loading.set(false); }
    });
  }

  private animateCountUp(target: number) {
    const duration = 700;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      this.animatedPulse.set(Math.round(target * progress));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }

  priorities(): Priority[] {
    return this.data()?.priorities || [];
  }

  completedCount(): number {
    return this.priorities().filter(p => p.completed).length;
  }

  togglePriority(p: Priority) {
    if (p.completed) return; // pas de "décocher" — la priorité disparaît demain naturellement
    p.completed = true;
    this.http.post(`${this.apiUrl}/profile/complete-priority/`, { action_type: p.type }).subscribe({
      error: () => { p.completed = false; }
    });
  }

  iconFor(type: string): string {
    return PRIORITY_ICONS[type] || 'target';
  }

  breakdownRows() {
    const b = this.data()?.pulse?.breakdown;
    if (!b) return [];
    return [
      { label: 'Employabilité', value: b.employability },
      { label: 'Compétences', value: b.skills },
      { label: 'Réseau', value: b.network },
      { label: 'Documents', value: b.documents },
      { label: 'Visibilité', value: b.visibility },
    ];
  }

  breakdownHint(label: string): string {
    const hints: Record<string, string> = {
      'Employabilité': "Part de vos offres correspondantes à plus de 75 %. Augmente en complétant votre profil et en développant les compétences manquantes.",
      'Compétences': "Couverture de vos compétences par rapport à ce que vos offres ciblées demandent.",
      'Réseau': "Avancement de vos démarches auprès des entreprises et contacts identifiés.",
      'Documents': "CV et profil LinkedIn importés et structurés.",
      'Visibilité': "Activité de publication sur LinkedIn. Indisponible tant qu'aucun post n'a été enregistré.",
    };
    return hints[label] || '';
  }

  pulseNarrative(): string {
    const pulse = this.data()?.pulse;
    if (!pulse) return '';
    const delta = pulse.delta_7d;
    if (delta === null) return "Je commence à apprendre votre situation — revenez dans quelques jours.";
    if (delta > 2) return "Votre profil est plus solide que la semaine dernière. On continue sur cette lancée.";
    if (delta < -2) return "Votre score a un peu reculé — souvent le signe qu'il manque une compétence ou une donnée à jour.";
    return "Votre situation est stable. Continuons à la faire progresser.";
  }

  momentumNarrative(): string {
    const m = this.data()?.momentum;
    if (!m) return '';
    if (m.state === 'inactif') return "Aucune action cette semaine. Une candidature ou un message suffit pour relancer la dynamique.";
    if (m.state === 'ralenti') return `${m.active_days_last_7} jour(s) actif(s) cette semaine. On peut faire un peu mieux.`;
    if (m.state === 'stable') return `${m.active_days_last_7} jour(s) actif(s) cette semaine — un bon rythme.`;
    return `${m.active_days_last_7} jour(s) actif(s) cette semaine. Votre carrière avance vite en ce moment.`;
  }

  sparklinePoints(): string {
    const history = this.data()?.pulse?.history || [];
    const valid = history.filter((h: any) => h.pulse_score !== null);
    if (valid.length < 2) return '';

    const scores = valid.map((h: any) => h.pulse_score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;

    return valid
      .map((h: any, i: number) => {
        const x = (i / (valid.length - 1)) * 240;
        const y = 50 - ((h.pulse_score - min) / range) * 44;
        return `${x},${y}`;
      })
      .join(' ');
  }

  pipelineRows() {
    const p = this.data()?.pipeline;
    if (!p) return [];
    const max = Math.max(...(Object.values(p) as number[]), 1);
    const labels: Record<string, string> = {
      interesse: 'Intéressé', postule: 'Postulé', entretien: 'Entretien',
      offre: 'Offre reçue', refuse: 'Refusé', abandonne: 'Abandonné',
    };
    return Object.entries(p)
      .filter(([, count]) => (count as number) > 0)
      .map(([key, count]) => ({
        label: labels[key] || key,
        count: count as number,
        percent: ((count as number) / max) * 100,
      }));
  }

  pipelineTotal(): number {
    const p = this.data()?.pipeline;
    if (!p) return 0;
    return (Object.values(p) as number[]).reduce((sum, v) => sum + v, 0);
  }

  missingLabel(): string {
    const missing = this.data()?.profile_completeness?.missing || [];
    const labels: Record<string, string> = {
      skills: 'compétences', target_roles: 'postes ciblés', target_locations: 'lieux ciblés',
      documents: 'CV ou LinkedIn', salary_target: 'salaire souhaité', bio: 'bio',
    };
    return missing.map((m: string) => labels[m] || m).join(', ');
  }

  relativeTime(isoTimestamp: string): string {
    const diffMs = Date.now() - new Date(isoTimestamp).getTime();
    const hours = Math.floor(diffMs / 3600000);
    if (hours < 1) return "à l'instant";
    if (hours < 24) return `il y a ${hours} h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days} j`;
  }
}
