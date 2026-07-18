import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarComponent } from '../../shared/sidebar.component';
import { IconComponent } from '../../shared/icon.component';
import { NotifyService } from '../../core/notify/notify.service';

interface AnalysisResult {
  score_global: number;
  hook: { score: number; commentaire: string };
  lisibilite: { score: number; commentaire: string };
  impact: { score: number; commentaire: string };
  suggestions: string[];
}

@Component({
  selector: 'app-linkedin-content',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SidebarComponent, IconComponent],
  template: `
  <div class="layout">
    <app-sidebar active="/contenu-linkedin"></app-sidebar>

    <main class="main">
      <header class="page-header">
        <div>
          <h1>Contenu LinkedIn</h1>
          <p class="muted">Collez votre brouillon, obtenez un score et des suggestions concrètes.</p>
        </div>
        <a routerLink="/contenu-linkedin/calendrier" class="link-calendar">
          <app-icon name="calendar" [size]="14"></app-icon> Calendrier &amp; Content Gap
        </a>
      </header>

      <div class="config-warning" *ngIf="notConfigured()">
        <app-icon name="info" [size]="15"></app-icon>
        Le module IA n'est pas configuré côté serveur. Renseignez <code>GEMINI_API_KEY</code>
        dans le <code>.env</code> du backend (la même clé que pour ATlaS fonctionne).
      </div>

      <div class="split">
        <div class="editor-side">
          <textarea
            [(ngModel)]="content"
            placeholder="Collez ou écrivez votre post LinkedIn ici..."
            rows="14"
          ></textarea>
          <div class="editor-actions">
            <button class="btn-primary-action" (click)="analyze()" [disabled]="analyzing() || !content.trim()">
              <app-icon name="sparkles" [size]="15"></app-icon>
              {{ analyzing() ? 'Analyse...' : 'Analyser le post' }}
            </button>
            <button class="btn-ghost-action" (click)="loadIdeas()" [disabled]="loadingIdeas()">
              <app-icon name="sparkles" [size]="13"></app-icon>
              {{ loadingIdeas() ? 'Génération...' : "Idées de posts" }}
            </button>
          </div>

          <div class="save-row">
            <select [(ngModel)]="saveStatus">
              <option value="idee">Idée</option>
              <option value="brouillon">Brouillon</option>
              <option value="publie">Publié</option>
            </select>
            <select [(ngModel)]="saveDay">
              <option value="">Pas de jour assigné</option>
              <option value="lundi">Lundi</option>
              <option value="mardi">Mardi</option>
              <option value="mercredi">Mercredi</option>
              <option value="jeudi">Jeudi</option>
              <option value="vendredi">Vendredi</option>
              <option value="samedi">Samedi</option>
              <option value="dimanche">Dimanche</option>
            </select>
            <button class="btn-ghost-action" (click)="savePost()" [disabled]="!content.trim() || savingPost()">
              {{ savingPost() ? 'Enregistrement...' : (currentPostId() ? 'Mettre à jour' : 'Enregistrer ce post') }}
            </button>
            <button class="btn-ghost-action" *ngIf="currentPostId()" (click)="newPost()">Nouveau post</button>
          </div>

          <div class="ideas-list" *ngIf="ideas().length">
            <h3>Idées suggérées</h3>
            <div class="idea-card" *ngFor="let idea of ideas()">
              <span class="idea-type">{{ idea.type }}</span>
              <strong>{{ idea.titre }}</strong>
              <p>{{ idea.angle }}</p>
            </div>
          </div>

          <button class="btn-toggle-preview" (click)="showPreview = true">
            <app-icon name="chevron-right" [size]="12"></app-icon>
            Voir l'aperçu LinkedIn
          </button>

          <div class="my-posts" *ngIf="myPosts().length">
            <div class="my-posts-head">
              <h3>Mes posts ({{ myPosts().length }})</h3>
            </div>
            <button class="post-row" *ngFor="let p of myPosts()" [class.active]="currentPostId() === p.id" (click)="loadPost(p)">
              <span class="post-row-status" [class]="'status-' + p.status">{{ postStatusLabel(p.status) }}</span>
              <span class="post-row-excerpt">{{ p.content.slice(0, 60) }}{{ p.content.length > 60 ? '…' : '' }}</span>
              <button class="post-row-delete" (click)="deletePost(p, $event)" aria-label="Supprimer">×</button>
            </button>
          </div>
        </div>

        <div class="result-side" *ngIf="result()">
          <div class="score-block">
            <div class="score-circle">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#EEF1F6" stroke-width="9"/>
                <circle cx="50" cy="50" r="42" fill="none" stroke="#7C5CFF" stroke-width="9"
                  [attr.stroke-dasharray]="(result()!.score_global / 100) * 264 + ' 264'"
                  stroke-linecap="round" transform="rotate(-90 50 50)"/>
              </svg>
              <div class="score-num">{{ result()!.score_global }}</div>
            </div>
            <div>
              <div class="score-label">Score global</div>
              <div class="score-sub">{{ scoreLabel(result()!.score_global) }}</div>
            </div>
          </div>

          <div class="metric-row" *ngFor="let m of metrics()">
            <div class="metric-head">
              <span>{{ m.label }}</span>
              <span class="metric-score">{{ m.score }}/100</span>
            </div>
            <div class="metric-track"><div class="metric-fill" [style.width.%]="m.score"></div></div>
            <p class="metric-comment">{{ m.commentaire }}</p>
          </div>

          <div class="suggestions-block" *ngIf="result()!.suggestions?.length">
            <h3>Suggestions</h3>
            <ul>
              <li *ngFor="let s of result()!.suggestions">
                <app-icon name="check-circle" [size]="15" color="#2DD4BF"></app-icon> {{ s }}
              </li>
            </ul>
          </div>

          <div class="reformulate-row">
            <span class="reformulate-label">Réécrire :</span>
            <button class="btn-style-chip" *ngFor="let style of reformulateStyles"
                    (click)="reformulate(style.key)" [disabled]="reformulating()">
              {{ style.label }}
            </button>
          </div>

          <div class="reformulated-box" *ngIf="reformulated()">
            <h3>Version {{ activeReformulateLabel() }}</h3>
            <p>{{ reformulated() }}</p>
            <button class="btn-ghost-action" (click)="applyReformulated()">Utiliser cette version</button>
          </div>
        </div>

        <div class="result-side empty" *ngIf="!result()">
          <app-icon name="sparkles" [size]="32" color="#CBD5E1"></app-icon>
          <p>Analysez un post pour voir le score apparaître ici.</p>
        </div>
      </div>
    </main>

    <div class="dialog-overlay" *ngIf="showPreview" (click)="showPreview = false"></div>
    <div class="preview-dialog" *ngIf="showPreview">
      <button class="dialog-close" (click)="showPreview = false" aria-label="Fermer">
        <app-icon name="x-circle" [size]="20"></app-icon>
      </button>
      <div class="linkedin-mock">
        <div class="mock-header">
          <div class="mock-avatar">{{ initials() }}</div>
          <div>
            <div class="mock-name">{{ displayName() }}</div>
            <div class="mock-meta">Maintenant · <app-icon name="users" [size]="10"></app-icon></div>
          </div>
        </div>
        <div class="mock-content">{{ content || 'Votre post apparaîtra ici au fil de la rédaction...' }}</div>
        <div class="mock-actions">
          <span><app-icon name="heart" [size]="14"></app-icon> J'aime</span>
          <span><app-icon name="file-text" [size]="14"></app-icon> Commenter</span>
          <span><app-icon name="link" [size]="14"></app-icon> Republier</span>
        </div>
      </div>
    </div>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; }
    .layout { display:flex; min-height:100vh; background:#F5F7FA; }
    .main { flex:1; padding:32px 40px; max-width:1500px; }

    .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; }
    .page-header h1 { font-size:24px; font-weight:600; margin-bottom:4px; }
    .link-calendar {
      display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#7C5CFF;
      text-decoration:none; padding:9px 14px; background:#F1EEFF; border-radius:10px; white-space:nowrap;
    }
    .save-row { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
    .save-row select {
      padding:9px 12px; border:1.5px solid #E6E9EF; border-radius:10px; font-size:12.5px; font-family:inherit; background:white;
    }
    .muted { color:#64748B; font-size:14px; margin-bottom:20px; }

    .config-warning {
      background:#FFFBEB; color:#92400E; padding:14px 18px; border-radius:12px; font-size:13px;
      margin-bottom:20px; border:1px solid #FDE68A; display:flex; align-items:flex-start; gap:9px;
    }
    .config-warning app-icon { flex-shrink:0; margin-top:2px; }
    .config-warning code { background:rgba(0,0,0,0.06); padding:2px 6px; border-radius:5px; }

    .split { display:grid; grid-template-columns:1fr; gap:20px; }
    @media (min-width: 980px) { .split { grid-template-columns: 1.1fr 0.9fr; } }

    .editor-side textarea {
      width:100%; padding:18px; border:1.5px solid #E6E9EF; border-radius:16px; font-size:14px;
      font-family:inherit; resize:vertical; background:white;
    }
    .editor-side textarea:focus { outline:none; border-color:#7C5CFF; }

    .editor-actions { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; }
    .btn-primary-action {
      display:flex; align-items:center; gap:7px; padding:11px 18px; border-radius:11px;
      background:linear-gradient(135deg,#7C5CFF,#6645E0); color:white; font-weight:600; font-size:13px;
    }
    .btn-primary-action.full { width:100%; justify-content:center; margin-top:8px; }
    .reformulate-row { display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-top:14px; }
    .reformulate-label { font-size:12px; color:#64748B; font-weight:600; }
    .btn-style-chip {
      font-size:11.5px; font-weight:600; color:#7C5CFF; background:#F1EEFF; padding:7px 13px; border-radius:999px;
    }
    .btn-style-chip:hover:not(:disabled) { background:#E5DEFF; }
    .btn-style-chip:disabled { opacity:.6; cursor:not-allowed; }

    .btn-toggle-preview {
      display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#7C5CFF; margin-top:16px;
    }

    .dialog-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.4); z-index:60; }
    .preview-dialog {
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:61;
      width:420px; max-width:90vw; background:white; border-radius:20px; padding:24px;
      box-shadow:0 24px 60px rgba(15,23,42,0.3);
    }
    .dialog-close { position:absolute; top:14px; right:14px; color:#94A3B8; }
    .dialog-close:hover { color:#0F172A; }

    .my-posts { margin-top:24px; }
    .my-posts-head h3 { font-size:13.5px; margin-bottom:10px; }
    .post-row {
      display:flex; align-items:center; gap:10px; width:100%; padding:10px 12px; border-radius:10px; background:white;
      box-shadow:0 1px 2px rgba(15,23,42,0.04); margin-bottom:7px; text-align:left;
    }
    .post-row.active { background:#F1EEFF; box-shadow:none; border:1.5px solid #7C5CFF; }
    .post-row-status { font-size:9.5px; font-weight:700; text-transform:uppercase; padding:3px 8px; border-radius:999px; flex-shrink:0; }
    .post-row-status.status-idee { background:#FEF3C7; color:#92400E; }
    .post-row-status.status-brouillon { background:#EFF6FF; color:#1D4ED8; }
    .post-row-status.status-publie { background:#F0FDF4; color:#15803D; }
    .post-row-excerpt { flex:1; font-size:12.5px; color:#334155; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .post-row-delete { font-size:15px; color:#CBD5E1; flex-shrink:0; }
    .post-row-delete:hover { color:#DC2626; }
    .linkedin-mock {
      background:white; border-radius:14px;
    }
    .mock-header { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
    .mock-avatar {
      width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg,#7C5CFF,#F857C1);
      color:white; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:600; flex-shrink:0;
    }
    .mock-name { font-size:13.5px; font-weight:600; color:#0F172A; }
    .mock-meta { font-size:11px; color:#94A3B8; display:flex; align-items:center; gap:4px; }
    .mock-content { font-size:13px; color:#1E293B; line-height:1.6; white-space:pre-wrap; margin-bottom:14px; min-height:60px; }
    .mock-actions { display:flex; gap:20px; padding-top:12px; border-top:1px solid #F1F4F8; }
    .mock-actions span { display:flex; align-items:center; gap:6px; font-size:12px; color:#64748B; font-weight:600; }
    .btn-primary-action:disabled { opacity:.6; cursor:not-allowed; }
    .btn-ghost-action {
      display:flex; align-items:center; gap:7px; padding:11px 16px; border:1.5px solid #E6E9EF; border-radius:11px; background:white; font-size:13px; color:#475569;
    }
    .btn-ghost-action:disabled { opacity:.6; cursor:not-allowed; }

    .ideas-list { margin-top:20px; }
    .ideas-list h3 { font-size:14px; margin-bottom:10px; }
    .idea-card { background:white; border-radius:14px; padding:14px 16px; margin-bottom:10px; box-shadow:0 1px 2px rgba(15,23,42,0.04); }
    .idea-type { font-size:10.5px; text-transform:uppercase; color:#7C5CFF; font-weight:700; }
    .idea-card strong { display:block; font-size:13.5px; margin:4px 0 3px; }
    .idea-card p { font-size:12.5px; color:#64748B; margin:0; }

    .result-side { background:white; border-radius:18px; padding:24px; box-shadow:0 1px 2px rgba(15,23,42,0.04); }
    .result-side.empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:#94A3B8; min-height:300px; text-align:center; }
    .result-side.empty p { font-size:13px; max-width: 200px; }

    .score-block { display:flex; align-items:center; gap:16px; margin-bottom:24px; }
    .score-circle { position:relative; width:84px; height:84px; flex-shrink:0; }
    .score-circle svg { width:100%; height:100%; }
    .score-num { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:700; color:#0F172A; }
    .score-label { font-size:13px; color:#64748B; }
    .score-sub { font-size:15px; font-weight:600; color:#0F172A; }

    .metric-row { margin-bottom:16px; }
    .metric-head { display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-bottom:6px; }
    .metric-score { color:#7C5CFF; }
    .metric-track { height:6px; background:#EEF1F6; border-radius:999px; overflow:hidden; margin-bottom:6px; }
    .metric-fill { height:100%; background:linear-gradient(90deg,#7C5CFF,#F857C1); border-radius:999px; transition: width .6s; }
    .metric-comment { font-size:12px; color:#94A3B8; margin:0; }

    .suggestions-block { margin: 20px 0; }
    .suggestions-block h3 { font-size:13.5px; margin-bottom:10px; }
    .suggestions-block ul { list-style:none; padding:0; display:flex; flex-direction:column; gap:9px; }
    .suggestions-block li { display:flex; align-items:flex-start; gap:8px; font-size:13px; color:#334155; }

    .reformulated-box { margin-top:16px; background:#F8FAFC; border-radius:12px; padding:16px; }
    .reformulated-box h3 { font-size:13px; margin-bottom:8px; }
    .reformulated-box p { font-size:13px; color:#334155; line-height:1.6; margin-bottom:12px; white-space:pre-wrap; }

    @media (max-width: 900px) { .main { padding:20px; } }
  `]
})
export class LinkedinContentComponent implements OnInit {
  private apiUrl = 'http://localhost:8000/api/v1';

