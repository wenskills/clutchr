import { Component, Input, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../core/auth/auth.service';
import { ClutchrLogoComponent } from './clutchr-logo.component';
import { IconComponent } from './icon.component';

interface NavItem {
  label: string;
  icon: string;
  route?: string;
  soon?: boolean;
}

interface NotificationVM {
  id: number;
  title: string;
  message: string;
  route: string;
  is_read: boolean;
  created_at: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, ClutchrLogoComponent, IconComponent],
  template: `
  <aside class="sidebar" [class.expanded]="expanded()"
         (mouseenter)="expanded.set(true)" (mouseleave)="expanded.set(false)">
    <div class="sidebar-top">
      <app-clutchr-logo [size]="34" [withWordmark]="expanded()" [onDark]="true"></app-clutchr-logo>
    </div>

    <div class="bell-zone">
      <button class="bell-btn" (click)="toggleNotifications()" title="Notifications">
        <app-icon name="bell" [size]="18"></app-icon>
        <span class="bell-badge" *ngIf="unreadCount() > 0">{{ unreadCount() > 9 ? '9+' : unreadCount() }}</span>
      </button>
      <span class="nav-label bell-label" *ngIf="expanded()">Notifications</span>
    </div>

    <nav>
      <a *ngFor="let item of liveItems"
         [routerLink]="item.route"
         class="nav-item"
         [class.active]="active === item.route"
         [title]="item.label">
        <app-icon [name]="item.icon" [size]="19"></app-icon>
        <span class="nav-label" *ngIf="expanded()">{{ item.label }}</span>
      </a>

      <div class="nav-divider"></div>

      <div *ngFor="let item of soonItems" class="nav-item soon" [title]="'Disponible prochainement'">
        <app-icon [name]="item.icon" [size]="19"></app-icon>
        <span class="nav-label" *ngIf="expanded()">{{ item.label }}</span>
        <span class="soon-badge" *ngIf="expanded()">Bientôt</span>
      </div>
    </nav>

    <div class="sidebar-bottom">
      <div class="user-chip">
        <div class="avatar">{{ initials() }}</div>
        <div class="user-info" *ngIf="expanded()">
          <div class="user-name">{{ displayName() }}</div>
          <div class="user-email">{{ email() }}</div>
        </div>
      </div>
      <button class="logout-btn" *ngIf="expanded()" (click)="logout()" title="Se déconnecter">
        <app-icon name="log-out" [size]="16"></app-icon>
      </button>
    </div>
  </aside>

  <div class="notif-overlay" *ngIf="notificationsOpen()" (click)="notificationsOpen.set(false)"></div>
  <div class="notif-panel" *ngIf="notificationsOpen()">
    <div class="notif-head">
      <h3>Notifications</h3>
      <button class="mark-all-btn" *ngIf="unreadCount() > 0" (click)="markAllRead()">Tout marquer comme lu</button>
    </div>
    <div class="notif-list" *ngIf="notifications().length; else noNotif">
      <a class="notif-item" *ngFor="let n of notifications()" [class.unread]="!n.is_read"
         [routerLink]="n.route" (click)="openNotification(n)">
        <div class="notif-title">{{ n.title }}</div>
        <div class="notif-message" *ngIf="n.message">{{ n.message }}</div>
        <div class="notif-time">{{ relativeTime(n.created_at) }}</div>
      </a>
    </div>
    <ng-template #noNotif>
      <p class="notif-empty">Aucune notification pour l'instant.</p>
    </ng-template>
  </div>
  `,
  styles: [`
    .sidebar {
      width: 72px;
      background:
        radial-gradient(circle at 30% 0%, rgba(248,87,193,0.30), transparent 55%),
        radial-gradient(circle at 80% 30%, rgba(124,92,255,0.35), transparent 55%),
        radial-gradient(circle at 30% 85%, rgba(34,211,238,0.18), transparent 50%),
        linear-gradient(165deg, #0F0B1D 0%, #1A1030 55%, #150D26 100%);
      background-size: 220% 220%;
      animation: sidebar-drift 16s ease-in-out infinite alternate;
      color: rgba(255,255,255,0.92);
      display: flex;
      flex-direction: column;
      padding: 20px 0;
      flex-shrink: 0;
      height: 100vh;
      position: sticky;
      top: 0;
      overflow: hidden;
      transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 40;
    }
    @keyframes sidebar-drift {
      0% { background-position: 0% 0%; }
      100% { background-position: 100% 100%; }
    }
    @media (prefers-reduced-motion: reduce) { .sidebar { animation: none; } }
    .sidebar.expanded { width: 232px; }

    .sidebar-top { padding: 0 24px 16px; white-space: nowrap; }

    .bell-zone { display:flex; align-items:center; gap:14px; padding: 0 24px 20px; white-space:nowrap; }
    .bell-btn {
      position: relative; width:34px; height:34px; border-radius:10px; flex-shrink:0;
      background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.75);
      display:flex; align-items:center; justify-content:center;
    }
    .bell-btn:hover { background: rgba(255,255,255,0.1); color: white; }
    .bell-badge {
      position:absolute; top:-4px; right:-4px; background:#F857C1; color:white; font-size:9.5px; font-weight:700;
      min-width:16px; height:16px; border-radius:999px; display:flex; align-items:center; justify-content:center; padding:0 3px;
    }
    .bell-label { font-size: 13.5px; font-weight: 500; color: rgba(255,255,255,0.62); }

    nav { display: flex; flex-direction: column; gap: 2px; flex: 1; padding: 0 12px; }

    .nav-item {
      display: flex; align-items: center; gap: 14px;
      padding: 11px 12px; border-radius: 12px;
      color: rgba(255,255,255,0.62); text-decoration: none;
      cursor: pointer; transition: background 150ms, color 150ms;
      white-space: nowrap; overflow: hidden;
    }
    .nav-item:hover:not(.soon) { background: rgba(255,255,255,0.06); color: white; }
    .nav-item.active {
      background: rgba(124, 92, 255, 0.16);
      color: #B7A6FF;
    }
    .nav-label { font-size: 13.5px; font-weight: 500; }

    .nav-item.soon { cursor: default; color: rgba(255,255,255,0.28); justify-content: space-between; }
    .soon-badge {
      font-size: 9.5px; background: rgba(255,255,255,0.07);
      padding: 2px 7px; border-radius: 999px; color: rgba(255,255,255,0.38);
      flex-shrink: 0;
    }

    .nav-divider { height: 1px; background: rgba(255,255,255,0.07); margin: 10px 12px; }

    .sidebar-bottom {
      display: flex; align-items: center; gap: 10px;
      padding: 16px 16px 0; border-top: 1px solid rgba(255,255,255,0.07);
      margin-top: 12px;
    }
    .user-chip { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; overflow: hidden; }
    .avatar {
      width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, #7C5CFF, #F857C1);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600; color: white;
    }
    .user-info { min-width: 0; white-space: nowrap; }
    .user-name { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
    .user-email { font-size: 11px; color: rgba(255,255,255,0.4); overflow: hidden; text-overflow: ellipsis; }

    .logout-btn {
      background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.55);
      width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 150ms, color 150ms;
    }
    .logout-btn:hover { background: rgba(239,68,68,0.18); color: #fca5a5; }

    .notif-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.2); z-index:60; }
    .notif-panel {
      position:fixed; top:16px; left:84px; width:340px; max-height:70vh; background:white; border-radius:16px;
      box-shadow:0 12px 40px rgba(15,23,42,0.18); z-index:61; overflow:hidden; display:flex; flex-direction:column;
    }
    .notif-head { display:flex; justify-content:space-between; align-items:center; padding:16px 18px; border-bottom:1px solid #F1F4F8; }
    .notif-head h3 { font-size:14px; font-weight:600; margin:0; color:#0F172A; }
    .mark-all-btn { font-size:11px; font-weight:600; color:#7C5CFF; }
    .notif-list { overflow-y:auto; }
    .notif-item { display:block; padding:14px 18px; text-decoration:none; border-bottom:1px solid #F8FAFC; }
    .notif-item:hover { background:#F8FAFC; }
    .notif-item.unread { background:#F8F7FF; }
    .notif-item.unread .notif-title::before {
      content:''; display:inline-block; width:6px; height:6px; border-radius:50%; background:#7C5CFF; margin-right:7px;
    }
    .notif-title { font-size:13px; font-weight:600; color:#0F172A; }
    .notif-message { font-size:12px; color:#64748B; margin-top:3px; }
    .notif-time { font-size:11px; color:#CBD5E1; margin-top:5px; }
    .notif-empty { padding:24px 18px; font-size:13px; color:#94A3B8; text-align:center; }

    @media (max-width: 900px) { .sidebar { display: none; } }
  `]
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() active = '';
  expanded = signal(false);

  liveItems: NavItem[] = [
    { label: 'Tableau de bord', icon: 'home', route: '/tableau-de-bord' },
    { label: 'Profil', icon: 'user', route: '/profil' },
    { label: 'Offres & Matching', icon: 'briefcase', route: '/offres' },
    { label: 'Suivi de candidatures', icon: 'layers', route: '/suivi' },
    { label: "Analyse d'écart", icon: 'target', route: '/analyse-ecart' },
    { label: "Feuille de route", icon: 'calendar', route: '/feuille-de-route' },
    { label: 'Réseau & Contacts', icon: 'users', route: '/contacts' },
    { label: 'Contenu LinkedIn', icon: 'pen-square', route: '/contenu-linkedin' },
    { label: 'Veille & Tendances', icon: 'trending-up', route: '/veille' },
    { label: 'Paramètres', icon: 'settings', route: '/parametres' },
  ];

  soonItems: NavItem[] = [];

  private apiUrl = 'http://localhost:8000/api/v1';
  notificationsOpen = signal(false);
  notifications = signal<NotificationVM[]>([]);
  unreadCount = signal(0);
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  constructor(private auth: AuthService, private router: Router, private http: HttpClient) {}

  ngOnInit() {
    this.loadUnreadCount();
    this.pollHandle = setInterval(() => this.loadUnreadCount(), 60000);
  }

  ngOnDestroy() {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
    }
  }

  private loadUnreadCount() {
    this.http.get<any>(`${this.apiUrl}/notifications/unread_count/`).subscribe({
      next: (res) => this.unreadCount.set(res.unread_count || 0),
      error: () => {}
    });
  }

  toggleNotifications() {
    this.notificationsOpen.set(!this.notificationsOpen());
    if (this.notificationsOpen()) {
      this.http.get<any>(`${this.apiUrl}/notifications/`).subscribe({
        next: (data: any) => this.notifications.set(Array.isArray(data) ? data : (data?.results || [])),
        error: () => {}
      });
    }
  }

  openNotification(n: NotificationVM) {
    this.notificationsOpen.set(false);
    if (!n.is_read) {
      this.http.post(`${this.apiUrl}/notifications/${n.id}/mark-read/`, {}).subscribe({
        next: () => this.loadUnreadCount()
      });
    }
  }

  markAllRead() {
    this.http.post(`${this.apiUrl}/notifications/mark-all-read/`, {}).subscribe({
      next: () => {
        this.notifications.set(this.notifications().map(n => ({ ...n, is_read: true })));
        this.unreadCount.set(0);
      }
    });
  }

  relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diffMs / 3600000);
    if (hours < 1) return "à l'instant";
    if (hours < 24) return `il y a ${hours} h`;
    return `il y a ${Math.floor(hours / 24)} j`;
  }

  displayName(): string {
    const u = this.auth.getCurrentUser();
    return u?.first_name || u?.username || 'Utilisateur';
  }

  email(): string {
    return this.auth.getCurrentUser()?.email || '';
  }

  initials(): string {
    return this.displayName().slice(0, 2).toUpperCase();
  }

  logout() {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/connexion']),
      error: () => this.router.navigate(['/connexion'])
    });
  }
}
