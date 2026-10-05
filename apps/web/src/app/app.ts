import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiToast } from './shared/ui';

@Component({
  imports: [RouterOutlet, UiToast],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <ui-toast position="top-right" />
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
    }
  `],
})
export class App {}
