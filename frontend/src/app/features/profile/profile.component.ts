import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarComponent } from '../../shared/sidebar.component';
import { IconComponent } from '../../shared/icon.component';
import { NotifyService } from '../../core/notify/notify.service';
import { LINKEDIN_CLIENT_ID, LINKEDIN_REDIRECT_URI } from '../../core/config';

interface SkillEntry { name: string; weight: number; }
type ProfileTab = 'profil' | 'competences' | 'objectifs';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, IconComponent],
  template: `
  <div class="layout">
    <app-sidebar active="/profil"></app-sidebar>

    <main class="main">
      <header class="page-header">
        <h1>Mon profil</h1>
      </header>


      <nav class="tabs">
        <button *ngFor="let t of tabsList" [class.active]="tab() === t.key" (click)="tab.set(t.key)">
          {{ t.label }}
        </button>
      </nav>

      <!-- PROFIL -->
      <section class="tab-panel" *ngIf="tab() === 'profil'">
        <div class="card avatar-card">
          <div class="avatar-big" [class.has-photo]="avatarUrl()">
            <img *ngIf="avatarUrl()" [src]="avatarUrl()" alt="Photo de profil">
            <ng-container *ngIf="!avatarUrl()">{{ initials() }}</ng-container>
          </div>
          <div class="avatar-info">
            <h2>{{ structuredTitre || displayName() }}</h2>
            <p class="muted">{{ currentRole || 'Poste non renseigné' }}</p>
          </div>
          <button class="btn-sync" (click)="connectLinkedInPhoto()" [disabled]="syncingLinkedinPhoto()" title="Récupère votre photo depuis LinkedIn (Sign In with LinkedIn)">
            <app-icon [name]="syncingLinkedinPhoto() ? 'refresh' : 'user'" [size]="14" [class.spin]="syncingLinkedinPhoto()"></app-icon>
            {{ syncingLinkedinPhoto() ? 'Synchronisation...' : 'Synchroniser ma photo LinkedIn' }}
          </button>
          <button class="btn-sync" (click)="syncFromDocuments()" [disabled]="structuring()" title="Relance l'analyse IA à partir de vos documents importés">
            <app-icon [name]="structuring() ? 'refresh' : 'sparkles'" [size]="14" [class.spin]="structuring()"></app-icon>
            {{ structuring() ? 'Synchronisation...' : 'Synchroniser mes données' }}
          </button>
        </div>

        <div class="config-warning" *ngIf="linkedinPhotoNotConfigured()">
          Synchronisation LinkedIn non configurée côté serveur (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET manquants).
        </div>

        <div class="config-warning" *ngIf="structureNotConfigured()">
          Module IA non configuré côté serveur (GEMINI_API_KEY manquant).
        </div>

        <div class="card">
          <div class="card-head"><h3>Informations</h3></div>
          <div class="form-row-2">
            <div class="form-group">
              <label>Poste actuel</label>
              <input type="text" [(ngModel)]="currentRole" placeholder="Développeuse Full-Stack">
            </div>
            <div class="form-group">
              <label>Entreprise actuelle</label>
              <input type="text" [(ngModel)]="currentCompany" placeholder="Nom de l'entreprise">
            </div>
          </div>
          <div class="form-group">
            <label>Bio</label>
            <textarea [(ngModel)]="bio" maxlength="500" rows="3" placeholder="Quelques mots sur votre parcours..."></textarea>
          </div>
          <button class="btn-save" (click)="savePreferences()" [disabled]="savingPrefs()">
            {{ savingPrefs() ? 'Enregistrement...' : 'Enregistrer' }}
          </button>
        </div>

        <div class="card">
          <div class="card-head"><h3>Résumé</h3></div>
          <textarea class="linkedin-summary" [(ngModel)]="structuredResume" rows="4"
            placeholder="Pas encore de résumé — synchronisez vos documents pour le générer automatiquement, ou écrivez le vôtre."
            (blur)="saveStructuredProfile()"></textarea>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>Expériences</h3>
            <button class="btn-small" (click)="addExperience()">Ajouter</button>
          </div>
          <div class="li-entry" *ngFor="let exp of structuredExperiences(); let i = index">
            <div class="li-entry-icon"><app-icon name="briefcase" [size]="16" color="#7C5CFF"></app-icon></div>
            <div class="li-entry-body">
              <div class="form-row-2">
                <input type="text" [(ngModel)]="exp.poste" placeholder="Poste" (blur)="saveStructuredProfile()">
                <input type="text" [(ngModel)]="exp.entreprise" placeholder="Entreprise" (blur)="saveStructuredProfile()">
              </div>
              <input type="text" [(ngModel)]="exp.periode" placeholder="Période" (blur)="saveStructuredProfile()">
              <textarea [(ngModel)]="exp.description" rows="2" placeholder="Description" (blur)="saveStructuredProfile()"></textarea>
              <button class="btn-remove-entry" (click)="removeExperience(i)">Retirer</button>
            </div>
          </div>
          <p class="empty-hint" *ngIf="!structuredExperiences().length">Aucune expérience renseignée. Synchronisez vos documents ou ajoutez-en une manuellement.</p>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>Formations</h3>
            <button class="btn-small" (click)="addFormation()">Ajouter</button>
          </div>
          <div class="li-entry" *ngFor="let f of structuredFormations(); let i = index">
            <div class="li-entry-icon"><app-icon name="calendar" [size]="16" color="#F857C1"></app-icon></div>
            <div class="li-entry-body">
              <div class="form-row-2">
                <input type="text" [(ngModel)]="f.diplome" placeholder="Diplôme" (blur)="saveStructuredProfile()">
                <input type="text" [(ngModel)]="f.etablissement" placeholder="Établissement" (blur)="saveStructuredProfile()">
              </div>
              <input type="text" [(ngModel)]="f.periode" placeholder="Période" (blur)="saveStructuredProfile()">
              <button class="btn-remove-entry" (click)="removeFormation(i)">Retirer</button>
            </div>
          </div>
          <p class="empty-hint" *ngIf="!structuredFormations().length">Aucune formation renseignée.</p>
        </div>

        <div class="card">
          <div class="card-head"><h3>Documents sources</h3></div>
          <div class="doc-row-compact">
            <span class="doc-compact-label">
              <app-icon name="file-text" [size]="15" color="#7C5CFF"></app-icon>
              Export LinkedIn
              <span class="doc-status-dot" [class.ok]="hasLinkedinPdf()"></span>
            </span>
            <div class="doc-actions">
              <button class="btn-ghost" *ngIf="hasLinkedinPdf()" (click)="togglePreview('linkedin')" [disabled]="loadingPreview() === 'linkedin'">
                {{ activePreview() === 'linkedin' ? 'Masquer' : (loadingPreview() === 'linkedin' ? 'Chargement...' : 'Aperçu') }}
              </button>
              <label class="btn-ghost upload-label">
                Réimporter
                <input type="file" accept="application/pdf" hidden (change)="reupload($event, 'linkedin')">
              </label>
            </div>
          </div>
          <div class="pdf-preview" *ngIf="activePreview() === 'linkedin' && previewUrl()">
            <iframe [src]="previewUrl()" title="Aperçu de l'export LinkedIn"></iframe>
          </div>

          <div class="doc-row-compact">
            <span class="doc-compact-label">
              <app-icon name="file-text" [size]="15" color="#F857C1"></app-icon>
              CV
              <span class="doc-status-dot" [class.ok]="hasCvPdf()"></span>
            </span>
            <div class="doc-actions">
              <button class="btn-ghost" *ngIf="hasCvPdf()" (click)="togglePreview('cv')" [disabled]="loadingPreview() === 'cv'">
                {{ activePreview() === 'cv' ? 'Masquer' : (loadingPreview() === 'cv' ? 'Chargement...' : 'Aperçu') }}
              </button>
              <label class="btn-ghost upload-label">
                Réimporter
                <input type="file" accept="application/pdf" hidden (change)="reupload($event, 'cv')">
              </label>
            </div>
          </div>
          <div class="pdf-preview" *ngIf="activePreview() === 'cv' && previewUrl()">
            <iframe [src]="previewUrl()" title="Aperçu du CV"></iframe>
          </div>

          <p class="reupload-note" *ngIf="reuploading()">Analyse du nouveau document en cours...</p>
        </div>
      </section>

      <!-- COMPÉTENCES -->
      <section class="tab-panel" *ngIf="tab() === 'competences'">
        <div class="card">
          <div class="card-head">
            <h3>Vos compétences</h3>
            <span class="count-pill">{{ skills().length }}</span>
          </div>
          <p class="muted small">Issues de votre CV / LinkedIn, ou ajoutées manuellement.</p>

          <div class="skill-chips" *ngIf="skills().length; else noSkills">
            <span class="chip" *ngFor="let s of skills(); let i = index">
              {{ s.name }}
              <span class="chip-weight">{{ s.weight }}</span>
              <button class="chip-x" (click)="removeSkill(i)"><app-icon name="x-circle" [size]="13"></app-icon></button>
            </span>
          </div>
          <ng-template #noSkills><p class="empty-hint">Aucune compétence pour l'instant.</p></ng-template>

          <div class="add-row">
            <input type="text" [(ngModel)]="newSkillName" placeholder="Ex. TypeScript" (keyup.enter)="addSkill()">
            <button class="btn-small" (click)="addSkill()" [disabled]="!newSkillName.trim()">
              <app-icon name="plus" [size]="14"></app-icon> Ajouter
            </button>
          </div>

          <button class="btn-save" (click)="saveSkills()" [disabled]="savingSkills()">
            {{ savingSkills() ? 'Enregistrement...' : 'Enregistrer les compétences' }}
          </button>
        </div>
      </section>

      <!-- OBJECTIFS -->
      <section class="tab-panel" *ngIf="tab() === 'objectifs'">
        <div class="card">
          <div class="card-head"><h3>Postes &amp; lieux ciblés</h3></div>

          <div class="form-group">
            <label>Postes ciblés</label>
            <div class="chip-input-row">
              <span class="chip chip-soft" *ngFor="let r of targetRoles(); let i = index">
                {{ r }}<button class="chip-x" (click)="removeFromList(targetRoles, i)"><app-icon name="x-circle" [size]="13"></app-icon></button>
              </span>
            </div>
            <div class="add-row">
              <input type="text" [(ngModel)]="newRole" placeholder="Ajouter un poste ciblé" (keyup.enter)="addToList(targetRoles, 'newRole')">
              <button class="btn-small" (click)="addToList(targetRoles, 'newRole')" [disabled]="!newRole.trim()">Ajouter</button>
            </div>

            <button class="btn-suggest" (click)="loadRoleSuggestions()" [disabled]="loadingSuggestions()">
              <app-icon name="sparkles" [size]="13"></app-icon>
              {{ loadingSuggestions() ? 'Analyse...' : 'Suggérer des postes (IA)' }}
            </button>

            <div class="suggest-warning" *ngIf="suggestionsNotConfigured()">
              Module IA non configuré (GEMINI_API_KEY manquant côté backend).
            </div>

            <div class="suggestion-list" *ngIf="roleSuggestions().length">
              <div class="suggestion-card" *ngFor="let s of roleSuggestions()">
                <div class="suggestion-top">
                  <strong>{{ s.poste }}</strong>
                  <span class="potential-pill">{{ s.potentiel }}% potentiel</span>
                </div>
                <p>{{ s.justification }}</p>
                <button class="btn-add-suggestion" (click)="addSuggestedRole(s.poste)">
                  <app-icon name="plus" [size]="12"></app-icon> Ajouter à mes postes ciblés
                </button>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>Lieux ciblés</label>
            <div class="chip-input-row">
              <span class="chip chip-soft" *ngFor="let l of targetLocations(); let i = index">
                {{ l }}<button class="chip-x" (click)="removeFromList(targetLocations, i)"><app-icon name="x-circle" [size]="13"></app-icon></button>
              </span>
            </div>
            <div class="add-row">
              <input type="text" [(ngModel)]="newLocation" placeholder="Ajouter un lieu" (keyup.enter)="addToList(targetLocations, 'newLocation')">
              <button class="btn-small" (click)="addToList(targetLocations, 'newLocation')" [disabled]="!newLocation.trim()">Ajouter</button>
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label>Années d'expérience</label>
              <input type="number" [(ngModel)]="yearsExperience" min="0">
            </div>
            <div class="form-group">
              <label>Salaire minimum souhaité (€)</label>
              <input type="number" [(ngModel)]="targetSalaryMin" min="0" placeholder="Ex. 40000">
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label>Salaire maximum envisagé (€)</label>
              <input type="number" [(ngModel)]="targetSalaryMax" min="0" placeholder="Ex. 55000">
            </div>
            <div class="form-group">
              <label>Type de contrat</label>
              <select [(ngModel)]="contractType">
                <option value="">Indifférent</option>
                <option value="cdi">CDI</option>
                <option value="cdd">CDD</option>
                <option value="alternance">Alternance</option>
                <option value="stage">Stage</option>
                <option value="freelance">Freelance</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Préférence de télétravail</label>
            <select [(ngModel)]="remotePreference">
              <option value="">Indifférent</option>
              <option value="full">Télétravail complet</option>
              <option value="hybrid">Hybride</option>
              <option value="onsite">Présentiel</option>
            </select>
            <p class="field-note">
              Filtre appliqué sur les offres déjà collectées : ni Adzuna ni France Travail
              n'exposent ce critère à la recherche, le résultat dépend donc de ce qui a été détecté
              dans le texte de chaque offre.
            </p>
          </div>

          <button class="btn-save" (click)="savePreferences()" [disabled]="savingPrefs()">
            {{ savingPrefs() ? 'Enregistrement...' : 'Enregistrer les objectifs' }}
          </button>
        </div>
      </section>

    </main>
  </div>
  `,
  styles: [`
    :host { display:block; font-family:'Inter',sans-serif; }
    .layout { display:flex; min-height:100vh; background:#F5F7FA; }
    .main { flex:1; padding:32px 40px; max-width: 1100px; }

    .page-header h1 { font-size:24px; font-weight:600; margin-bottom:20px; }

    .tabs { display:flex; gap:6px; margin-bottom:24px; border-bottom:1px solid #E6E9EF; }
    .tabs button {
      padding:10px 16px; font-size:13.5px; font-weight:500; color:#64748B;
      border-bottom:2px solid transparent; margin-bottom:-1px;
    }
    .tabs button.active { color:#7C5CFF; border-bottom-color:#7C5CFF; font-weight:600; }

    .tab-panel { display:flex; flex-direction:column; gap:16px; }
    .card { background:white; border-radius:18px; padding:24px; box-shadow:0 1px 2px rgba(15,23,42,0.04); }
    .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
    .card-head h3 { font-size:15px; font-weight:600; margin:0; }
    .count-pill { background:#F1EEFF; color:#7C5CFF; font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:999px; }

    .avatar-card { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
    .avatar-big.has-photo { padding:0; overflow:hidden; }
    .avatar-big img { width:100%; height:100%; object-fit:cover; border-radius:inherit; }
    .avatar-big {
      width:56px; height:56px; border-radius:50%; flex-shrink:0;
      background:linear-gradient(135deg,#7C5CFF,#F857C1); color:white;
      display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:600;
    }
    .avatar-info { flex:1; min-width:0; }
    .avatar-card h2 { font-size:17px; font-weight:600; margin-bottom:2px; }
    .muted { color:#64748B; font-size:13.5px; }

    .btn-sync {
      display:flex; align-items:center; gap:7px; padding:10px 16px; border-radius:10px;
      background:linear-gradient(135deg,#7C5CFF,#6645E0); color:white; font-weight:600; font-size:12.5px;
      flex-shrink:0;
    }
    .btn-sync:disabled { opacity:.65; cursor:not-allowed; }
    .btn-sync .spin { animation: spin 1.2s linear infinite; }
    @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }

    .linkedin-summary {
      width:100%; padding:12px 14px; border:1.5px solid #E6E9EF; border-radius:10px; font-size:13.5px;
      font-family:inherit; line-height:1.6; resize:vertical;
    }
    .linkedin-summary:focus { outline:none; border-color:#7C5CFF; }

    .li-entry { display:flex; gap:14px; padding:14px 0; border-bottom:1px solid #F8FAFC; }
    .li-entry:last-of-type { border-bottom:none; }
    .li-entry-icon {
      width:34px; height:34px; border-radius:9px; background:#F8FAFC; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; margin-top:2px;
    }
    .li-entry-body { flex:1; display:flex; flex-direction:column; gap:8px; min-width:0; }
    .li-entry-body input, .li-entry-body textarea {
      width:100%; padding:9px 12px; border:1.5px solid #E6E9EF; border-radius:9px; font-size:13px; font-family:inherit;
    }

    .doc-row-compact { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #F8FAFC; }
    .doc-row-compact:last-of-type { border-bottom:none; }
    .doc-compact-label { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:#334155; }
    .doc-status-dot { width:7px; height:7px; border-radius:50%; background:#E2E8F0; }
    .doc-status-dot.ok { background:#2DD4BF; }
    .muted.small { font-size:12.5px; margin-bottom:14px; }

    .skill-chips { display:flex; flex-wrap:wrap; gap:8px; margin: 12px 0 16px; }
    .chip {
      display:inline-flex; align-items:center; gap:7px; background:#F1EEFF; color:#6645E0;
      padding:7px 11px; border-radius:999px; font-size:12.5px; font-weight:600;
    }
    .chip-soft { background:#EFF1F8; color:#475569; }
    .chip-weight { background:rgba(124,92,255,0.15); border-radius:999px; padding:1px 7px; font-size:10.5px; }
    .chip-x { display:flex; color:inherit; opacity:.55; }
    .chip-x:hover { opacity:1; }

    .empty-hint { color:#94A3B8; font-size:13px; margin: 8px 0 16px; }

    .add-row { display:flex; gap:8px; margin-bottom:14px; }
    .add-row input { flex:1; padding:9px 13px; border:1.5px solid #E6E9EF; border-radius:10px; font-size:13px; }
    .add-row input:focus { outline:none; border-color:#7C5CFF; }
    .btn-small {
      padding:9px 14px; border-radius:10px; background:#1B1C2A; color:white;
      font-size:12.5px; font-weight:600; display:flex; align-items:center; gap:5px;
    }
    .btn-small:disabled { opacity:.5; cursor:not-allowed; }

    .chip-input-row { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; }

    .btn-suggest {
      display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#7C5CFF;
      background:#F1EEFF; padding:8px 14px; border-radius:9px; margin-top:4px;
    }
    .btn-suggest:disabled { opacity:.6; cursor:not-allowed; }
    .suggest-warning { background:#FFFBEB; color:#92400E; padding:10px 14px; border-radius:9px; font-size:12px; margin-top:10px; }

    .suggestion-list { display:flex; flex-direction:column; gap:10px; margin-top:12px; }
    .suggestion-card { background:#F8FAFC; border-radius:12px; padding:14px; }
    .suggestion-top { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; }
    .suggestion-top strong { font-size:13.5px; color:#0F172A; }
    .potential-pill { font-size:11px; background:#ECFDF5; color:#0D9488; padding:3px 9px; border-radius:999px; font-weight:600; white-space:nowrap; }
    .suggestion-card p { font-size:12.5px; color:#64748B; margin:0 0 10px; line-height:1.5; }
    .btn-add-suggestion {
      display:flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600; color:#7C5CFF;
      background:white; border:1.5px solid #E6E9EF; padding:6px 12px; border-radius:8px;
    }
    .btn-add-suggestion:hover { border-color:#7C5CFF; }

    .form-group { margin-bottom:16px; }
    .form-group label { display:block; font-size:12.5px; font-weight:600; margin-bottom:6px; color:#334155; }
    .form-group input, .form-group textarea, .form-group select {
      width:100%; padding:10px 13px; border:1.5px solid #E6E9EF; border-radius:10px; font-size:13.5px; font-family:inherit;
      background:white;
    }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus { outline:none; border-color:#7C5CFF; }
    .form-row-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .field-note { font-size:11.5px; color:#94A3B8; margin-top:7px; line-height:1.5; }

    .btn-save {
      width:100%; padding:12px; border-radius:11px; margin-top:4px;
      background: linear-gradient(135deg,#7C5CFF,#6645E0); color:white; font-weight:600; font-size:13.5px;
      transition: transform 150ms;
    }
    .btn-save:hover:not(:disabled) { transform: translateY(-1px); }
    .btn-save:disabled { opacity:.6; cursor:not-allowed; }

    .doc-actions { display:flex; gap:8px; }
    .btn-ghost { padding:7px 13px; border:1.5px solid #E6E9EF; border-radius:9px; background:white; font-size:12px; color:#475569; }
    .btn-ghost:hover { border-color:#7C5CFF; color:#7C5CFF; }
    .upload-label { display:inline-flex; align-items:center; }

    .pdf-preview { margin: 0 0 10px; border-radius:12px; overflow:hidden; border:1px solid #E6E9EF; }
    .pdf-preview iframe { width:100%; height:420px; border:none; display:block; }
    .reupload-note { font-size:13px; color:#7C5CFF; margin-top:8px; }

    .config-warning {
      background:#FFFBEB; color:#92400E; padding:14px 18px; border-radius:12px; font-size:13px;
      margin-bottom:16px;
    }

    .btn-remove-entry { font-size:11.5px; color:#DC2626; align-self:flex-start; font-weight:600; }
    .btn-remove-entry:hover { text-decoration:underline; }

    @media (max-width: 900px) {
      .main { padding:20px; }
      .form-row-2 { grid-template-columns:1fr; }
      .pdf-preview iframe { height:320px; }
    }
  `]
})
export class ProfileComponent implements OnInit {
  private apiUrl = 'http://localhost:8000/api/v1';

