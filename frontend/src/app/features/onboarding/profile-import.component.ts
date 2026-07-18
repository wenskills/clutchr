import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ClutchrLogoComponent } from '../../shared/clutchr-logo.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-profile-import',
  standalone: true,
  imports: [CommonModule, FormsModule, ClutchrLogoComponent, IconComponent],
  template: `
  <div class="onboarding-page">
    <div class="bg-glow"></div>

    <div class="topbar">
      <app-clutchr-logo [size]="26" [withWordmark]="true"></app-clutchr-logo>
      <div class="steps">
        <span class="step" [class.active]="step() === 1" [class.done]="step() > 1">1. Import</span>
        <span class="sep">→</span>
        <span class="step" [class.active]="step() === 2">2. Préférences</span>
      </div>
    </div>

    <div class="content">
      <div class="card" *ngIf="step() === 1" [class.is-analyzing]="analyzing()">
        <h1>Importez votre profil</h1>
        <p class="muted">Déposez votre export LinkedIn et/ou votre CV : on analyse vos compétences automatiquement.</p>

        <div class="upload-zone"
             [class.has-file]="linkedinFile()"
             [class.drag-over]="dragOver() === 'linkedin'"
             (dragover)="onDragOver($event, 'linkedin')"
             (dragleave)="onDragLeave()"
             (drop)="onDrop($event, 'linkedin')">
          <input type="file" accept="application/pdf" (change)="onFileSelect($event, 'linkedin')" id="linkedinUpload" hidden>
          <label for="linkedinUpload">
            <div class="upload-icon" [class.bounce]="linkedinFile()">
              <app-icon [name]="linkedinFile() ? 'check-circle' : 'file-text'" [size]="26" [color]="linkedinFile() ? '#22C55E' : '#7C5CFF'"></app-icon>
            </div>
            <div class="upload-title">{{ linkedinFile()?.name || 'Export PDF LinkedIn' }}</div>
            <div class="upload-hint">{{ linkedinFile() ? 'Cliquez pour changer' : 'Glissez-déposez ou cliquez · PDF, 10 Mo max' }}</div>
          </label>
        </div>

        <div class="upload-zone"
             [class.has-file]="cvFile()"
             [class.drag-over]="dragOver() === 'cv'"
             (dragover)="onDragOver($event, 'cv')"
             (dragleave)="onDragLeave()"
             (drop)="onDrop($event, 'cv')">
          <input type="file" accept="application/pdf" (change)="onFileSelect($event, 'cv')" id="cvUpload" hidden>
          <label for="cvUpload">
            <div class="upload-icon" [class.bounce]="cvFile()">
              <app-icon [name]="cvFile() ? 'check-circle' : 'file-text'" [size]="26" [color]="cvFile() ? '#22C55E' : '#F857C1'"></app-icon>
            </div>
            <div class="upload-title">{{ cvFile()?.name || 'CV / Resume (PDF)' }}</div>
            <div class="upload-hint">{{ cvFile() ? 'Cliquez pour changer' : 'Glissez-déposez ou cliquez · PDF, 10 Mo max' }}</div>
          </label>
        </div>

        <button class="btn-next" (click)="step.set(2)" [disabled]="!linkedinFile() && !cvFile()">
          Continuer
        </button>
        <button class="btn-skip" (click)="step.set(2)">Passer cette étape</button>
      </div>

      <div class="card" *ngIf="step() === 2">
        <ng-container *ngIf="!analyzing() && !done()">
          <h1>Vos objectifs</h1>
          <p class="muted">Ces informations servent à filtrer vos futures correspondances d'offres.</p>

          <div class="alert-error" *ngIf="errorMessage()">{{ errorMessage() }}</div>

          <div class="form-group">
            <label>Postes ciblés (séparés par des virgules)</label>
            <input type="text" [(ngModel)]="targetRolesInput" placeholder="Développeur Full-Stack, Backend Engineer">
          </div>

          <div class="form-group">
            <label>Lieux ciblés (séparés par des virgules)</label>
            <input type="text" [(ngModel)]="targetLocationsInput" placeholder="Marseille, Télétravail">
          </div>

          <div class="form-group">
            <label>Années d'expérience</label>
            <input type="number" [(ngModel)]="yearsExperience" min="0" placeholder="3">
          </div>

          <button class="btn-next" (click)="submit()">Terminer la configuration</button>
          <button class="btn-skip" (click)="step.set(1)">Retour</button>
        </ng-container>

        <div class="analyzing-state" *ngIf="analyzing()">
          <div class="pulse-rings">
            <div class="ring"></div><div class="ring"></div><div class="ring"></div>
            <div class="pulse-core"><app-icon name="activity" [size]="26" color="#7C5CFF"></app-icon></div>
          </div>
          <h2>Analyse de votre profil…</h2>
          <ul class="analyzing-steps">
            <li [class.active]="analyzeStep() >= 1" [class.done]="analyzeStep() > 1">Lecture des documents PDF</li>
            <li [class.active]="analyzeStep() >= 2" [class.done]="analyzeStep() > 2">Extraction des compétences</li>
            <li [class.active]="analyzeStep() >= 3" [class.done]="analyzeStep() > 3">Création de votre profil</li>
          </ul>
        </div>

        <div class="done-state" *ngIf="done()">
          <div class="check-circle"><app-icon name="check-circle" [size]="30" color="white"></app-icon></div>
          <h2>Profil prêt</h2>
          <p class="muted" *ngIf="!searchingOffers()">{{ skillsExtractedCount() }} compétence(s) détectée(s).</p>
          <p class="muted" *ngIf="searchingOffers()">{{ skillsExtractedCount() }} compétence(s) détectée(s). Recherche de vos premières offres…</p>
        </div>
      </div>
    </div>
  </div>
  `,
  styles: [`
    :host { display:block; }
    .onboarding-page {
      position: relative; min-height: 100vh; background: #f7f7fa; overflow: hidden;
      font-family: 'Inter', sans-serif;
    }
    .bg-glow {
      position: absolute; top: -200px; right: -200px; width: 480px; height: 480px;
      background: radial-gradient(circle, rgba(124,58,237,0.18), transparent 70%);
      border-radius: 50%; pointer-events: none;
    }

    .topbar {
      position: relative; z-index: 1;
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 32px; background: white; border-bottom: 1px solid #eee;
    }
    .steps { font-size: 13px; color: #aaa; display: flex; gap: 8px; align-items: center; }
    .step.active { color: #7C5CFF; font-weight: 600; }
    .step.done { color: #14B8A6; }
    .sep { color: #ddd; }

    .content { position: relative; z-index: 1; display: flex; justify-content: center; padding: 56px 20px; }

    .card {
      width: 100%; max-width: 480px; background: white; border-radius: 22px;
      padding: 44px 40px; box-shadow: 0 12px 40px rgba(20,10,40,0.08);
      transition: box-shadow .3s;
    }

    h1 { font-size: 28px; margin-bottom: 6px; }
    .muted { color: #888; font-size: 14px; margin-bottom: 28px; }

    .upload-zone {
      border: 2px dashed #e0d4fb; border-radius: 16px; margin-bottom: 16px;
      transition: border-color .2s, background .2s, transform .15s;
    }
    .upload-zone:hover { border-color: #7C5CFF; background: #faf8ff; }
    .upload-zone.drag-over { border-color: #F857C1; background: #fff0f7; transform: scale(1.02); }
    .upload-zone.has-file { border-color: #2DD4BF; background: #f0fdf4; border-style: solid; }
    .upload-zone label { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 26px; cursor: pointer; text-align: center; }
    .upload-icon { display:flex; align-items:center; justify-content:center; margin-bottom: 8px; transition: transform .3s; }
    .upload-icon.bounce { animation: bounce-in .45s; }
    @keyframes bounce-in { 0%{transform:scale(.5);} 60%{transform:scale(1.25);} 100%{transform:scale(1);} }
    .upload-title { font-weight: 600; font-size: 14px; color: #333; word-break: break-all; }
    .upload-hint { font-size: 12px; color: #999; margin-top: 4px; }

    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #333; }
    .form-group input { width: 100%; padding: 12px 15px; border: 1.5px solid #e5e5e5; border-radius: 11px; font-size: 14px; }
    .form-group input:focus { outline: none; border-color: #7C5CFF; box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }

    .btn-next {
      width: 100%; padding: 14px; border: none; border-radius: 11px; margin-top: 10px;
      background: linear-gradient(90deg, #2DD4BF, #14B8A6); color: white; font-weight: 600;
      font-size: 14.5px; cursor: pointer; transition: transform .15s, box-shadow .15s;
    }
    .btn-next:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-next:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(34,197,94,0.3); }

    .btn-skip { width: 100%; padding: 10px; border: none; background: transparent; color: #999; font-size: 13px; margin-top: 10px; cursor: pointer; }
    .btn-skip:hover { color: #7C5CFF; }

    .alert-error { background: #fef2f2; color: #dc2626; padding: 10px 14px; border-radius: 9px; font-size: 13px; margin-bottom: 16px; }

    .analyzing-state, .done-state { text-align: center; padding: 12px 0; }
    .pulse-rings { position: relative; width: 110px; height: 110px; margin: 0 auto 24px; }
    .ring {
      position: absolute; inset: 0; border-radius: 50%; border: 2px solid #a78bfa;
      animation: ring-pulse 2.2s ease-out infinite;
    }
    .ring:nth-child(2) { animation-delay: .5s; border-color: #f472b6; }
    .ring:nth-child(3) { animation-delay: 1s; border-color: #60a5fa; }
    @keyframes ring-pulse { 0% { transform: scale(.4); opacity: 1; } 100% { transform: scale(1.3); opacity: 0; } }
    .pulse-core {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-size: 30px;
    }
    .analyzing-state h2 { font-size: 20px; margin-bottom: 18px; }
    .analyzing-steps { list-style: none; padding: 0; text-align: left; max-width: 280px; margin: 0 auto; }
    .analyzing-steps li {
      padding: 9px 0 9px 28px; position: relative; font-size: 14px; color: #bbb; transition: color .3s;
    }
    .analyzing-steps li::before {
      content: ''; position: absolute; left: 0; top: 13px; width: 16px; height: 16px;
      border-radius: 50%; border: 2px solid #ddd;
    }
    .analyzing-steps li.active { color: #333; font-weight: 600; }
    .analyzing-steps li.active::before { border-color: #7C5CFF; }
    .analyzing-steps li.done { color: #14B8A6; }
    .analyzing-steps li.done::before { border-color: #14B8A6; background: #14B8A6; }

    .check-circle {
      width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg,#2DD4BF,#14B8A6);
      color: white; font-size: 30px; display: flex; align-items: center; justify-content: center;
      margin: 0 auto 18px; animation: pop-in .4s cubic-bezier(.2,1.4,.4,1);
    }
    @keyframes pop-in { from { transform: scale(0); } to { transform: scale(1); } }
    .done-state h2 { font-size: 22px; margin-bottom: 8px; }

    @media (max-width: 600px) {
      .card { padding: 32px 24px; }
      .topbar { padding: 16px 20px; }
    }
  `]
})
export class ProfileImportComponent {
  step = signal(1);
  linkedinFile = signal<File | null>(null);
  cvFile = signal<File | null>(null);
  dragOver = signal<'linkedin' | 'cv' | null>(null);

