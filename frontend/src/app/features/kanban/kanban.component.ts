import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarComponent } from '../../shared/sidebar.component';
import { IconComponent } from '../../shared/icon.component';
import { NotifyService } from '../../core/notify/notify.service';

interface MatchVM {
  id: number;
  match_score: number;
  match_level: string;
  kanban_status: string;
  notes: string;
  status_updated_at: string | null;
  labels: { name: string; color: string }[];
  job: {
    title: string;
    company_name: string;
    location: string;
    job_url: string;
    source: string;
    remote_type: string;
    avg_salary: number | null;
  };
}

interface Column { key: string; label: string; items: MatchVM[]; }

interface StatusEvent { from_status: string; to_status: string; occurred_at: string; }

interface InterviewPrep {
  questions_frequentes: string[];
  technologies_a_reviser: string[];
  points_a_mettre_en_avant: string[];
  questions_a_poser: string[];
}

interface FollowupSuggestion {
  match_id: number;
  job_title: string;
  company_name: string;
  days_since: number;
}

/**
 * Pipeline de candidatures — Kanban avec glisser-déposer (Angular CDK)
 * couplé à de vrais indicateurs de pilotage, calculés depuis
 * l'historique réel des changements de statut.
 */
@Component({
  selector: 'app-kanban',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DragDropModule, SidebarComponent, IconComponent],
  template: `
  <div class="layout">
    <app-sidebar active="/suivi"></app-sidebar>

    <main class="main">
      <header class="page-header">
        <h1>Pipeline de candidatures</h1>
        <p class="muted">Glissez les cartes entre colonnes pour mettre à jour le statut.</p>
      </header>

      <div class="view-tabs">
        <button [class.active]="activeView === 'kanban'" (click)="switchView('kanban')">Kanban</button>
        <button [class.active]="activeView === 'timeline'" (click)="switchView('timeline')">Timeline</button>
        <button [class.active]="activeView === 'analytics'" (click)="switchView('analytics')">Analytics</button>
      </div>

      <div class="kpi-row" *ngIf="kpis()">
        <div class="kpi-card">
          <div class="kpi-value" *ngIf="kpis()!.response_rate !== null">{{ kpis()!.response_rate }}%</div>
          <div class="kpi-value muted-value" *ngIf="kpis()!.response_rate === null">n/d</div>
          <div class="kpi-label">Taux de réponse</div>
          <div class="kpi-sub" *ngIf="kpis()!.postule_count">{{ kpis()!.responded_count }} / {{ kpis()!.postule_count }} candidatures</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{{ kpis()!.interviews_count }}</div>
          <div class="kpi-label">Entretiens obtenus</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{{ kpis()!.offers_count }}</div>
          <div class="kpi-label">Offres reçues</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value" *ngIf="kpis()!.avg_response_delay_days !== null">{{ kpis()!.avg_response_delay_days }} j</div>
          <div class="kpi-value muted-value" *ngIf="kpis()!.avg_response_delay_days === null">n/d</div>
          <div class="kpi-label">Délai moyen de réponse</div>
        </div>
      </div>

      <div class="followup-banner" *ngIf="kpis()?.followup_suggestions?.length">
        <div class="followup-head">
          <app-icon name="info" [size]="15" color="#92400E"></app-icon>
          <span>Relances suggérées</span>
        </div>
        <div class="followup-item" *ngFor="let f of kpis()!.followup_suggestions">
          <span>{{ f.job_title }} — {{ f.company_name }}</span>
          <span class="followup-days">{{ f.days_since }} jours sans changement</span>
        </div>
      </div>

      <div class="insight-banner" *ngIf="kpis()?.interview_gap_insights?.length">
        <div class="followup-head">
          <app-icon name="target" [size]="15" color="#6645E0"></app-icon>
          <span>Pourquoi je ne reçois pas d'entretiens ?</span>
        </div>
        <p class="insight-item" *ngFor="let i of kpis()!.interview_gap_insights">{{ i.message }}</p>
      </div>

      <div class="empty-state" *ngIf="activeView === 'kanban' && !loading() && totalCount() === 0">
        <app-icon name="layers" [size]="32" color="#CBD5E1"></app-icon>
        <p>Aucune candidature suivie pour l'instant. Enregistrez ou marquez "postulé" une offre depuis "Offres &amp; Matching" pour la voir apparaître ici.</p>
      </div>

      <div class="board" cdkDropListGroup *ngIf="activeView === 'kanban' && totalCount() > 0">
        <div class="column" *ngFor="let col of columns()">
          <div class="column-head">
            <span class="column-label">{{ col.label }}</span>
            <span class="column-count">{{ col.items.length }}</span>
          </div>

          <div
            class="column-body"
            cdkDropList
            [cdkDropListData]="col.items"
            [id]="col.key"
            (cdkDropListDropped)="onDrop($event, col.key)"
          >
            <div class="kcard" *ngFor="let m of col.items" cdkDrag (click)="openDetail(m)">
              <div class="kcard-top">
                <span class="score-badge" [class]="'lvl-' + m.match_level">{{ m.match_score }}%</span>
                <span class="source-pill">{{ m.job.source }}</span>
              </div>
              <div class="kcard-title">{{ m.job.title }}</div>
              <div class="kcard-company">{{ m.job.company_name }}</div>
              <div class="kcard-labels" *ngIf="m.labels?.length">
                <span class="kcard-label" *ngFor="let l of m.labels" [style.background]="l.color">{{ l.name }}</span>
              </div>
              <div class="kcard-note" *ngIf="m.notes">
                <app-icon name="file-text" [size]="11"></app-icon> {{ m.notes.slice(0, 60) }}{{ m.notes.length > 60 ? '…' : '' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <section class="card" *ngIf="activeView === 'timeline'">
        <div class="card-head"><h2>Timeline</h2></div>
        <div class="timeline-feed" *ngIf="timelineFeed().length; else noTimelineFeed">
          <div class="timeline-feed-row" *ngFor="let e of timelineFeed()">
            <span class="timeline-feed-date">{{ formatDate(e.occurred_at) }}</span>
            <span class="timeline-feed-status">{{ statusLabel(e.to_status) }}</span>
            <span class="timeline-feed-job">{{ e.job_title }} — {{ e.company_name }}</span>
          </div>
        </div>
        <ng-template #noTimelineFeed><p class="empty-hint">Aucun événement enregistré pour l'instant.</p></ng-template>
      </section>

      <section class="card" *ngIf="activeView === 'analytics'">
        <div class="card-head"><h2>Analytics</h2></div>
        <p class="muted small">Taux de réponse par tranche de score de correspondance, sur vos candidatures réelles.</p>
        <div class="bucket-row" *ngFor="let b of scoreBuckets()">
          <span class="bucket-label">{{ b.bucket }}</span>
          <div class="bucket-track"><div class="bucket-fill" [style.width.%]="b.response_rate"></div></div>
          <span class="bucket-value">{{ b.response_rate }}% <span class="muted">({{ b.total }} candidatures)</span></span>
        </div>
        <p class="empty-hint" *ngIf="!scoreBuckets().length">Pas encore assez de candidatures avec un statut "Postulé" ou plus pour calculer cette analyse.</p>
      </section>

      <!-- Panneau de détail -->
      <div class="overlay" *ngIf="selected()" (click)="closeDetail()"></div>
      <div class="detail-panel" *ngIf="selected()">
        <button class="close-btn" (click)="closeDetail()">
          <app-icon name="x-circle" [size]="20"></app-icon>
        </button>

        <h2>{{ selected()?.job.title }}</h2>
        <p class="detail-company">{{ selected()?.job.company_name }} · {{ selected()?.job.location }}</p>

        <div class="detail-score">
          <span class="score-badge big" [class]="'lvl-' + selected()?.match_level">{{ selected()?.match_score }}%</span>
          <span>correspondance</span>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Salaire</span>
            <span class="info-value">{{ selected()?.job.avg_salary ? (selected()!.job.avg_salary! | number) + ' € / an' : 'Non renseigné' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Télétravail</span>
            <span class="info-value">{{ remoteLabel(selected()?.job.remote_type) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Source</span>
            <span class="info-value">{{ selected()?.job.source }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Recruteur</span>
            <a class="info-value link" routerLink="/contacts">À renseigner</a>
          </div>
        </div>

        <div class="form-group">
          <label>Étiquettes</label>
          <div class="label-chips">
            <span class="label-chip" *ngFor="let l of selected()?.labels" [style.background]="l.color">
              {{ l.name }}
              <button (click)="removeLabel(l)" aria-label="Retirer l'étiquette">×</button>
            </span>
          </div>
          <div class="label-add-row">
            <button class="label-suggest" *ngFor="let l of labelSuggestions()" [style.background]="l.color" (click)="addLabel(l)">
              + {{ l.name }}
            </button>
          </div>
          <div class="label-new-row">
            <input type="text" [(ngModel)]="newLabelName" placeholder="Nouvelle étiquette" maxlength="40" (keyup.enter)="createLabel()">
            <input type="color" [(ngModel)]="newLabelColor">
            <button class="btn-small" (click)="createLabel()" [disabled]="!newLabelName.trim()">Ajouter</button>
          </div>
        </div>

        <div class="form-group">
          <label>Statut</label>
          <select [(ngModel)]="editStatus" (change)="saveStatus()">
            <option *ngFor="let c of allStatusOptions" [value]="c.key">{{ c.label }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>Notes</label>
          <textarea [(ngModel)]="editNotes" rows="5" placeholder="Contact, prochaine étape, ressenti d'entretien..." (blur)="saveNotes()"></textarea>
        </div>

        <div class="form-group">
          <label>Historique <span class="hint-inline">(cliquez pour revenir à un statut passé)</span></label>
          <div class="timeline" *ngIf="timeline().length; else noTimeline">
            <div class="timeline-row-wrap" *ngFor="let t of timeline()">
              <button class="timeline-row" (click)="revertToStatus(t.to_status)">
                <span class="timeline-status">{{ statusLabel(t.to_status) }}</span>
                <span class="timeline-date">{{ formatDate(t.occurred_at) }}</span>
              </button>
              <a class="timeline-offer-link" [href]="selected()?.job.job_url" target="_blank" rel="noopener" (click)="$event.stopPropagation()" title="Voir l'offre">
                <app-icon name="arrow-right" [size]="12"></app-icon>
              </a>
            </div>
          </div>
          <ng-template #noTimeline><p class="empty-hint">Aucun changement de statut enregistré.</p></ng-template>
        </div>

        <div class="form-group" *ngIf="editStatus === 'entretien'">
          <label>Préparation d'entretien</label>
          <button class="btn-prep" (click)="loadInterviewPrep()" [disabled]="loadingPrep()">
            <app-icon name="sparkles" [size]="13"></app-icon>
            {{ loadingPrep() ? 'Génération...' : (interviewPrep() ? 'Régénérer' : 'Préparer cet entretien') }}
          </button>

          <div class="prep-warning" *ngIf="prepNotConfigured()">Module IA non configuré côté serveur.</div>

          <div class="prep-block" *ngIf="interviewPrep()">
            <div class="prep-section">
              <h4>Questions probables</h4>
              <ul><li *ngFor="let q of interviewPrep()!.questions_frequentes">{{ q }}</li></ul>
            </div>
            <div class="prep-section">
              <h4>À réviser</h4>
              <div class="skills-row">
                <span class="chip" *ngFor="let t of interviewPrep()!.technologies_a_reviser">{{ t }}</span>
              </div>
            </div>
            <div class="prep-section">
              <h4>Points à valoriser</h4>
              <ul><li *ngFor="let p of interviewPrep()!.points_a_mettre_en_avant">{{ p }}</li></ul>
            </div>
            <div class="prep-section">
              <h4>Questions à poser</h4>
              <ul><li *ngFor="let q of interviewPrep()!.questions_a_poser">{{ q }}</li></ul>
            </div>
          </div>
        </div>

        <a class="link-contacts" [routerLink]="['/contacts']" [queryParams]="{ entreprise: selected()?.job.company_name }">
          <app-icon name="users" [size]="13"></app-icon> Voir les contacts chez {{ selected()?.job.company_name }}
        </a>

        <a class="btn-primary-action full" [href]="selected()?.job.job_url" target="_blank" rel="noopener">
          Voir l'offre originale
        </a>
      </div>
    </main>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; }
    .layout { display:flex; min-height:100vh; background:#F5F7FA; }
    .main { flex:1; padding:32px 40px; max-width: 1600px; position: relative; }

    .page-header h1 { font-size:24px; font-weight:600; margin-bottom:4px; }
    .muted { color:#64748B; font-size:14px; margin-bottom:20px; }


    .view-tabs { display:flex; gap:6px; margin-bottom:18px; border-bottom:1px solid #E6E9EF; }
    .view-tabs button { padding:9px 16px; font-size:13px; font-weight:500; color:#64748B; border-bottom:2px solid transparent; margin-bottom:-1px; }
    .view-tabs button.active { color:#7C5CFF; border-bottom-color:#7C5CFF; font-weight:600; }

    .card { background:white; border-radius:18px; padding:24px; box-shadow:0 1px 2px rgba(15,23,42,0.04); margin-bottom:16px; }
    .card-head h2 { font-size:15px; font-weight:600; margin:0 0 4px; }
    .muted.small { font-size:12.5px; color:#94A3B8; margin-bottom:16px; }

    .timeline-feed-row { display:grid; grid-template-columns:100px 110px 1fr; gap:14px; padding:10px 0; border-bottom:1px solid #F8FAFC; font-size:12.5px; }
    .timeline-feed-date { color:#94A3B8; }
    .timeline-feed-status { font-weight:600; color:#7C5CFF; }
    .timeline-feed-job { color:#334155; }

    .bucket-row { display:grid; grid-template-columns:80px 1fr 170px; align-items:center; gap:14px; padding:11px 0; border-bottom:1px solid #F8FAFC; }
    .bucket-label { font-size:13px; font-weight:600; color:#0F172A; }
    .bucket-track { height:8px; background:#EEF1F6; border-radius:999px; overflow:hidden; }
    .bucket-fill { height:100%; background:linear-gradient(90deg,#7C5CFF,#2DD4BF); border-radius:999px; }
    .bucket-value { font-size:12.5px; color:#475569; text-align:right; }

    .kpi-row { display:grid; grid-template-columns: repeat(2,1fr); gap:14px; margin-bottom:16px; }
    @media (min-width: 768px) { .kpi-row { grid-template-columns: repeat(4,1fr); } }
    .kpi-card { background:white; border-radius:14px; padding:16px; box-shadow:0 1px 2px rgba(15,23,42,0.04); }
    .kpi-value { font-size:24px; font-weight:700; color:#0F172A; }
    .kpi-value.muted-value { color:#CBD5E1; font-size:18px; }
    .kpi-label { font-size:11.5px; color:#94A3B8; margin-top:4px; }
    .kpi-sub { font-size:10.5px; color:#CBD5E1; margin-top:2px; }

    .followup-banner { background:#FFFBEB; border:1px solid #FDE68A; border-radius:14px; padding:14px 18px; margin-bottom:20px; }
    .followup-head { display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:700; color:#92400E; margin-bottom:8px; }
    .followup-item { display:flex; justify-content:space-between; gap:12px; font-size:12.5px; color:#78350F; padding:5px 0; }
    .followup-days { color:#92400E; font-weight:600; white-space:nowrap; }

    .insight-banner { background:#F8F7FF; border:1px solid #E5DEFF; border-radius:14px; padding:14px 18px; margin-bottom:20px; }
    .insight-item { font-size:12.5px; color:#4C3A99; margin:0; padding:5px 0; line-height:1.5; }

    .btn-prep {
      display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600; color:#7C5CFF;
      background:#F1EEFF; padding:9px 14px; border-radius:10px; margin-bottom:10px;
    }
    .btn-prep:disabled { opacity:.6; cursor:not-allowed; }
    .prep-warning { background:#FFFBEB; color:#92400E; padding:10px 14px; border-radius:9px; font-size:12px; margin-bottom:10px; }
    .prep-block { display:flex; flex-direction:column; gap:14px; }
    .prep-section h4 { font-size:11.5px; text-transform:uppercase; color:#94A3B8; font-weight:700; margin-bottom:7px; }
    .prep-section ul { margin:0; padding-left:18px; }
    .prep-section li { font-size:12.5px; color:#334155; margin-bottom:5px; line-height:1.5; }
    .skills-row { display:flex; flex-wrap:wrap; gap:7px; }
    .chip { background:#F1EEFF; color:#6645E0; padding:5px 11px; border-radius:999px; font-size:11.5px; font-weight:600; }

    .empty-state { text-align:center; padding:80px 20px; display:flex; flex-direction:column; align-items:center; gap:14px; }
    .empty-state p { color:#94A3B8; font-size:13.5px; max-width:380px; }

    .board { display:flex; gap:16px; overflow-x:auto; padding-bottom:12px; }
    .column { width:260px; flex-shrink:0; background:#EEF1F6; border-radius:16px; padding:12px; }
    .column-head { display:flex; justify-content:space-between; align-items:center; padding:6px 8px 12px; }
    .column-label { font-size:12.5px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:.02em; }
    .column-count { font-size:11px; background:white; color:#7C5CFF; padding:2px 8px; border-radius:999px; font-weight:700; }

    .column-body { min-height: 80px; display:flex; flex-direction:column; gap:10px; }

    .kcard {
      background:white; border-radius:12px; padding:14px; box-shadow:0 1px 2px rgba(15,23,42,0.06);
      cursor: grab; transition: box-shadow 150ms;
    }
    .kcard:hover { box-shadow:0 4px 12px rgba(15,23,42,0.1); }
    .kcard.cdk-drag-preview { box-shadow: 0 8px 24px rgba(15,23,42,0.2); }
    .kcard.cdk-drag-placeholder { opacity: 0.3; }
    .column-body.cdk-drop-list-dragging .kcard:not(.cdk-drag-placeholder) { transition: transform 200ms; }

    .kcard-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .score-badge {
      font-size:11px; font-weight:700; color:white; padding:3px 9px; border-radius:999px;
    }
    .score-badge.big { font-size:16px; padding:6px 14px; }
    .lvl-perfect, .lvl-excellent { background: linear-gradient(135deg,#2DD4BF,#14B8A6); }
    .lvl-good { background: linear-gradient(135deg,#7C5CFF,#6645E0); }
    .lvl-potential { background: linear-gradient(135deg,#F59E0B,#D97706); }
    .lvl-low { background: #94A3B8; }
    .source-pill { font-size:10px; text-transform:capitalize; color:#94A3B8; }

    .kcard-title { font-size:13px; font-weight:600; color:#0F172A; margin-bottom:3px; }
    .kcard-company { font-size:11.5px; color:#64748B; }
    .kcard-note {
      font-size:11px; color:#94A3B8; margin-top:8px; background:#F8FAFC; padding:5px 8px; border-radius:7px;
      display:flex; align-items:flex-start; gap:5px;
    }
    .kcard-labels { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
    .kcard-label { font-size:10px; font-weight:700; color:white; padding:3px 9px; border-radius:999px; }

    .overlay { position:fixed; inset:0; background:rgba(15,23,42,0.3); z-index:50; }
    .detail-panel {
      position:fixed; top:0; right:0; height:100vh; width:380px; background:white;
      box-shadow:-8px 0 30px rgba(15,23,42,0.15); padding:32px 28px; z-index:51;
      overflow-y:auto; animation: slide-in 250ms cubic-bezier(.2,.8,.2,1);
    }
    @keyframes slide-in { from { transform:translateX(100%); } to { transform:translateX(0); } }
    .close-btn { position:absolute; top:20px; right:20px; color:#94A3B8; }
    .close-btn:hover { color:#0F172A; }

    .detail-panel h2 { font-size:18px; font-weight:600; margin: 8px 30px 4px 0; }
    .detail-company { font-size:13px; color:#64748B; margin-bottom:18px; }
    .detail-score { display:flex; align-items:center; gap:10px; margin-bottom:18px; font-size:13px; color:#64748B; }

    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:22px; padding-bottom:18px; border-bottom:1px solid #F1F4F8; }
    .info-item { display:flex; flex-direction:column; gap:3px; }
    .info-label { font-size:10.5px; color:#94A3B8; text-transform:uppercase; font-weight:600; }
    .info-value { font-size:12.5px; font-weight:600; color:#0F172A; }
    .info-value.link { color:#7C5CFF; text-decoration:none; }

    .form-group { margin-bottom:18px; }
    .form-group label { display:block; font-size:12.5px; font-weight:600; margin-bottom:7px; color:#334155; }
    .hint-inline { font-weight:400; color:#94A3B8; font-size:11px; }
    .form-group select, .form-group textarea {
      width:100%; padding:10px 12px; border:1.5px solid #E6E9EF; border-radius:10px; font-size:13px; font-family:inherit;
    }
    .form-group select:focus, .form-group textarea:focus { outline:none; border-color:#7C5CFF; }

    .label-chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
    .label-chip {
      display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:700; color:white;
      padding:4px 6px 4px 10px; border-radius:999px;
    }
    .label-chip button { color:rgba(255,255,255,0.8); font-size:13px; line-height:1; padding:0 2px; }
    .label-chip button:hover { color:white; }
    .label-add-row { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
    .label-suggest { font-size:10.5px; font-weight:700; color:white; padding:4px 10px; border-radius:999px; opacity:.85; }
    .label-suggest:hover { opacity:1; }
    .label-new-row { display:flex; gap:6px; align-items:center; }
    .label-new-row input[type="text"] {
      flex:1; padding:8px 11px; border:1.5px solid #E6E9EF; border-radius:9px; font-size:12.5px; font-family:inherit;
    }
    .label-new-row input[type="color"] { width:34px; height:34px; border:none; border-radius:8px; padding:0; cursor:pointer; }

    .timeline { display:flex; flex-direction:column; gap:0; }
    .timeline-row-wrap { display:flex; align-items:center; gap:4px; border-bottom:1px solid #F8FAFC; }
    .timeline-row {
      display:flex; justify-content:space-between; font-size:12px; padding:8px 4px; flex:1;
      background:none; border:none; text-align:left; border-radius:6px;
      transition: background 120ms;
    }
    .timeline-offer-link {
      display:flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px;
      color:#94A3B8; flex-shrink:0;
    }
    .timeline-offer-link:hover { background:#F1EEFF; color:#7C5CFF; }
    .timeline-row:hover { background:#F8FAFC; cursor:pointer; }
    .timeline-status { font-weight:600; color:#0F172A; }
    .timeline-date { color:#94A3B8; }
    .empty-hint { color:#94A3B8; font-size:12.5px; }

    .link-contacts {
      display:flex; align-items:center; gap:6px; font-size:12.5px; color:#7C5CFF; text-decoration:none;
      font-weight:600; margin-bottom:16px;
    }

    .btn-primary-action {
      display:flex; align-items:center; justify-content:center; gap:7px; padding:12px; border-radius:11px;
      background:linear-gradient(135deg,#7C5CFF,#6645E0); color:white; font-weight:600; font-size:13px;
      text-decoration:none; margin-top:8px;
    }

    @media (max-width: 900px) {
      .main { padding:20px; }
      .detail-panel { width:100%; }
    }
  `]
})
export class KanbanComponent implements OnInit {
  private apiUrl = 'http://localhost:8000/api/v1';

