import { Injectable, signal } from '@angular/core';

export type NotifyType = 'success' | 'info' | 'alert' | 'error';

export interface NotifyMessage {
  id: number;
  type: NotifyType;
  title: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private nextId = 1;
  messages = signal<NotifyMessage[]>([]);

  private push(type: NotifyType, title: string, message: string, durationMs = 4500) {
    const id = this.nextId++;
    this.messages.set([...this.messages(), { id, type, title, message }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  success(title: string, message = '') { this.push('success', title, message); }
  info(title: string, message = '') { this.push('info', title, message); }
  alert(title: string, message = '') { this.push('alert', title, message); }
  error(title: string, message = '') { this.push('error', title, message); }

  dismiss(id: number) {
    this.messages.set(this.messages().filter(m => m.id !== id));
  }
}
