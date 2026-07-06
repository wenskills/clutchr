import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Icônes "façon Lucide" dessinées à la main (lignes fines, coins ronds,
 * viewBox 24x24, stroke-width 2) — pas de dépendance npm.
 *
 * Pourquoi : @lucide/angular nécessite Angular 17+ (notre projet est en
 * 16.2) et l'ancien lucide-angular vient d'être retiré par les
 * mainteneurs. Plutôt que de risquer un build cassé, on reproduit le
 * même langage visuel à la main pour le sous-ensemble d'icônes dont on
 * a besoin. Facile à étendre : ajouter une entrée dans `PATHS`.
 *
 * Le contenu injecté via [innerHTML] est 100% statique et écrit par
 * nous (jamais de donnée utilisateur) — on utilise bypassSecurityTrustHtml
 * uniquement pour garantir un rendu fiable des balises SVG, peu importe
 * la liste blanche du sanitizer Angular par défaut.
 *
 * Usage: <app-icon name="home" [size]="20"></app-icon>
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      [attr.stroke]="color"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      [innerHTML]="safePath"
    ></svg>
  `,
  styles: [`
    :host { display: inline-flex; line-height: 0; }
    svg { display: block; flex-shrink: 0; }
  `]
})
export class IconComponent {
  @Input() name = 'circle';
  @Input() size = 20;
  @Input() color = 'currentColor';

  constructor(private sanitizer: DomSanitizer) {}

  private static PATHS: Record<string, string> = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
    'trending-up': '<path d="M3 17l6-6 4 4 8-8"/><path d="M16 6h5v5"/>',
    'pen-square': '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 15l1.5-4.5L15 6l3 3-4.5 4.5L9 15z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.3 2.9-5 6.5-5s6.5 1.7 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.5.3 4 1.7 4 4.3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 0 0 .3-1.9l-1-1.7a1.7 1.7 0 0 0-1.7-.8l-2 .3a7 7 0 0 0-1.4-.8l-.6-2a1.7 1.7 0 0 0-1.7-1.3h-2a1.7 1.7 0 0 0-1.7 1.3l-.6 2a7 7 0 0 0-1.4.8l-2-.3a1.7 1.7 0 0 0-1.7.8l-1 1.7a1.7 1.7 0 0 0 .3 1.9l1.2 1.5a7 7 0 0 0 0 1.6l-1.2 1.5a1.7 1.7 0 0 0-.3 1.9l1 1.7a1.7 1.7 0 0 0 1.7.8l2-.3a7 7 0 0 0 1.4.8l.6 2a1.7 1.7 0 0 0 1.7 1.3h2a1.7 1.7 0 0 0 1.7-1.3l.6-2a7 7 0 0 0 1.4-.8l2 .3a1.7 1.7 0 0 0 1.7-.8l1-1.7a1.7 1.7 0 0 0-.3-1.9l-1.2-1.5a7 7 0 0 0 0-1.6z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    'more-horizontal': '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    bookmark: '<path d="M6 4h12v16l-6-4-6 4z"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.2 2.2L16 9.5"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5l5 5"/><path d="M14.5 9.5l-5 5"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 19h14"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    link: '<path d="M9 15l6-6"/><path d="M10 7l1-1a4 4 0 1 1 6 6l-1 1"/><path d="M14 17l-1 1a4 4 0 1 1-6-6l1-1"/>',
    'file-text': '<path d="M6 3h9l3 3v15H6z"/><path d="M9 12h6"/><path d="M9 16h6"/><path d="M9 8h3"/>',
    sparkles: '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    heart: '<path d="M12 20s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 5c-2.5 4.5-9.5 9-9.5 9z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5z"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.6-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.2l6.1-.6z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 4v4h-4"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 20v-4h4"/>',
    'map-pin': '<path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6 0 10 7 10 7a16.6 16.6 0 0 1-3.2 3.9M6.5 6.6A16.4 16.4 0 0 0 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    activity: '<path d="M22 12h-4l-3 8-6-16-3 8H2"/>',
  };

  get path(): string {
    return IconComponent.PATHS[this.name] || IconComponent.PATHS['circle'] || '<circle cx="12" cy="12" r="9"/>';
  }

  get safePath(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.path);
  }
}
