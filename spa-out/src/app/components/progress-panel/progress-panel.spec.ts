import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ProgressPanel } from './progress-panel';

describe('ProgressPanel', () => {
  let component: ProgressPanel;
  let fixture: ComponentFixture<ProgressPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressPanel],
      providers: [provideAnimationsAsync()]
    }).compileComponents();

    fixture = TestBed.createComponent(ProgressPanel);
    fixture.componentRef.setInput('progress', { stage: 'Loading...', percent: 50 });
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display progress stage', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.stage-text')?.textContent).toContain('Loading...');
  });
});