  content = '';
  result = signal<AnalysisResult | null>(null);
  reformulated = signal('');
  activeReformulateKey = '';
  showPreview = false;

  reformulateStyles = [
    { key: 'humain', label: 'Plus humain', instruction: 'rends ce texte plus chaleureux et personnel, moins corporate' },
    { key: 'technique', label: 'Plus technique', instruction: 'enrichis ce texte de vocabulaire technique précis et de détails concrets' },
    { key: 'viral', label: 'Plus viral', instruction: "rends ce texte plus accrocheur et partageable, avec un hook fort dès la première ligne" },
    { key: 'storytelling', label: 'Plus storytelling', instruction: 'transforme ce texte en récit personnel avec un arc narratif clair' },
    { key: 'recruteur', label: 'Plus orienté recruteur', instruction: 'mets en avant les compétences et résultats concrets qui parlent à un recruteur technique' },
  ];

  activeReformulateLabel(): string {
    return this.reformulateStyles.find(s => s.key === this.activeReformulateKey)?.label || 'optimisée';
  }

  displayName(): string {
    const u = this.auth.getCurrentUser();
    return u?.first_name || u?.username || 'Vous';
  }

  initials(): string {
    return this.displayName().slice(0, 2).toUpperCase();
  }
  ideas = signal<{ titre: string; angle: string; type: string }[]>([]);

