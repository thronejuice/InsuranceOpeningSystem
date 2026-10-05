import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SidebarService } from './sidebar.service';

describe('SidebarService', () => {
  let service: SidebarService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    service = TestBed.inject(SidebarService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should toggle sidebar state', () => {
    const initial = service.isHidden();
    service.toggle();
    expect(service.isHidden()).toBe(!initial);
    service.toggle();
    expect(service.isHidden()).toBe(initial);
  });

  it('should hide and show sidebar', () => {
    service.show();
    expect(service.isHidden()).toBe(false);
    service.hide();
    expect(service.isHidden()).toBe(true);
    service.show();
    expect(service.isHidden()).toBe(false);
  });

  it('should persist state to localStorage', () => {
    service.hide();
    expect(localStorage.getItem('sidebar_hidden')).toBe('true');
    service.show();
    expect(localStorage.getItem('sidebar_hidden')).toBe('false');
  });
});
