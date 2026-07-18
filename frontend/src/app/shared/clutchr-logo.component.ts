import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  @Input() animated = true;
  @Input() onDark = false;
}
