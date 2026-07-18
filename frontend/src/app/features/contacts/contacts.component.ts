import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarComponent } from '../../shared/sidebar.component';
import { IconComponent } from '../../shared/icon.component';
import { NotifyService } from '../../core/notify/notify.service';

interface ContactVM {
  id: number;
  company_name: string;
  status: string;
  notes: string;
  source_job_title: string | null;
  matching_offers_count: number;
  updated_at: string;
}

interface PersonVM {
  id: number;
  name: string;
  role: string;
  company_name: string;
  linkedin_url: string;
  status: string;
  notes: string;
  next_followup_date: string | null;
  company_contact: number | null;
}

const ROLE_KEYWORDS: Record<string, string> = {
  recruteur: 'recruteur',
  talent: 'talent acquisition',
  rh: 'ressources humaines',
  hiring: 'hiring manager',
};

const PERSON_STATUS_LABELS: Record<string, string> = {
  a_trouver: 'À trouver',
  a_contacter: 'À contacter',
  invitation_envoyee: 'Invitation envoyée',
  reponse_recue: 'Réponse reçue',
  conversation: 'Conversation',
  entretien_obtenu: 'Entretien obtenu',
};

/**
 * Réseau & Contacts — suivi des entreprises à approcher, et des
 * personnes individuelles identifiées chez chacune. 
 */