  analyzing = signal(false);
  analyzeStep = signal(0);
  done = signal(false);
  searchingOffers = signal(false);
  skillsExtractedCount = signal(0);

  errorMessage = signal('');

  targetRolesInput = '';
  targetLocationsInput = '';
  yearsExperience: number | null = null;

  private apiUrl = 'http://localhost:8000/api/v1';

  constructor(private http: HttpClient, private router: Router, private auth: AuthService) {}

  onFileSelect(event: Event, type: 'linkedin' | 'cv') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.setFile(type, file);
  }

  onDragOver(event: DragEvent, type: 'linkedin' | 'cv') {
    event.preventDefault();
    this.dragOver.set(type);
  }

  onDragLeave() {
    this.dragOver.set(null);
  }

  onDrop(event: DragEvent, type: 'linkedin' | 'cv') {
    event.preventDefault();
    this.dragOver.set(null);
    const file = event.dataTransfer?.files?.[0] || null;
    if (file && file.type === 'application/pdf') this.setFile(type, file);
  }

  private setFile(type: 'linkedin' | 'cv', file: File | null) {
    if (type === 'linkedin') this.linkedinFile.set(file);
    else this.cvFile.set(file);
  }

  submit() {
    this.errorMessage.set('');
    this.analyzing.set(true);
    this.analyzeStep.set(1);

    const formData = new FormData();
    if (this.linkedinFile()) formData.append('linkedin_pdf', this.linkedinFile() as File);
    if (this.cvFile()) formData.append('cv_pdf', this.cvFile() as File);

    const roles = this.targetRolesInput.split(',').map(r => r.trim()).filter(Boolean);
    const locations = this.targetLocationsInput.split(',').map(l => l.trim()).filter(Boolean);
    roles.forEach(r => formData.append('target_roles', r));
    locations.forEach(l => formData.append('target_locations', l));
    formData.append('years_experience', String(this.yearsExperience ?? 0));
    const tick2 = setTimeout(() => this.analyzeStep.set(2), 600);
    const tick3 = setTimeout(() => this.analyzeStep.set(3), 1300);

    this.http.post<any>(`${this.apiUrl}/profile/import_profile/`, formData).subscribe({
      next: (res) => {
        clearTimeout(tick2); clearTimeout(tick3);
        this.analyzeStep.set(3);
        this.skillsExtractedCount.set(res?.skills_extracted ?? 0);
        setTimeout(() => {
          this.analyzing.set(false);
          this.done.set(true);
          this.searchingOffers.set(true);
          this.http.post(`${this.apiUrl}/matches/scrape/`, {}).subscribe({
            next: () => this.router.navigate(['/offres'], { queryParams: { vue: 'swipe' } }),
            error: () => this.router.navigate(['/offres'], { queryParams: { vue: 'swipe' } }),
          });
        }, 500);
      },
      error: (err) => {
        clearTimeout(tick2); clearTimeout(tick3);
        this.analyzing.set(false);
        this.errorMessage.set(AuthService.extractErrorMessage(err));
      }
    });
  }
}