  tab = signal<ProfileTab>('profil');
  tabsList: { key: ProfileTab; label: string }[] = [
    { key: 'profil', label: 'Profil' },
    { key: 'competences', label: 'Compétences' },
    { key: 'objectifs', label: 'Objectifs' },
  ];

  skills = signal<SkillEntry[]>([]);
  newSkillName = '';

  targetRoles = signal<string[]>([]);
  targetLocations = signal<string[]>([]);
  newRole = '';
  roleSuggestions = signal<{ poste: string; potentiel: number; justification: string }[]>([]);
  loadingSuggestions = signal(false);
  suggestionsNotConfigured = signal(false);
  newLocation = '';
  yearsExperience: number | null = 0;
  targetSalaryMin: number | null = null;
  targetSalaryMax: number | null = null;
  contractType = '';
  remotePreference = '';
  currentRole = '';
  currentCompany = '';
  bio = '';

  linkedinText = signal('');
  cvText = signal('');
  hasLinkedinPdf = signal(false);
  hasCvPdf = signal(false);
  activePreview = signal<'linkedin' | 'cv' | null>(null);
  loadingPreview = signal<'linkedin' | 'cv' | null>(null);
  previewUrl = signal<SafeResourceUrl | null>(null);
  private previewBlobUrl: string | null = null;

