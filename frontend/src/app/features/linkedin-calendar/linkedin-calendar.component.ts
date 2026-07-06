import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { SidebarComponent } from '../../shared/sidebar.component';
import { IconComponent } from '../../shared/icon.component';

interface PostVM {
  id: number;
  content: string;
  status: string;
  scheduled_day: string;
  topics: string[];
}

const DAYS = [
  { key: 'lundi', label: 'Lundi' }, { key: 'mardi', label: 'Mardi' }, { key: 'mercredi', label: 'Mercredi' },
  { key: 'jeudi', label: 'Jeudi' }, { key: 'vendredi', label: 'Vendredi' },
  { key: 'samedi', label: 'Samedi' }, { key: 'dimanche', label: 'Dimanche' },
];

/**
 * Calendrier éditorial (posts sauvegardés assignés à un jour de la
 * semaine) + Content Gap (compétences jamais abordées dans aucun
 * post). Aucune publication automatique — c'est un outil de
 * planification personnelle, pas une intégration LinkedIn.
 */
@Component({
  selector: 'app-linkedin-calendar',
  standalone: true,
  imports: [CommonModule, RouterLink, SidebarComponent, IconComponent],
  template: `
  <div class="layout">
    <app-sidebar active="/contenu-linkedin"></app-sidebar>

    <main class="main">
      <header class="page-header">
        <div>
          <h1>Calendrier &amp; Content Gap</h1>
          <p class="muted">Vos posts sauvegardés, organisés par jour, et les compétences jamais abordées.</p>
        </div>
        <a routerLink="/contenu-linkedin" class="link-back">
          <app-icon name="arrow-right" [size]="13"></app-icon> Retour à l'éditeur
        </a>
      </header>

      <section class="card" *ngIf="contentGap()">
        <div class="card-head"><h2>Content Gap</h2></div>
        <p class="muted small">
          {{ contentGap()!.total_posts }} post(s) sauvegardé(s) au total.
          Calculé depuis vos vrais posts — pas une statistique d'engagement qu'on ne mesure pas.
        </p>

        <div class="gap-section" *ngIf="contentGap()!.never_covered.length">
          <span class="gap-label">Jamais abordées</span>
          <div class="skill-chips">
            <span class="chip chip-gap" *ngFor="let s of contentGap()!.never_covered">{{ s }}</span>
          </div>
        </div>
        <p class="empty-hint" *ngIf="!contentGap()!.never_covered.length && contentGap()!.total_posts > 0">
          Toutes vos compétences ont déjà été abordées dans au moins un post.
        </p>
        <p class="empty-hint" *ngIf="contentGap()!.total_posts === 0">
          Sauvegardez quelques posts depuis l'éditeur pour voir apparaître cette analyse.
        </p>

        <div class="gap-section" *ngIf="contentGap()!.covered.length">
          <span class="gap-label">Déjà abordées</span>
          <div class="skill-chips">
            <span class="chip chip-covered" *ngFor="let s of contentGap()!.covered">{{ s }}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Calendrier éditorial</h2></div>
        <div class="calendar-grid">
          <div class="day-column" *ngFor="let day of days">
            <div class="day-head">{{ day.label }}</div>
            <div class="post-card" *ngFor="let p of postsByDay(day.key)">
              <span class="post-status" [class]="'status-' + p.status">{{ statusLabel(p.status) }}</span>
              <p class="post-excerpt">{{ p.content.slice(0, 80) }}{{ p.content.length > 80 ? '…' : '' }}</p>
            </div>
            <p class="empty-day" *ngIf="!postsByDay(day.key).length">Aucun post</p>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Tous les posts sauvegardés</h2></div>
        <div class="post-row" *ngFor="let p of posts()">
          <span class="post-status" [class]="'status-' + p.status">{{ statusLabel(p.status) }}</span>
          <p class="post-row-content">{{ p.content.slice(0, 100) }}{{ p.content.length > 100 ? '…' : '' }}</p>
          <a class="btn-edit" [routerLink]="['/contenu-linkedin']" [queryParams]="{ post: p.id }">Modifier</a>
          <button class="btn-delete" (click)="deletePost(p)">Supprimer</button>
        </div>
        <p class="empty-hint" *ngIf="!posts().length">Aucun post sauvegardé pour l'instant.</p>
      </section>
    </main>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; }
    .layout { display:flex; min-height:100vh; background:#F5F7FA; }
    .main { flex:1; padding:32px 40px; max-width:1400px; }

    .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; margin-bottom:20px; }
    .page-header h1 { font-size:24px; font-weight:600; margin-bottom:4px; }
    .muted { color:#94A3B8; font-size:13.5px; }
    .muted.small { font-size:12.5px; margin-bottom:16px; }
    .link-back { display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#7C5CFF; text-decoration:none; }

    .card { background:white; border-radius:18px; padding:24px; box-shadow:0 1px 2px rgba(15,23,42,0.04); margin-bottom:20px; }
    .card-head h2 { font-size:15px; font-weight:600; margin:0 0 4px; }

    .gap-section { margin-bottom:16px; }
    .gap-label { font-size:11px; text-transform:uppercase; color:#94A3B8; font-weight:700; display:block; margin-bottom:8px; }
    .skill-chips { display:flex; flex-wrap:wrap; gap:8px; }
    .chip { font-size:12px; font-weight:600; padding:6px 12px; border-radius:999px; }
    .chip-gap { background:#FEF3C7; color:#92400E; }
    .chip-covered { background:#F0FDF4; color:#15803D; }
    .empty-hint { color:#94A3B8; font-size:13px; padding:8px 0; }

    .calendar-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:10px; overflow-x:auto; }
    @media (max-width: 900px) { .calendar-grid { grid-template-columns:1fr; } }
    .day-column { background:#F8FAFC; border-radius:12px; padding:10px; min-width:0; }
    .day-head { font-size:11.5px; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:8px; text-align:center; }
    .post-card { background:white; border-radius:9px; padding:9px; margin-bottom:7px; }
    .post-excerpt { font-size:11px; color:#475569; margin:5px 0 0; line-height:1.4; }
    .empty-day { font-size:11px; color:#CBD5E1; text-align:center; padding:10px 0; margin:0; }

    .post-status {
      font-size:9.5px; font-weight:700; text-transform:uppercase; padding:2px 8px; border-radius:999px; display:inline-block;
    }
    .status-idee { background:#FEF3C7; color:#92400E; }
    .status-brouillon { background:#EFF6FF; color:#1D4ED8; }
    .status-publie { background:#F0FDF4; color:#15803D; }

    .post-row { display:flex; align-items:center; gap:14px; padding:11px 0; border-bottom:1px solid #F8FAFC; }
    .post-row-content { flex:1; font-size:13px; color:#334155; margin:0; min-width:0; }
    .btn-edit { font-size:11.5px; color:#7C5CFF; font-weight:600; flex-shrink:0; text-decoration:none; }
    .btn-edit:hover { text-decoration:underline; }
    .btn-delete { font-size:11.5px; color:#DC2626; font-weight:600; flex-shrink:0; }
    .btn-delete:hover { text-decoration:underline; }

    @media (max-width: 900px) { .main { padding:20px; } }
  `]
})
export class LinkedinCalendarComponent implements OnInit {
  private apiUrl = 'http://localhost:8000/api/v1';

  days = DAYS;
  posts = signal<PostVM[]>([]);
  contentGap = signal<{ total_posts: number; never_covered: string[]; covered: string[] } | null>(null);

  private statusLabels: Record<string, string> = { idee: 'Idée', brouillon: 'Brouillon', publie: 'Publié' };

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadPosts();
    this.loadContentGap();
  }

  private loadPosts() {
    this.http.get<any>(`${this.apiUrl}/linkedin-posts/`).subscribe({
      next: (data: any) => this.posts.set(Array.isArray(data) ? data : (data?.results || [])),
      error: () => {}
    });
  }

  private loadContentGap() {
    this.http.get<any>(`${this.apiUrl}/linkedin-posts/content-gap/`).subscribe({
      next: (res) => this.contentGap.set(res),
      error: () => {}
    });
  }

  postsByDay(day: string): PostVM[] {
    return this.posts().filter(p => p.scheduled_day === day);
  }

  statusLabel(status: string): string {
    return this.statusLabels[status] || status;
  }

  deletePost(p: PostVM) {
    this.http.delete(`${this.apiUrl}/linkedin-posts/${p.id}/`).subscribe({
      next: () => this.posts.set(this.posts().filter(x => x.id !== p.id))
    });
  }
}