  private columnLabels: Record<string, string> = {
    interesse: 'Intéressé',
    postule: 'Postulé',
    entretien: 'Entretien',
    offre: 'Offre reçue',
    refuse: 'Refusé',
    abandonne: 'Abandonné',
  };

  allStatusOptions = Object.entries(this.columnLabels).map(([key, label]) => ({ key, label }));

  columns = signal<Column[]>([]);
  loading = signal(true);
  kpis = signal<any>(null);
  activeView: 'kanban' | 'timeline' | 'analytics' = 'kanban';
  timelineFeed = signal<{ job_title: string; company_name: string; to_status: string; occurred_at: string }[]>([]);
  scoreBuckets = signal<{ bucket: string; total: number; response_rate: number }[]>([]);

  selected = signal<MatchVM | null>(null);
  editStatus = '';
  editNotes = '';
  timeline = signal<StatusEvent[]>([]);

  interviewPrep = signal<InterviewPrep | null>(null);

  labelSuggestions = signal<{ name: string; color: string }[]>([]);
  newLabelName = '';
  newLabelColor = '#7C5CFF';
  loadingPrep = signal(false);
  prepNotConfigured = signal(false);

  constructor(private http: HttpClient, private auth: AuthService, private notify: NotifyService) {}

  ngOnInit() {
    this.loadBoard();
    this.loadKpis();
  }

