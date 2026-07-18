import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarComponent } from '../../shared/sidebar.component';
import { IconComponent } from '../../shared/icon.component';

interface VideoResource { title: string; channel: string; url: string; thumbnail: string; }

interface Phase {
  titre: string;
  duree_estimee: string;
  competences_visees: string[];
  description: string;
  ressources_suggerees: string[];
  ressources_videos: VideoResource[];
}

interface SimulationResult {
  current_avg_score: number | null;
  simulated_avg_score: number | null;
  current_accessible_count: number;
  simulated_accessible_count: number;
  salary_impact: number | null;
  salary_sample_size: number;
  sample_size: number;
}

/**
 * Feuille de route d'apprentissage — générée par Gemini à partir des
 * compétences du profil, des lacunes détectées dans les offres déjà
 * collectées, et des tendances tech GitHub.
 */
@Component({
  selector: 'app-roadmap',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, IconComponent],
  template: `
  <div class="layout">
    <app-sidebar active="/feuille-de-route"></app-sidebar>

    <main class="main">
      <header class="page-header">
        <h1>Feuille de route d'apprentissage</h1>
        <p class="muted">Générée à partir de vos compétences, des lacunes détectées dans vos offres, et des tendances GitHub.</p>
      </header>

      <div class="config-warning" *ngIf="notConfigured()">
        Le module IA n'est pas configuré côté serveur. Renseignez <code>GEMINI_API_KEY</code> dans le <code>.env</code> du backend.
      </div>

      <section class="card objective-card">
        <div class="card-head"><h2>Votre objectif</h2></div>
        <p class="muted small">Optionnel — affine la feuille de route générée, sans changer ce qui est calculé depuis vos vraies données.</p>
        <div class="objective-grid">
          <div class="form-group">
            <label>Poste visé</label>
            <input type="text" [(ngModel)]="targetRole" placeholder="Ex. Lead Developer">
          </div>
          <div class="form-group">
            <label>Salaire cible (€)</label>
            <input type="number" [(ngModel)]="targetSalary" placeholder="Ex. 55000">
          </div>
          <div class="form-group">
            <label>Ville</label>
            <input type="text" [(ngModel)]="targetLocation" placeholder="Ex. Lyon">
          </div>
          <div class="form-group">
            <label>Délai (mois)</label>
            <input type="number" [(ngModel)]="timeframeMonths" placeholder="Ex. 6">
          </div>
        </div>
      </section>

      <button class="btn-generate" (click)="generate()" [disabled]="loading()">
        <app-icon name="sparkles" [size]="15"></app-icon>
        {{ loading() ? 'Génération...' : (phases().length ? 'Régénérer' : 'Générer ma feuille de route') }}
      </button>

      <div class="empty-state" *ngIf="!loading() && !phases().length && !notConfigured()">
        <app-icon name="calendar" [size]="32" color="#CBD5E1"></app-icon>
        <p>Cliquez sur "Générer" pour obtenir un plan d'apprentissage personnalisé.</p>
      </div>

      <section class="card simulator-card" *ngIf="phases().length">
        <div class="card-head">
          <h2>Simulateur — "Et si j'apprenais..."</h2>
        </div>
        <p class="muted small">
          Recalculé sur vos offres déjà collectées, jamais une statistique de marché inventée.
        </p>

        <div class="skill-toggle-row">
          <button
            class="skill-toggle"
            *ngFor="let s of simulationCandidates()"
            [class.active]="selectedSkills().includes(s)"
            (click)="toggleSimSkill(s)"
          >
            {{ s }}
          </button>
        </div>

        <button class="btn-simulate" (click)="runSimulation()" [disabled]="!selectedSkills().length || simulating()">
          {{ simulating() ? 'Calcul...' : 'Simuler l\\'impact' }}
        </button>

        <div class="simulation-result" *ngIf="simulation()">
          <div class="sim-metric">
            <div class="sim-label">Score moyen de correspondance</div>
            <div class="sim-values">
              <span>{{ simulation()!.current_avg_score ?? 'n/d' }}%</span>
              <app-icon name="arrow-right" [size]="14"></app-icon>
              <span class="sim-new">{{ simulation()!.simulated_avg_score ?? 'n/d' }}%</span>
            </div>
          </div>
          <div class="sim-metric">
            <div class="sim-label">Offres accessibles (&gt;75%)</div>
            <div class="sim-values">
              <span>{{ simulation()!.current_accessible_count }}</span>
              <app-icon name="arrow-right" [size]="14"></app-icon>
              <span class="sim-new">{{ simulation()!.simulated_accessible_count }}</span>
            </div>
          </div>
          <div class="sim-metric" *ngIf="simulation()!.salary_impact !== null">
            <div class="sim-label">Écart de salaire moyen observé</div>
            <div class="sim-values">
              <span class="sim-new">{{ simulation()!.salary_impact! >= 0 ? '+' : '' }}{{ simulation()!.salary_impact }} €</span>
            </div>
            <p class="sim-note">Basé sur {{ simulation()!.salary_sample_size }} offre(s) de votre échantillon, pas une moyenne de marché.</p>
          </div>
          <p class="sim-sample">Calculé sur {{ simulation()!.sample_size }} offre(s) déjà collectée(s).</p>
        </div>
      </section>

      <div class="timeline" *ngIf="phases().length">
        <div class="phase-card" *ngFor="let p of phases(); let i = index">
          <div class="phase-marker">{{ i + 1 }}</div>
          <div class="phase-content">
            <div class="phase-head">
              <h2>{{ p.titre }}</h2>
              <span class="duration-pill">{{ p.duree_estimee }}</span>
            </div>
            <p class="phase-desc">{{ p.description }}</p>

            <div class="skills-row" *ngIf="p.competences_visees?.length">
              <span class="chip" *ngFor="let s of p.competences_visees">{{ s }}</span>
            </div>

            <ul class="resources" *ngIf="p.ressources_suggerees?.length">
              <li *ngFor="let r of p.ressources_suggerees">{{ r }}</li>
            </ul>

            <div class="video-row" *ngIf="p.ressources_videos?.length">
              <a class="video-card" *ngFor="let v of p.ressources_videos" [href]="v.url" target="_blank" rel="noopener">
                <img [src]="v.thumbnail" [alt]="v.title" *ngIf="v.thumbnail">
                <div class="video-info">
                  <div class="video-title">{{ v.title }}</div>
                  <div class="video-channel">{{ v.channel }}</div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; }
    .layout { display:flex; min-height:100vh; background:#F5F7FA; }
    .main { flex:1; padding:32px 40px; max-width:1000px; }

    .page-header h1 { font-size:24px; font-weight:600; margin-bottom:6px; }
    .muted { color:#94A3B8; font-size:13.5px; margin-bottom:20px; }
    .muted.small { font-size:12.5px; margin-bottom:14px; }

    .config-warning { background:#FFFBEB; color:#92400E; padding:14px 18px; border-radius:12px; font-size:13px; margin-bottom:20px; }

    .objective-card { margin-bottom:20px; }
    .objective-card .card-head h2 { font-size:15px; font-weight:600; margin:0 0 4px; }
    .objective-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:14px; }
    .form-group { display:flex; flex-direction:column; gap:6px; }
    .form-group label { font-size:11.5px; font-weight:600; color:#475569; }
    .form-group input {
      padding:9px 12px; border:1.5px solid #E6E9EF; border-radius:9px; font-size:13px; font-family:inherit;
    }
    .form-group input:focus { outline:none; border-color:#7C5CFF; }
    @media (max-width: 600px) { .objective-grid { grid-template-columns:1fr; } }
    .config-warning code { background:rgba(0,0,0,0.06); padding:2px 6px; border-radius:5px; }

    .card { background:white; border-radius:18px; padding:22px; box-shadow:0 1px 2px rgba(15,23,42,0.04); margin-bottom:20px; }
    .card-head h2 { font-size:15px; font-weight:600; margin:0 0 4px; }

    .skill-toggle-row { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
    .skill-toggle { font-size:12.5px; font-weight:600; padding:7px 14px; border-radius:999px; background:#F1EEFF; color:#6645E0; }
    .skill-toggle.active { background:#7C5CFF; color:white; }

    .btn-simulate { padding:10px 18px; border-radius:10px; background:#1B1C2A; color:white; font-size:13px; font-weight:600; }
    .btn-simulate:disabled { opacity:.5; cursor:not-allowed; }

    .simulation-result { margin-top:18px; padding-top:16px; border-top:1px solid #F1F4F8; }
    .sim-metric { margin-bottom:14px; }
    .sim-label { font-size:12px; color:#94A3B8; margin-bottom:5px; }
    .sim-values { display:flex; align-items:center; gap:10px; font-size:18px; font-weight:700; color:#0F172A; }
    .sim-new { color:#2DD4BF; }
    .sim-note { font-size:11px; color:#94A3B8; margin-top:4px; }
    .sim-sample { font-size:11.5px; color:#CBD5E1; margin-top:8px; }

    .btn-generate {
      display:flex; align-items:center; gap:8px; padding:11px 20px; border-radius:11px;
      background:linear-gradient(135deg,#7C5CFF,#6645E0); color:white; font-weight:600; font-size:13px;
      margin-bottom:24px;
    }
    .btn-generate:disabled { opacity:.6; cursor:not-allowed; }

    .empty-state { text-align:center; padding:60px 20px; display:flex; flex-direction:column; align-items:center; gap:14px; }
    .empty-state p { color:#94A3B8; font-size:13.5px; }

    .timeline { position:relative; padding-left:8px; }
    .phase-card { display:flex; gap:18px; margin-bottom:28px; position:relative; }
    .phase-card:not(:last-child)::before {
      content:''; position:absolute; left:17px; top:42px; bottom:-28px; width:2px; background:#E6E9EF;
    }
    .phase-marker {
      width:36px; height:36px; border-radius:50%; flex-shrink:0; background:linear-gradient(135deg,#7C5CFF,#F857C1);
      color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; z-index:1;
    }
    .phase-content { flex:1; background:white; border-radius:16px; padding:20px; box-shadow:0 1px 2px rgba(15,23,42,0.04); }
    .phase-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; }
    .phase-head h2 { font-size:15.5px; font-weight:600; margin:0; }
    .duration-pill { font-size:11px; background:#F1EEFF; color:#7C5CFF; padding:3px 10px; border-radius:999px; font-weight:600; white-space:nowrap; }
    .phase-desc { font-size:13px; color:#475569; line-height:1.6; margin-bottom:14px; }

    .skills-row { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:12px; }
    .chip { background:#F1EEFF; color:#6645E0; padding:5px 11px; border-radius:999px; font-size:12px; font-weight:600; }

    .resources { margin:0 0 14px; padding-left:18px; }
    .resources li { font-size:12.5px; color:#64748B; margin-bottom:4px; }

    .video-row { display:flex; flex-direction:column; gap:8px; }
    .video-card { display:flex; gap:10px; text-decoration:none; color:inherit; background:#F8FAFC; border-radius:10px; padding:8px; }
    .video-card img { width:80px; height:45px; border-radius:6px; object-fit:cover; flex-shrink:0; }
    .video-info { min-width:0; }
    .video-title { font-size:12px; font-weight:600; color:#0F172A; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .video-channel { font-size:11px; color:#94A3B8; margin-top:2px; }

    @media (max-width: 900px) { .main { padding:20px; } }
  `]
})
export class RoadmapComponent implements OnInit {
  private apiUrl = 'http://localhost:8000/api/v1';

