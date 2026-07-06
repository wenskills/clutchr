import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MascotComponent } from './core/notify/mascot.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MascotComponent],
  template: `
    <router-outlet></router-outlet>
    <app-mascot></app-mascot>
  `
})
export class AppComponent {}
