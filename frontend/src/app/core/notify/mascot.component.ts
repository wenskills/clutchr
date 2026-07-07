import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotifyService, NotifyType } from './notify.service';
import { IconComponent } from '../../shared/icon.component';

const ACCENT: Record<NotifyType, string> = {
  success: '#0D9488',
  info: '#7C5CFF',
  alert: '#D97706',
  error: '#DC2626',
};

const ICON: Record<NotifyType, string> = {
  success: 'check-circle',
  info: 'info',
  alert: 'info',
  error: 'x-circle',
};

/**
 * Mascotte personnage fixe en bas à droite de l'écran, qui affiche les
 * messages de l'app (succès/info/alerte/erreur) en bulles au-dessus
 * de lui plutôt qu'en toasts plats.
 */
@Component({
  selector: 'app-mascot',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
  <div class="mascot-host">
    <div class="bubble-stack">
      <div class="bubble" *ngFor="let m of notify.messages()" [style.--accent]="accent(m.type)">
        <button class="bubble-close" (click)="notify.dismiss(m.id)" aria-label="Fermer">×</button>
        <div class="bubble-icon"><app-icon [name]="icon(m.type)" [size]="14" color="white"></app-icon></div>
        <div class="bubble-text">
          <strong>{{ m.title }}</strong>
          <span *ngIf="m.message">{{ m.message }}</span>
        </div>
        <div class="bubble-tail"></div>
      </div>
    </div>

    <div class="mascot" [class.bouncing]="notify.messages().length > 0">
      <div class="mascot-motion" [style.--accent]="notify.messages().length ? accent(notify.messages()[notify.messages().length - 1].type) : '#7C5CFF'">
        <span></span><span></span><span></span>
      </div>
      <div class="mascot-body">
        <div class="mascot-eye left"></div>
        <div class="mascot-eye right"></div>
      </div>
      <div class="mascot-feet"><span></span><span></span></div>
    </div>
  </div>
  `,
  styles: [`
    .mascot-host { position: fixed; bottom: 22px; right: 22px; z-index: 200; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; pointer-events: none; }

    .bubble-stack { display: flex; flex-direction: column-reverse; gap: 8px; align-items: flex-end; }

    .bubble {
      pointer-events: auto;
      position: relative;
      display: flex; align-items: flex-start; gap: 9px;
      background: white; border-radius: 16px; padding: 12px 16px 12px 12px;
      box-shadow: 0 12px 28px rgba(15,23,42,0.16);
      min-width: 180px; max-width: 270px;
      animation: bubble-in 280ms cubic-bezier(.2,.8,.2,1) both;
      border: 1.5px solid color-mix(in srgb, var(--accent) 20%, white);
    }
    @keyframes bubble-in {
      from { opacity: 0; transform: translateY(10px) scale(.96); }
      to { opacity: 1; transform: none; }
    }
    .bubble-icon {
      width: 24px; height: 24px; border-radius: 50%; background: var(--accent); flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; margin-top: 1px;
    }
    .bubble-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .bubble-text strong { font-size: 12.5px; font-weight: 700; color: #0F172A; }
    .bubble-text span { font-size: 12px; color: #64748B; line-height: 1.4; }
    .bubble-close {
      position: absolute; top: 6px; right: 8px; font-size: 13px; color: #CBD5E1; line-height: 1;
      width: 16px; height: 16px;
    }
    .bubble-close:hover { color: #94A3B8; }
    .bubble-tail {
      position: absolute; bottom: -8px; right: 19px; width: 16px; height: 16px;
      background: white; transform: rotate(45deg);
      border-right: 1.5px solid color-mix(in srgb, var(--accent) 20%, white);
      border-bottom: 1.5px solid color-mix(in srgb, var(--accent) 20%, white);
    }

    .mascot { position: relative; width: 54px; height: 60px; pointer-events: auto; cursor: default; }
    .mascot.bouncing { animation: mascot-bounce 600ms ease; }
    .mascot .mascot-body { animation: mascot-idle 3.2s ease-in-out infinite; }
    @keyframes mascot-idle {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-4px) rotate(-2deg); }
    }
    @keyframes mascot-bounce {
      0%, 100% { transform: scale(1); }
      35% { transform: scale(1.12); }
      60% { transform: scale(0.97); }
    }

    .mascot-eye { animation: mascot-blink 4.5s ease-in-out infinite; }
    .mascot-eye.right { animation-delay: 0.05s; }
    @keyframes mascot-blink {
      0%, 92%, 100% { transform: scaleY(1); }
      95% { transform: scaleY(0.15); }
    }
    @media (prefers-reduced-motion: reduce) {
      .mascot, .mascot .mascot-body, .mascot-eye { animation: none; }
    }

    .mascot-body {
      width: 54px; height: 54px; border-radius: 50%;
      background: radial-gradient(circle at 32% 28%, #ffffff 0%, #F3F0FF 55%, #E4DCFF 100%);
      box-shadow: 0 10px 22px rgba(85,52,180,.28), inset 0 -4px 8px rgba(124,92,255,0.12);
      position: relative;
    }
    .mascot-eye {
      position: absolute; top: 23px; width: 6px; height: 9px; border-radius: 50%; background: #1E1B3A;
    }
    .mascot-eye.left { left: 18px; }
    .mascot-eye.right { right: 18px; }

    .mascot-feet { display: flex; justify-content: center; gap: 10px; margin-top: -3px; }
    .mascot-feet span { width: 9px; height: 9px; border-radius: 50%; background: #1E1B3A; display: block; }

    .mascot-motion {
      position: absolute; top: -4px; right: -2px; width: 20px; height: 20px;
    }
    .mascot-motion span {
      position: absolute; border-radius: 999px; background: var(--accent); opacity: .85;
    }
    .mascot-motion span:nth-child(1) { width: 4px; height: 4px; top: 0; right: 6px; }
    .mascot-motion span:nth-child(2) { width: 9px; height: 2.5px; top: 7px; right: 0; transform: rotate(-25deg); }
    .mascot-motion span:nth-child(3) { width: 13px; height: 2.5px; top: 13px; right: -2px; transform: rotate(-20deg); opacity: .5; }

    @media (max-width: 640px) {
      .mascot-host { bottom: 14px; right: 14px; }
      .bubble { max-width: 220px; }
    }
  `]
})
export class MascotComponent {
  constructor(public notify: NotifyService) {}

  accent(type: NotifyType): string { return ACCENT[type]; }
  icon(type: NotifyType): string { return ICON[type]; }
}