@Component({
  selector: 'app-contacts',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, IconComponent],
  template: `
  <div class="layout">
    <app-sidebar active="/contacts"></app-sidebar>

    <main class="main">
      <header class="page-header">
        <div>
          <h1>Contacts à approcher</h1>
          <p class="muted">
            Clutchr ne scrape jamais LinkedIn : on génère juste un lien de recherche pré-rempli.
            Vous naviguez et contactez depuis votre propre compte.
          </p>
        </div>
        <button class="btn-sync" (click)="syncFromMatches()" [disabled]="syncing()">
          <app-icon name="refresh" [size]="14" [class.spin]="syncing()"></app-icon>
          {{ syncing() ? 'Synchronisation...' : 'Resynchroniser' }}
        </button>
      </header>

      <div class="filter-banner" *ngIf="companyFilter()">
        Filtré sur <strong>{{ companyFilter() }}</strong>
        <button (click)="clearFilter()">Voir toutes les entreprises ×</button>
      </div>

      <div class="add-row">
        <input type="text" [(ngModel)]="newCompany" placeholder="Ajouter une entreprise manuellement" (keyup.enter)="addCompany()">
        <button class="btn-small" (click)="addCompany()" [disabled]="!newCompany.trim()">Ajouter</button>
      </div>

      <div class="empty-state" *ngIf="!loading() && filteredContacts().length === 0">
        <app-icon name="users" [size]="32" color="#CBD5E1"></app-icon>
        <h2>{{ companyFilter() ? 'Aucune entreprise ne correspond' : 'Aucune entreprise suivie' }}</h2>
        <p class="muted">Synchronisation automatique en cours, ou ajoutez une entreprise manuellement.</p>
      </div>

      <div class="contact-grid" *ngIf="filteredContacts().length">
        <article class="contact-card" *ngFor="let c of filteredContacts()">
          <div class="card-body">
            <div class="card-top">
              <div class="card-identity">
                <div class="card-avatar" [style.background]="logoFailed.has(c.id) ? accentFor(c.company_name) : 'white'">
                  <img *ngIf="!logoFailed.has(c.id)" [src]="logoUrlFor(c.company_name)" (error)="onLogoError(c.id)" alt="" loading="lazy">
                  <span *ngIf="logoFailed.has(c.id)">{{ companyInitials(c.company_name) }}</span>
                </div>
                <div>
                  <h3>{{ c.company_name }}</h3>
                  <p class="src" *ngIf="c.source_job_title">via « {{ c.source_job_title }} »</p>
                </div>
              </div>
              <div class="status-dropdown">
                <select class="status-select" [class]="'status-' + c.status" [(ngModel)]="c.status" (change)="updateContact(c)">
                  <option value="a_contacter">À contacter</option>
                  <option value="contacte">Contacté</option>
                  <option value="reponse_recue">Réponse reçue</option>
                  <option value="sans_reponse">Sans réponse</option>
                </select>
              </div>
            </div>

            <div class="stat-strip">
              <span class="stat-pill"><strong>{{ c.matching_offers_count }}</strong> offre{{ c.matching_offers_count > 1 ? 's' : '' }} correspondante{{ c.matching_offers_count > 1 ? 's' : '' }}</span>
              <span class="stat-pill muted">Mis à jour {{ relativeTime(c.updated_at) }}</span>
            </div>

            <div class="role-row">
              <select class="role-select" [(ngModel)]="roleByContact[c.id]">
                <option value="recruteur">Recruteur</option>
                <option value="talent">Talent Acquisition</option>
                <option value="rh">RH</option>
                <option value="hiring">Hiring Manager</option>
              </select>
              <a class="btn-linkedin" [href]="buildSearchUrl(c)" target="_blank" rel="noopener">
                <app-icon name="link" [size]="12"></app-icon> Rechercher sur LinkedIn
              </a>
            </div>

            <button class="btn-note-toggle" (click)="toggleNoteDialog(c.id)">
              <app-icon name="file-text" [size]="13"></app-icon>
              {{ c.notes ? 'Modifier la note' : 'Ajouter une note' }}
            </button>
            <div class="note-dialog" *ngIf="openNoteDialog() === c.id">
              <textarea [(ngModel)]="c.notes" placeholder="Message envoyé, contact trouvé, relance prévue..." rows="3"></textarea>
              <button class="btn-small" (click)="updateContact(c); toggleNoteDialog(c.id)">Enregistrer</button>
            </div>
            <p class="note-preview" *ngIf="c.notes && openNoteDialog() !== c.id">{{ c.notes }}</p>

            <button class="btn-toggle-people" (click)="togglePeople(c.id)">
              <app-icon [name]="expandedCompany() === c.id ? 'chevron-left' : 'chevron-right'" [size]="13"></app-icon>
              Personnes ({{ (peopleByCompany[c.id] || []).length }})
            </button>

            <div class="people-section" *ngIf="expandedCompany() === c.id">
              <div class="person-card" *ngFor="let p of (peopleByCompany[c.id] || [])">
                <div class="person-top">
                  <div class="person-avatar">{{ (p.name || '?').slice(0,1).toUpperCase() }}</div>
                  <input type="text" [(ngModel)]="p.name" placeholder="Nom" (blur)="updatePerson(p)" class="person-name-input">
                  <button class="btn-remove-entry" (click)="deletePerson(c.id, p)">×</button>
                </div>
                <div class="form-row-2">
                  <input type="text" [(ngModel)]="p.role" placeholder="Poste" (blur)="updatePerson(p)">
                  <select [(ngModel)]="p.status" (change)="updatePerson(p)">
                    <option *ngFor="let s of personStatusOptions" [value]="s.key">{{ s.label }}</option>
                  </select>
                </div>
                <input type="url" [(ngModel)]="p.linkedin_url" placeholder="Lien LinkedIn (optionnel)" (blur)="updatePerson(p)">
                <textarea [(ngModel)]="p.notes" placeholder="Notes" rows="2" (blur)="updatePerson(p)"></textarea>

                <div class="message-actions">
                  <button class="btn-message" (click)="generateMessage(p, 'invitation')" [disabled]="generatingFor() === p.id">Invitation</button>
                  <button class="btn-message" (click)="generateMessage(p, 'relance')" [disabled]="generatingFor() === p.id">Relance</button>
                  <button class="btn-message" (click)="generateMessage(p, 'angle_approche')" [disabled]="generatingFor() === p.id">Angle d'approche</button>
                </div>
                <div class="message-warning" *ngIf="messageNotConfigured() === p.id">
                  Module IA non configuré côté serveur.
                </div>
                <div class="generated-message" *ngIf="generatedMessages[p.id]">
                  <p>{{ generatedMessages[p.id] }}</p>
                  <button class="btn-copy" (click)="copyMessage(p.id)">Copier</button>
                </div>
              </div>

              <div class="add-person-row">
                <input type="text" [(ngModel)]="newPersonName[c.id]" placeholder="Nom de la personne" (keyup.enter)="addPerson(c)">
                <button class="btn-small" (click)="addPerson(c)" [disabled]="!newPersonName[c.id]?.trim()">Ajouter</button>
              </div>
            </div>

            <button class="btn-delete" (click)="deleteContact(c)">Retirer l'entreprise</button>
          </div>
        </article>
      </div>

      <nav class="pagination" *ngIf="totalPages() > 1" aria-label="Pagination des entreprises">
        <span class="pagination-summary">{{ totalCount() }} entreprise{{ totalCount() > 1 ? 's' : '' }} au total</span>
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
    </main>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; }
    .layout { display:flex; min-height:100vh; background:#f7f7fa; }
    .main { flex:1; padding:32px 36px; max-width: 1500px; }

    .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom: 16px; }
    .page-header h1 { font-size:26px; margin-bottom:6px; }
    .muted { color:#888; font-size:13.5px; max-width: 480px; line-height:1.5; }

    .btn-sync {
      display:flex; align-items:center; gap:7px; padding:11px 18px; border:none; border-radius:11px;
      background:linear-gradient(90deg,#7C5CFF,#F857C1); color:white; font-weight:600; font-size:13px; white-space:nowrap;
    }
    .btn-sync:disabled { opacity:.7; cursor:not-allowed; }
    .spin { animation: spin 1.2s linear infinite; }
    @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }


    .filter-banner {
      background:#F1EEFF; color:#6645E0; padding:11px 16px; border-radius:10px; font-size:13px; margin-bottom:16px;
      display:flex; align-items:center; gap:10px;
    }
    .filter-banner button { font-size:12px; font-weight:600; color:#6645E0; margin-left:auto; }
    .filter-banner button:hover { text-decoration:underline; }

    .add-row { display:flex; gap:8px; margin-bottom:24px; max-width:480px; }
    .add-row input { flex:1; padding:10px 14px; border:1.5px solid #e5e5e5; border-radius:10px; font-size:13.5px; }
    .add-row input:focus { outline:none; border-color:#7C5CFF; }
    .btn-small { padding:10px 16px; border:none; border-radius:10px; background:#15101f; color:white; font-size:13px; font-weight:600; }
    .btn-small:disabled { opacity:.5; cursor:not-allowed; }

    .empty-state { text-align:center; padding:60px 20px; display:flex; flex-direction:column; align-items:center; gap:12px; }
    .empty-state h2 { font-size:19px; }

    .contact-grid { display:grid; grid-template-columns:1fr; gap:18px; }
    @media (min-width: 900px) { .contact-grid { grid-template-columns: 1fr 1fr; } }

    .contact-card {
      background:white; border-radius:10px; overflow:hidden;
      box-shadow:0 2px 10px rgba(0,0,0,0.05), 0 4px 0 -2px #EDE7FF, 0 7px 0 -4px #E3D9FF;
      transition: transform 150ms, box-shadow 150ms;
    }
    .contact-card:hover {
      transform: translateY(-3px);
      box-shadow:0 10px 24px rgba(85,52,180,.14), 0 4px 0 -2px #EDE7FF, 0 7px 0 -4px #E3D9FF;
    }
    .card-avatar {
      width:46px; height:46px; border-radius:9px; flex-shrink:0; overflow:hidden;
      display:flex; align-items:center; justify-content:center;
      font-weight:700; font-size:15px; color:white;
    }
    .card-avatar img { width:28px; height:28px; object-fit:contain; }
    .card-body { padding:22px 20px 20px; }

    .card-top { display:flex; justify-content:space-between; gap:10px; margin-bottom:14px; align-items:flex-start; }
    .card-identity { display:flex; align-items:center; gap:12px; }
    .card-top h3 { font-size:15px; margin-bottom:2px; }
    .src { font-size:12px; color:#aaa; }

    .stat-strip { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
    .stat-pill { font-size:11.5px; font-weight:600; color:#475569; background:#F8FAFC; padding:6px 11px; border-radius:999px; }
    .stat-pill strong { color:#7C5CFF; font-weight:800; }
    .stat-pill.muted { color:#94A3B8; }
    .stat-pill.muted strong { color:#94A3B8; }

    .status-select {
      font-size:11.5px; font-weight:600; border:none; border-radius:8px; padding:6px 10px;
      background:#f3f4f6; color:#555;
    }
    .status-select.status-a_contacter { background:#fef3c7; color:#92400e; }
    .status-select.status-contacte { background:#dbeafe; color:#1d4ed8; }
    .status-select.status-reponse_recue { background:#dcfce7; color:#15803d; }
    .status-select.status-sans_reponse { background:#f3f4f6; color:#666; }

    .role-row { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
    .role-select { font-size:12.5px; padding:6px 8px; border:1.5px solid #e5e5e5; border-radius:8px; }
    .btn-linkedin {
      display:flex; align-items:center; gap:5px; margin-left:auto; font-size:12.5px; font-weight:600; color:#0a66c2; text-decoration:none;
      padding:7px 12px; border:1.5px solid #0a66c2; border-radius:8px;
    }
    .btn-linkedin:hover { background:#0a66c2; color:white; }

    .btn-note-toggle {
      display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#7C5CFF; margin-bottom:8px;
    }
    .note-dialog { background:#F8FAFC; border-radius:10px; padding:12px; margin-bottom:12px; display:flex; flex-direction:column; gap:8px; }
    .note-dialog textarea {
      width:100%; padding:9px 12px; border:1.5px solid #E6E9EF; border-radius:9px; font-size:12.5px; font-family:inherit; resize:vertical;
    }
    .note-preview { font-size:12px; color:#64748B; background:#F8FAFC; padding:9px 12px; border-radius:9px; margin-bottom:12px; line-height:1.5; }

    .btn-toggle-people {
      display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#7C5CFF;
      padding:7px 0; margin-bottom:6px;
    }

    .people-section { background:#F8FAFC; border-radius:12px; padding:14px; margin-bottom:12px; }
    .person-card { background:white; border-radius:10px; padding:12px; margin-bottom:10px; display:flex; flex-direction:column; gap:8px; }
    .person-top { display:flex; gap:8px; align-items:center; }
    .person-avatar {
      width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg,#7C5CFF,#F857C1); color:white;
      display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;
    }
    .person-name-input { flex:1; font-weight:600; }
    .person-card input, .person-card select, .person-card textarea {
      width:100%; padding:8px 10px; border:1.5px solid #E6E9EF; border-radius:8px; font-size:12.5px; font-family:inherit;
    }
    .form-row-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .btn-remove-entry { font-size:14px; color:#DC2626; font-weight:700; flex-shrink:0; width:24px; height:24px; }
    .btn-remove-entry:hover { background:#FEF2F2; border-radius:6px; }

    .message-actions { display:flex; gap:6px; flex-wrap:wrap; }
    .btn-message {
      font-size:11px; font-weight:600; color:#7C5CFF; background:#F1EEFF; padding:6px 10px; border-radius:7px;
    }
    .btn-message:disabled { opacity:.6; cursor:not-allowed; }
    .message-warning { font-size:11px; color:#92400E; background:#FFFBEB; padding:8px 10px; border-radius:7px; }
    .generated-message { background:#F8FAFC; border-radius:8px; padding:10px; }
    .generated-message p { font-size:12px; color:#334155; line-height:1.5; margin:0 0 8px; white-space:pre-wrap; }
    .btn-copy { font-size:11px; font-weight:600; color:#475569; background:white; border:1px solid #E6E9EF; padding:5px 10px; border-radius:6px; }

    .add-person-row { display:flex; gap:6px; }
    .add-person-row input { flex:1; padding:8px 10px; border:1.5px solid #E6E9EF; border-radius:8px; font-size:12.5px; }

    .btn-delete { border:none; background:transparent; color:#bbb; font-size:12px; margin-top:8px; }
    .btn-delete:hover { color:#dc2626; }

    @media (max-width: 900px) { .main { padding:20px; } }

    .pagination { display:flex; flex-direction:column; align-items:center; gap:12px; margin-top:28px; padding-bottom: 12px; }
    .pagination-summary { font-size:12.5px; color:#94A3B8; }
    .pagination-controls { display:flex; align-items:center; gap:5px; }
    .page-btn {
      min-width:34px; height:34px; padding:0 8px; border-radius:8px; background:white; border:1.5px solid #E6E9EF;
      font-size:13px; color:#475569; display:flex; align-items:center; justify-content:center;
    }
    .page-btn:hover:not(:disabled) { border-color:#7C5CFF; color:#7C5CFF; }
    .page-btn.active { background:#7C5CFF; border-color:#7C5CFF; color:white; font-weight:600; }
    .page-btn:disabled { opacity:.4; cursor:not-allowed; }
    .page-ellipsis { color:#CBD5E1; font-size:13px; padding:0 2px; }
  `]
})
export class ContactsComponent implements OnInit {
  private apiUrl = 'http://localhost:8000/api/v1';