  totalCount(): number {
    return this.columns().reduce((sum, c) => sum + c.items.length, 0);
  }

  switchView(view: 'kanban' | 'timeline' | 'analytics') {
    this.activeView = view;
    if (view === 'timeline' && !this.timelineFeed().length) {
      this.http.get<any>(`${this.apiUrl}/matches/timeline-feed/`).subscribe({
        next: (res) => this.timelineFeed.set(res.events || []),
        error: () => {}
      });
    }
    if (view === 'analytics' && !this.scoreBuckets().length) {
      this.http.get<any>(`${this.apiUrl}/matches/analytics/`).subscribe({
        next: (res) => this.scoreBuckets.set(res.score_buckets || []),
        error: () => {}
      });
    }
  }

  statusLabel(key: string): string {
    return this.columnLabels[key] || key;
  }

  remoteLabel(type: string | undefined): string {
    const labels: Record<string, string> = {
      remote: 'Télétravail complet', hybrid: 'Hybride', onsite: 'Présentiel',
    };
    return labels[type || ''] || 'Non précisé';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private loadBoard() {
    this.loading.set(true);
    this.http.get<any>(`${this.apiUrl}/matches/board/`).subscribe({
      next: (res) => {
        const cols: Column[] = Object.entries(this.columnLabels).map(([key, label]) => ({
          key, label, items: (res.columns?.[key] || []) as MatchVM[]
        }));
        this.columns.set(cols);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); }
    });
  }