  analyzing = signal(false);
  reformulating = signal(false);
  loadingIdeas = signal(false);
  notConfigured = signal(false);
  saveStatus = 'brouillon';
  saveDay = '';
  savingPost = signal(false);
  currentPostId = signal<number | null>(null);
  myPosts = signal<{ id: number; content: string; status: string; scheduled_day: string }[]>([]);

  private postStatusLabels: Record<string, string> = { idee: 'Idée', brouillon: 'Brouillon', publie: 'Publié' };

  constructor(private http: HttpClient, private auth: AuthService, private route: ActivatedRoute, private notify: NotifyService) {}

  ngOnInit() {
    this.loadMyPosts();
    // S'abonne au lieu de lire un instantané unique : si on clique sur
    // "Modifier" pour un autre post alors qu'on est déjà sur cette page,
    // Angular réutilise la même instance de composant (même route) et
    // ngOnInit ne se relance pas — seul un abonnement réagit au changement.
    this.route.queryParamMap.subscribe(params => {
      const postId = params.get('post');
      if (postId) {
        this.http.get<any>(`${this.apiUrl}/linkedin-posts/${postId}/`).subscribe({
          next: (post) => this.loadPost(post),
          error: () => {}
        });
      }
    });
  }

  private loadMyPosts() {
    this.http.get<any>(`${this.apiUrl}/linkedin-posts/`).subscribe({
      next: (data: any) => this.myPosts.set(Array.isArray(data) ? data : (data?.results || [])),
      error: () => {}
    });
  }

