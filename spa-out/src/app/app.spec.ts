import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { AppComponent } from './app';
import { PyodideService } from './services/pyodide';
import { WebRService } from './services/webr';
import { BrowserFileHandler } from './services/browser-file-handler';
import { BrowserNotificationHandler } from './services/browser-notification-handler';
import { BrowserLogHandler } from './services/browser-log-handler';
import { BrowserExampleFilePathResolver } from './services/browser-example-resolver';
import { FILE_HANDLER, NOTIFICATION_HANDLER, LOG_HANDLER } from '@cauldron/forms';
import { Subject } from 'rxjs';
import { environment } from '../environments/environment';

describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;
  let mockPyodideService: jasmine.SpyObj<PyodideService>;
  let mockWebRService: jasmine.SpyObj<WebRService>;
  let initializeResolver: () => void;

  beforeEach(async () => {
    const initializePromise = new Promise<void>(resolve => {
      initializeResolver = resolve;
    });

    mockPyodideService = jasmine.createSpyObj('PyodideService', ['initialize', 'execute'], {
      progress$: new Subject(),
      output$: new Subject()
    });
    mockPyodideService.initialize.and.returnValue(initializePromise);

    mockWebRService = jasmine.createSpyObj('WebRService', ['initialize', 'execute'], {
      progress$: new Subject(),
      output$: new Subject()
    });
    mockWebRService.initialize.and.returnValue(initializePromise);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideAnimationsAsync(),
        { provide: PyodideService, useValue: mockPyodideService },
        { provide: WebRService, useValue: mockWebRService },
        { provide: FILE_HANDLER, useClass: BrowserFileHandler },
        { provide: NOTIFICATION_HANDLER, useClass: BrowserNotificationHandler },
        { provide: LOG_HANDLER, useClass: BrowserLogHandler },
        BrowserExampleFilePathResolver
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it('should have plugin definition from environment', () => {
    expect(component.plugin).toBeDefined();
    expect(component.plugin.definition).toBe(environment.pluginDefinition);
  });

  it('should return plugin name', () => {
    expect(component.pluginName).toBe(environment.pluginDefinition.plugin.name);
  });

  it('should return plugin description', () => {
    expect(component.pluginDescription).toBe(environment.pluginDefinition.plugin.description);
  });

  describe('Runtime Initialization', () => {
    it('should call initialize on runtime service', () => {
      if (environment.runtime === 'webr') {
        expect(mockWebRService.initialize).toHaveBeenCalled();
      } else {
        expect(mockPyodideService.initialize).toHaveBeenCalled();
      }
    });

    it('should not be ready before initialization completes', () => {
      expect(component.runtimeReady()).toBeFalse();
    });

    xit('should set runtimeReady after initialization', async () => {
      initializeResolver();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.runtimeReady()).toBeTrue();
    });
  });

  describe('Example Loading', () => {
    it('should return hasExample based on environment', () => {
      const expected = environment.pluginDefinition.example?.enabled === true;
      expect(component.hasExample()).toBe(expected);
    });
  });
});