  phases = signal<Phase[]>([]);
  loading = signal(false);
  notConfigured = signal(false);

  selectedSkills = signal<string[]>([]);
  simulation = signal<SimulationResult | null>(null);
  simulating = signal(false);

  constructor(private http: HttpClient, private auth: AuthService) {}

  ngOnInit() {
  }

  targetRole = '';
  targetSalary: number | null = null;
  targetLocation = '';
  timeframeMonths: number | null = null;

  generate() {
    this.loading.set(true);
    this.notConfigured.set(false);
    this.http.post<{ phases: Phase[] }>(`${this.apiUrl}/linkedin/roadmap/`, {
      target_role: this.targetRole,
      target_salary: this.targetSalary,
      target_location: this.targetLocation,
      timeframe_months: this.timeframeMonths,
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.phases.set(res.phases || []);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 501) this.notConfigured.set(true);
      }
    });
  }

  simulationCandidates(): string[] {
    const skills = new Set<string>();
    this.phases().forEach(p => (p.competences_visees || []).forEach(s => skills.add(s)));
    return Array.from(skills).slice(0, 10);
  }

  toggleSimSkill(skill: string) {
    const current = this.selectedSkills();
    this.selectedSkills.set(
      current.includes(skill) ? current.filter(s => s !== skill) : [...current, skill]
    );
  }

  runSimulation() {
    if (!this.selectedSkills().length) return;
    this.simulating.set(true);
    this.http.post<SimulationResult>(`${this.apiUrl}/matches/simulate/`, { skills: this.selectedSkills() }).subscribe({
      next: (res) => {
        this.simulating.set(false);
        this.simulation.set(res);
      },
      error: () => { this.simulating.set(false); }
    });
  }
}