  postStatusLabel(status: string): string {
    return this.postStatusLabels[status] || status;
  }

  loadPost(p: { id: number; content: string; status: string; scheduled_day: string }) {
    this.content = p.content;
    this.saveStatus = p.status;
    this.saveDay = p.scheduled_day || '';
    this.currentPostId.set(p.id);
    this.result.set(null);
    this.reformulated.set('');
  }

  newPost() {
    this.content = '';
    this.saveStatus = 'brouillon';
    this.saveDay = '';
    this.currentPostId.set(null);
    this.result.set(null);
    this.reformulated.set('');
  }

  deletePost(p: { id: number }, event: MouseEvent) {
    event.stopPropagation();
    this.http.delete(`${this.apiUrl}/linkedin-posts/${p.id}/`).subscribe({
      next: () => {
        this.myPosts.set(this.myPosts().filter(x => x.id !== p.id));
        if (this.currentPostId() === p.id) this.newPost();
      }
    });
  }

  analyze() {
    this.analyzing.set(true);
    this.notConfigured.set(false);
    this.http.post<AnalysisResult>(`${this.apiUrl}/linkedin/analyze/`, { content: this.content }).subscribe({
      next: (res) => { this.analyzing.set(false); this.result.set(res); this.reformulated.set(''); },
      error: (err) => {
        this.analyzing.set(false);
        if (err.status === 501) this.notConfigured.set(true);
      }
    });
  }