  contacts = signal<ContactVM[]>([]);
  loading = signal(true);
  syncing = signal(false);
  newCompany = '';
  roleByContact: Record<number, string> = {};
  companyFilter = signal<string | null>(null);
  openNoteDialog = signal<number | null>(null);

  currentPage = signal(1);
  totalCount = signal(0);
  totalPages = signal(1);
  readonly pageSize = 20;

  expandedCompany = signal<number | null>(null);
  peopleByCompany: Record<number, PersonVM[]> = {};
  newPersonName: Record<number, string> = {};

  generatingFor = signal<number | null>(null);
  messageNotConfigured = signal<number | null>(null);
  generatedMessages: Record<number, string> = {};

  personStatusOptions = Object.entries(PERSON_STATUS_LABELS).map(([key, label]) => ({ key, label }));

  constructor(private http: HttpClient, private auth: AuthService, private route: ActivatedRoute, private notify: NotifyService) {}

  ngOnInit() {
    const entreprise = this.route.snapshot.queryParamMap.get('entreprise');
    if (entreprise) this.companyFilter.set(entreprise);

    // Auto-synchronisation à l'arrivée : on n'attend plus que
    // l'utilisateur clique avant de voir le moindre contact.
    this.loadContacts(true);
  }

  filteredContacts(): ContactVM[] {
    return this.contacts();
  }

