import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Logo officiel Clutchr
 * Usage :
 *   <app-clutchr-logo [size]="32" [withWordmark]="true"></app-clutchr-logo>
 */
@Component({
  selector: 'app-clutchr-logo',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="clutchr-logo" [class.with-word]="withWordmark">
    <img
      src="assets/brand/clutchr-icon.png"
      alt="Clutchr"
      [style.width.px]="size"
      [style.height.px]="size"
      [class.is-animated]="animated"
      class="clutchr-mark"
    >
    <span class="clutchr-word" *ngIf="withWordmark" [class.on-dark]="onDark">clutchr</span>
  </div>
  `,
  styles: [`
    .clutchr-logo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .clutchr-mark {
      display: block;
      flex-shrink: 0;
      object-fit: contain;
    }
    .clutchr-mark.is-animated {
      animation: clutchr-rotate 12s linear infinite;
    }
    @keyframes clutchr-rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .clutchr-mark.is-animated { animation: none; }
    }

    .clutchr-word {
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      letter-spacing: -0.01em;
      white-space: nowrap;
      font-size: 1.2em;
      color: #1A0B2E;
    }
    /* Sur fond sombre (sidebar, landing, auth), le mot est recréé en
       dégradé clair assorti au logo plutôt que de réutiliser l'encre
       sombre de l'image source, qui y serait illisible. */
    .clutchr-word.on-dark {
      background: linear-gradient(90deg, #B07CFF, #F857C1);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
  `]
})
export class ClutchrLogoComponent {
  @Input() size = 32;
  @Input() withWordmark = false;
  /** Toujours animé par défaut — la marque "vit". Désactivable au cas par cas seulement. */
  @Input() animated = true;
  /** Passer à true sur fond sombre (sidebar, landing, auth) pour que le mot reste lisible. */
  @Input() onDark = false;
}
