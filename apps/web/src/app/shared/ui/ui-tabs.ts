import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';

@Component({
  selector: 'ui-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: { class: 'ui-tabs' },
})
export class UiTabs {
  readonly value = model<string | number>(0);
}

@Component({ selector: 'ui-tablist', standalone: true, template: `<ng-content />`, host: { class: 'ui-tablist', role: 'tablist' } })
export class UiTabList {}

@Component({
  selector: 'ui-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ui-tab', role: 'tab', tabindex: '0',
    '[class.ui-tab--active]': 'active()',
    '[attr.aria-selected]': 'active()',
    '(click)': 'tabs.value.set(value())',
    '(keydown.enter)': 'tabs.value.set(value())',
  },
  template: `<ng-content />`,
})
export class UiTab {
  protected readonly tabs = inject(UiTabs);
  readonly value = input.required<string | number>();
  active(): boolean { return this.tabs.value() === this.value(); }
}

@Component({ selector: 'ui-tabpanels', standalone: true, template: `<ng-content />`, host: { class: 'ui-tabpanels' } })
export class UiTabPanels {}

@Component({
  selector: 'ui-tabpanel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-tabpanel', role: 'tabpanel', '[hidden]': '!active()' },
  template: `@if (active()) { <ng-content /> }`,
})
export class UiTabPanel {
  private readonly tabs = inject(UiTabs);
  readonly value = input.required<string | number>();
  active(): boolean { return this.tabs.value() === this.value(); }
}