  clearFilter() {
    this.companyFilter.set(null);
    this.loadContacts(false, 1);
  }

  accentFor(companyName: string): string {
    const palette = ['#7C5CFF', '#C026D3'];
    let hash = 0;
    for (const ch of companyName) hash = (hash * 31 + ch.charCodeAt(0)) % palette.length;
    return palette[Math.abs(hash)];
  }

  logoFailed = new Set<number>();

  logoUrlFor(companyName: string): string {
    const guessedDomain = (companyName || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '') + '.com';
    return `https://favicon.im/${guessedDomain}?throw-error-on-404=true`;
  }

  onLogoError(contactId: number) {
    this.logoFailed.add(contactId);
  }

  relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days < 1) return "aujourd'hui";
    if (days === 1) return 'hier';
    if (days < 30) return `il y a ${days} j`;
    return `il y a ${Math.floor(days / 30)} mois`;
  }

  companyInitials(companyName: string): string {
    return (companyName || '?').trim().slice(0, 2).toUpperCase();
  }

  toggleNoteDialog(id: number) {
    this.openNoteDialog.set(this.openNoteDialog() === id ? null : id);
  }

  private loadContacts(autoSyncIfEmpty = false, page: number = 1) {
    this.loading.set(true);
    const filter = this.companyFilter();
    const params = new URLSearchParams({ page: String(page) });
    if (filter) params.set('company_name', filter);

    this.http.get<any>(`${this.apiUrl}/contacts/?${params.toString()}`).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : (data?.results || []);
        this.contacts.set(list);
        this.totalCount.set(Array.isArray(data) ? list.length : (data?.count || 0));
        this.totalPages.set(Math.max(1, Math.ceil(this.totalCount() / this.pageSize)));
        this.currentPage.set(page);
        list.forEach((c: ContactVM) => { if (!this.roleByContact[c.id]) this.roleByContact[c.id] = 'recruteur'; });
        this.loading.set(false);

        if (autoSyncIfEmpty) this.syncFromMatches(this.totalCount() === 0);
      },
      error: () => { this.loading.set(false); }
    });
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) return;
    this.loadContacts(false, page);
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

  syncFromMatches(silent = false) {
    if (!silent) this.syncing.set(true);
    this.http.post<any>(`${this.apiUrl}/contacts/sync_from_matches/`, {}).subscribe({
      next: (res) => {
        this.syncing.set(false);
        if (!silent || res.new_contacts > 0) {
          this.showToast(res.new_contacts > 0 ? `J'ai trouvé ${res.new_contacts} nouvelle(s) entreprise(s) à approcher.` : "Votre réseau est déjà à jour.");
        }
        this.loadContacts(false);
      },
      error: (err) => {
        this.syncing.set(false);
        if (!silent) this.showToast(AuthService.extractErrorMessage(err), true);
      }
    });
  }

  buildSearchUrl(c: ContactVM): string {
    const role = ROLE_KEYWORDS[this.roleByContact[c.id] || 'recruteur'];
    const keywords = `${role} ${c.company_name}`;
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
  }

  addCompany() {
    const name = this.newCompany.trim();
    if (!name) return;
    this.http.post<ContactVM>(`${this.apiUrl}/contacts/`, { company_name: name, status: 'a_contacter', notes: '' }).subscribe({
      next: () => {
        this.newCompany = '';
        this.loadContacts(false);
      },
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  updateContact(c: ContactVM) {
    this.http.patch(`${this.apiUrl}/contacts/${c.id}/`, { status: c.status, notes: c.notes }).subscribe({
      next: () => this.showToast('Noté.'),
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  deleteContact(c: ContactVM) {
    this.http.delete(`${this.apiUrl}/contacts/${c.id}/`).subscribe({
      next: () => this.contacts.set(this.contacts().filter(x => x.id !== c.id)),
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  togglePeople(companyContactId: number) {
    if (this.expandedCompany() === companyContactId) {
      this.expandedCompany.set(null);
      return;
    }
    this.expandedCompany.set(companyContactId);
    if (!this.peopleByCompany[companyContactId]) {
      this.loadPeople(companyContactId);
    }
  }

  private loadPeople(companyContactId: number) {
    this.http.get<any>(`${this.apiUrl}/people/?company_contact=${companyContactId}`).subscribe({
      next: (data: any) => {
        this.peopleByCompany[companyContactId] = Array.isArray(data) ? data : (data?.results || []);
      },
      error: () => { this.peopleByCompany[companyContactId] = []; }
    });
  }

  addPerson(c: ContactVM) {
    const name = (this.newPersonName[c.id] || '').trim();
    if (!name) return;

    this.http.post<PersonVM>(`${this.apiUrl}/people/`, {
      name, company_name: c.company_name, company_contact: c.id, status: 'a_trouver',
    }).subscribe({
      next: (person) => {
        this.peopleByCompany[c.id] = [...(this.peopleByCompany[c.id] || []), person];
        this.newPersonName[c.id] = '';
      },
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  updatePerson(p: PersonVM) {
    this.http.patch(`${this.apiUrl}/people/${p.id}/`, {
      name: p.name, role: p.role, linkedin_url: p.linkedin_url, status: p.status, notes: p.notes,
    }).subscribe({
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  deletePerson(companyContactId: number, p: PersonVM) {
    this.http.delete(`${this.apiUrl}/people/${p.id}/`).subscribe({
      next: () => {
        this.peopleByCompany[companyContactId] = (this.peopleByCompany[companyContactId] || []).filter(x => x.id !== p.id);
      },
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  generateMessage(p: PersonVM, messageType: 'invitation' | 'relance' | 'angle_approche') {
    this.generatingFor.set(p.id);
    this.messageNotConfigured.set(null);
    this.http.post<any>(`${this.apiUrl}/people/${p.id}/generate-message/`, { message_type: messageType }).subscribe({
      next: (res) => {
        this.generatingFor.set(null);
        this.generatedMessages[p.id] = res.message;
      },
      error: (err) => {
        this.generatingFor.set(null);
        if (err.status === 501) this.messageNotConfigured.set(p.id);
        else this.showToast(AuthService.extractErrorMessage(err), true);
      }
    });
  }

  copyMessage(personId: number) {
    const message = this.generatedMessages[personId];
    if (message) {
      navigator.clipboard.writeText(message);
      this.showToast('Message copié');
    }
  }

  private showToast(msg: string, isError = false) {
    if (isError) this.notify.error('Oups', msg);
    else this.notify.success('Fait', msg);
  }
}