  avatarUrl = signal<string | null>(null);
  syncingLinkedinPhoto = signal(false);
  linkedinPhotoNotConfigured = signal(false);

  structuring = signal(false);
  structureNotConfigured = signal(false);
  hasStructuredProfile = signal(false);
  structuredTitre = '';
  structuredResume = '';
  structuredExperiences = signal<any[]>([]);
  structuredFormations = signal<any[]>([]);
  reuploading = signal(false);

  savingSkills = signal(false);
  savingPrefs = signal(false);

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private sanitizer: DomSanitizer,
    private notify: NotifyService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.loadProfile();

    this.route.queryParams.subscribe(params => {
      if (params['code']) {
        this.exchangeLinkedInCode(params['code']);
        this.router.navigate([], { queryParams: {}, replaceUrl: true });
      }
    });
  }

  connectLinkedInPhoto() {
    if (!LINKEDIN_CLIENT_ID) {
      this.linkedinPhotoNotConfigured.set(true);
      return;
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: LINKEDIN_CLIENT_ID,
      redirect_uri: LINKEDIN_REDIRECT_URI,
      scope: 'openid profile',
      state: crypto.randomUUID(),
    });
    window.location.href = `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  }

  private exchangeLinkedInCode(code: string) {
    this.syncingLinkedinPhoto.set(true);
    this.linkedinPhotoNotConfigured.set(false);
    this.http.post<any>(`${this.apiUrl}/profile/sync-linkedin-photo/`, { code }).subscribe({
      next: (profile) => {
        this.syncingLinkedinPhoto.set(false);
        this.avatarUrl.set(profile.avatar || null);
        this.showToast('Photo LinkedIn synchronisée');
      },
      error: (err) => {
        this.syncingLinkedinPhoto.set(false);
        if (err.status === 501) this.linkedinPhotoNotConfigured.set(true);
        else this.showToast(AuthService.extractErrorMessage(err), true);
      }
    });
  }

  displayName(): string {
    const u = this.auth.getCurrentUser();
    return u?.first_name || u?.username || 'Utilisateur';
  }

  initials(): string {
    return this.displayName().slice(0, 2).toUpperCase();
  }

  private loadProfile() {
    this.http.get<any>(`${this.apiUrl}/profile/me/`).subscribe({
      next: (p) => {
        this.avatarUrl.set(p.avatar || null);
        const skillsDict = p.extracted_skills || {};
        this.skills.set(Object.entries(skillsDict).map(([name, weight]) => ({ name, weight: Number(weight) })));
        this.targetRoles.set(p.target_roles || []);
        this.targetLocations.set(p.target_locations || []);
        this.yearsExperience = p.years_experience ?? 0;
        this.targetSalaryMin = p.target_salary_min ?? null;
        this.targetSalaryMax = p.target_salary_max ?? null;
        this.contractType = p.contract_type || '';
        this.remotePreference = p.remote_preference || '';
        this.currentRole = p.current_role || '';
        this.currentCompany = p.current_company || '';
        this.bio = p.bio || '';
        this.linkedinText.set(p.linkedin_text || '');
        this.cvText.set(p.cv_text || '');
        this.hasLinkedinPdf.set(!!p.has_linkedin_pdf);
        this.hasCvPdf.set(!!p.has_cv_pdf);
        this.loadStructuredProfile(p.structured_profile);
      },
      error: () => this.showToast("Impossible de charger le profil.", true)
    });
  }

  private showToast(msg: string, isError = false) {
    if (isError) this.notify.error('Oups', msg);
    else this.notify.success('Fait', msg);
  }

  addSkill() {
    const name = this.newSkillName.trim();
    if (!name) return;
    if (this.skills().some(s => s.name.toLowerCase() === name.toLowerCase())) {
      this.newSkillName = '';
      return;
    }
    this.skills.set([...this.skills(), { name, weight: 1 }]);
    this.newSkillName = '';
  }

  removeSkill(index: number) {
    const next = [...this.skills()];
    next.splice(index, 1);
    this.skills.set(next);
  }

  saveSkills() {
    this.savingSkills.set(true);
    const dict: Record<string, number> = {};
    this.skills().forEach(s => dict[s.name] = s.weight);

    this.http.put<any>(`${this.apiUrl}/profile/update_skills/`, { skills: dict }).subscribe({
      next: () => { this.savingSkills.set(false); this.showToast('Compétences enregistrées'); },
      error: (err) => { this.savingSkills.set(false); this.showToast(AuthService.extractErrorMessage(err), true); }
    });
  }

  addToList(listSignal: any, fieldName: 'newRole' | 'newLocation') {
    const value = (this as any)[fieldName].trim();
    if (!value) return;
    const current = listSignal();
    if (!current.includes(value)) listSignal.set([...current, value]);
    (this as any)[fieldName] = '';
  }

  removeFromList(listSignal: any, index: number) {
    const next = [...listSignal()];
    next.splice(index, 1);
    listSignal.set(next);
  }

  addSuggestedRole(poste: string) {
    if (!this.targetRoles().includes(poste)) {
      this.targetRoles.set([...this.targetRoles(), poste]);
    }
  }

  loadRoleSuggestions() {
    this.loadingSuggestions.set(true);
    this.suggestionsNotConfigured.set(false);
    this.http.get<any>(`${this.apiUrl}/linkedin/role_suggestions/`).subscribe({
      next: (res) => {
        this.loadingSuggestions.set(false);
        this.roleSuggestions.set(res.suggestions || []);
      },
      error: (err) => {
        this.loadingSuggestions.set(false);
        if (err.status === 501) this.suggestionsNotConfigured.set(true);
      }
    });
  }

  savePreferences() {
    this.savingPrefs.set(true);
    const body = {
      target_roles: this.targetRoles(),
      target_locations: this.targetLocations(),
      years_experience: this.yearsExperience ?? 0,
      target_salary_min: this.targetSalaryMin,
      target_salary_max: this.targetSalaryMax,
      contract_type: this.contractType,
      remote_preference: this.remotePreference,
      current_role: this.currentRole,
      current_company: this.currentCompany,
      bio: this.bio,
    };
    this.http.put<any>(`${this.apiUrl}/profile/update_preferences/`, body).subscribe({
      next: () => { this.savingPrefs.set(false); this.showToast('Profil enregistré'); },
      error: (err) => { this.savingPrefs.set(false); this.showToast(AuthService.extractErrorMessage(err), true); }
    });
  }

  reupload(event: Event, type: 'linkedin' | 'cv') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.reuploading.set(true);
    const formData = new FormData();
    formData.append(type === 'linkedin' ? 'linkedin_pdf' : 'cv_pdf', file);
    this.targetRoles().forEach(r => formData.append('target_roles', r));
    this.targetLocations().forEach(l => formData.append('target_locations', l));
    formData.append('years_experience', String(this.yearsExperience ?? 0));

    this.http.post<any>(`${this.apiUrl}/profile/import_profile/`, formData).subscribe({
      next: () => {
        this.reuploading.set(false);
        this.showToast('Document analysé et profil mis à jour');
        this.loadProfile();
      },
      error: (err) => {
        this.reuploading.set(false);
        this.showToast(AuthService.extractErrorMessage(err), true);
      }
    });
  }

  togglePreview(docType: 'linkedin' | 'cv') {
    if (this.activePreview() === docType) {
      this.activePreview.set(null);
      this.revokePreviewUrl();
      return;
    }

    this.loadingPreview.set(docType);
    this.revokePreviewUrl();

    this.http.get(`${this.apiUrl}/profile/document/${docType}/`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.previewBlobUrl = URL.createObjectURL(blob);
        this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.previewBlobUrl));
        this.activePreview.set(docType);
        this.loadingPreview.set(null);
      },
      error: (err) => {
        this.loadingPreview.set(null);
        this.showToast(AuthService.extractErrorMessage(err), true);
      }
    });
  }

  private revokePreviewUrl() {
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }
    this.previewUrl.set(null);
  }

  private loadStructuredProfile(data: any) {
    const structured = data && typeof data === 'object' ? data : {};
    const hasContent = !!(structured.titre || structured.resume ||
      (structured.experiences && structured.experiences.length) ||
      (structured.formations && structured.formations.length));

    this.hasStructuredProfile.set(hasContent);
    this.structuredTitre = structured.titre || '';
    this.structuredResume = structured.resume || '';
    this.structuredExperiences.set(structured.experiences || []);
    this.structuredFormations.set(structured.formations || []);
  }

  syncFromDocuments() {
    this.structuring.set(true);
    this.structureNotConfigured.set(false);
    this.http.post<any>(`${this.apiUrl}/profile/structure/`, {}).subscribe({
      next: (res) => {
        this.structuring.set(false);
        this.loadStructuredProfile(res);
        this.showToast('Profil synchronisé depuis vos documents');
      },
      error: (err) => {
        this.structuring.set(false);
        if (err.status === 501) this.structureNotConfigured.set(true);
        else this.showToast(AuthService.extractErrorMessage(err), true);
      }
    });
  }

  saveStructuredProfile() {
    const payload = {
      titre: this.structuredTitre,
      resume: this.structuredResume,
      experiences: this.structuredExperiences(),
      formations: this.structuredFormations(),
    };
    this.http.put(`${this.apiUrl}/profile/structured-profile/`, { structured_profile: payload }).subscribe({
      error: (err) => this.showToast(AuthService.extractErrorMessage(err), true)
    });
  }

  addExperience() {
    this.structuredExperiences.set([
      ...this.structuredExperiences(),
      { poste: '', entreprise: '', periode: '', description: '' }
    ]);
    this.hasStructuredProfile.set(true);
  }

  removeExperience(index: number) {
    const next = [...this.structuredExperiences()];
    next.splice(index, 1);
    this.structuredExperiences.set(next);
    this.saveStructuredProfile();
  }

  addFormation() {
    this.structuredFormations.set([
      ...this.structuredFormations(),
      { diplome: '', etablissement: '', periode: '' }
    ]);
    this.hasStructuredProfile.set(true);
  }

  removeFormation(index: number) {
    const next = [...this.structuredFormations()];
    next.splice(index, 1);
    this.structuredFormations.set(next);
    this.saveStructuredProfile();
  }
}