  private loadKpis() {
    this.http.get<any>(`${this.apiUrl}/matches/kpis/`).subscribe({
      next: (res) => this.kpis.set(res),
      error: () => {}
    });
  }

  onDrop(event: CdkDragDrop<MatchVM[]>, targetColumnKey: string) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex
    );

    const moved = event.container.data[event.currentIndex];
    moved.kanban_status = targetColumnKey;
    this.persistStatus(moved.id, targetColumnKey);
  }

  private persistStatus(matchId: number, newStatus: string) {
    this.http.patch(`${this.apiUrl}/matches/${matchId}/update_status/`, { kanban_status: newStatus }).subscribe({
      next: () => { this.showToast('Pipeline mis à jour — bien joué.'); this.loadKpis(); },
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  openDetail(match: MatchVM) {
    this.selected.set(match);
    this.editStatus = match.kanban_status;
    this.editNotes = match.notes || '';
    this.timeline.set([]);
    this.interviewPrep.set(null);
    this.prepNotConfigured.set(false);
    this.http.get<StatusEvent[]>(`${this.apiUrl}/matches/${match.id}/timeline/`).subscribe({
      next: (events) => this.timeline.set(events || []),
      error: () => {}
    });
    if (!this.labelSuggestions().length) {
      this.http.get<any>(`${this.apiUrl}/matches/label-palette/`).subscribe({
        next: (res) => this.labelSuggestions.set(res || []),
        error: () => {}
      });
    }
  }

  addLabel(label: { name: string; color: string }) {
    const match = this.selected();
    if (!match) return;
    if ((match.labels || []).some(l => l.name === label.name)) return;
    const next = [...(match.labels || []), label];
    this.persistLabels(match, next);
  }

  createLabel() {
    const name = this.newLabelName.trim();
    if (!name) return;
    this.addLabel({ name, color: this.newLabelColor });
    this.newLabelName = '';
  }

  removeLabel(label: { name: string; color: string }) {
    const match = this.selected();
    if (!match) return;
    const next = (match.labels || []).filter(l => l.name !== label.name);
    this.persistLabels(match, next);
  }

  private persistLabels(match: MatchVM, labels: { name: string; color: string }[]) {
    match.labels = labels;
    this.selected.set({ ...match });
    this.http.patch(`${this.apiUrl}/matches/${match.id}/update_status/`, { labels }).subscribe({
      next: () => this.loadBoard(),
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  revertToStatus(status: string) {
    this.editStatus = status;
    this.saveStatus();
  }

  loadInterviewPrep() {
    const match = this.selected();
    if (!match) return;
    this.loadingPrep.set(true);
    this.prepNotConfigured.set(false);
    this.http.get<InterviewPrep>(`${this.apiUrl}/matches/${match.id}/interview-prep/`).subscribe({
      next: (res) => { this.loadingPrep.set(false); this.interviewPrep.set(res); },
      error: (err) => {
        this.loadingPrep.set(false);
        if (err.status === 501) this.prepNotConfigured.set(true);
      }
    });
  }

  closeDetail() {
    this.selected.set(null);
  }

  saveStatus() {
    const match = this.selected();
    if (!match) return;
    this.http.patch(`${this.apiUrl}/matches/${match.id}/update_status/`, { kanban_status: this.editStatus }).subscribe({
      next: () => {
        this.showToast('Pipeline mis à jour — bien joué.');
        this.loadBoard();
        this.loadKpis();
        this.closeDetail();
      },
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  saveNotes() {
    const match = this.selected();
    if (!match) return;
    this.http.patch(`${this.apiUrl}/matches/${match.id}/update_status/`, { notes: this.editNotes }).subscribe({
      next: () => this.showToast('Noté.'),
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  private showToast(msg: string, isError = false) {
    if (isError) this.notify.error('Oups', msg);
    else this.notify.success('Fait', msg);
  }
}