  reformulate(styleKey: string) {
    this.reformulating.set(true);
    this.activeReformulateKey = styleKey;
    const style = this.reformulateStyles.find(s => s.key === styleKey);
    this.http.post<{ reformulated: string }>(`${this.apiUrl}/linkedin/reformulate/`, {
      content: this.content, instruction: style?.instruction || 'rends ce texte plus percutant et plus engageant'
    }).subscribe({
      next: (res) => { this.reformulating.set(false); this.reformulated.set(res.reformulated); },
      error: (err) => {
        this.reformulating.set(false);
        if (err.status === 501) this.notConfigured.set(true);
      }
    });
  }

  applyReformulated() {
    this.content = this.reformulated();
    this.reformulated.set('');
  }

  savePost() {
    this.savingPost.set(true);
    const payload = { content: this.content, status: this.saveStatus, scheduled_day: this.saveDay };
    const postId = this.currentPostId();

    const request = postId
      ? this.http.patch(`${this.apiUrl}/linkedin-posts/${postId}/`, payload)
      : this.http.post<any>(`${this.apiUrl}/linkedin-posts/`, payload);

    request.subscribe({
      next: (res: any) => {
        this.savingPost.set(false);
        if (!postId && res?.id) this.currentPostId.set(res.id);
        this.showToast(postId ? 'Post mis à jour' : 'Post enregistré');
        this.loadMyPosts();
      },
      error: () => { this.savingPost.set(false); }
    });
  }

  private showToast(msg: string, isError = false) {
    if (isError) this.notify.error('Oups', msg);
    else this.notify.success('Fait', msg);
  }

  loadIdeas() {
    this.loadingIdeas.set(true);
    this.http.get<{ ideas: any[] }>(`${this.apiUrl}/linkedin/ideas/`).subscribe({
      next: (res) => { this.loadingIdeas.set(false); this.ideas.set(res.ideas || []); },
      error: (err) => {
        this.loadingIdeas.set(false);
        if (err.status === 501) this.notConfigured.set(true);
      }
    });
  }

  metrics() {
    const r = this.result();
    if (!r) return [];
    return [
      { label: 'Hook', score: r.hook.score, commentaire: r.hook.commentaire },
      { label: 'Lisibilité', score: r.lisibilite.score, commentaire: r.lisibilite.commentaire },
      { label: 'Impact', score: r.impact.score, commentaire: r.impact.commentaire },
    ];
  }

  scoreLabel(score: number): string {
    if (score >= 85) return 'Ce post a un excellent potentiel';
    if (score >= 65) return 'Bon potentiel, quelques ajustements possibles';
    if (score >= 45) return 'On peut le retravailler ensemble';
    return 'Je peux vous aider à le renforcer';
  }
}
