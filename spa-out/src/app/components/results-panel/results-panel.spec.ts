import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ResultsPanel, OutputFile } from './results-panel';

describe('ResultsPanel', () => {
  let component: ResultsPanel;
  let fixture: ComponentFixture<ResultsPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResultsPanel],
      providers: [provideAnimationsAsync()]
    }).compileComponents();

    fixture = TestBed.createComponent(ResultsPanel);
    fixture.componentRef.setInput('outputs', []);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit download event when downloadOutput is called', () => {
    const outputFile: OutputFile = { name: 'test.txt', content: 'hello', type: 'text' };
    const spy = spyOn(component.downloadRequested, 'emit');
    component.downloadOutput(outputFile);
    expect(spy).toHaveBeenCalledWith(outputFile);
  });

  it('should emit downloadAll event when downloadAll is called', () => {
    const spy = spyOn(component.downloadAllRequested, 'emit');
    component.downloadAll();
    expect(spy).toHaveBeenCalled();
  });

  it('should return correct icon for file type', () => {
    expect(component.getIcon('image')).toBe('image');
    expect(component.getIcon('json')).toBe('data_object');
    expect(component.getIcon('text')).toBe('description');
    expect(component.getIcon('binary')).toBe('insert_drive_file');
  });
});
