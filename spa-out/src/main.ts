import { provideBrowserGlobalErrorListeners, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { FILE_HANDLER, NOTIFICATION_HANDLER, LOG_HANDLER } from '@cauldron/forms';
import { AppComponent } from './app/app';
import { BrowserFileHandler } from './app/services/browser-file-handler';
import { BrowserNotificationHandler } from './app/services/browser-notification-handler';
import { BrowserLogHandler } from './app/services/browser-log-handler';
import { BrowserExampleFilePathResolver } from './app/services/browser-example-resolver';

bootstrapApplication(AppComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimations(),
    importProvidersFrom(MatSnackBarModule),
    { provide: FILE_HANDLER, useClass: BrowserFileHandler },
    { provide: NOTIFICATION_HANDLER, useClass: BrowserNotificationHandler },
    { provide: LOG_HANDLER, useClass: BrowserLogHandler },
    BrowserExampleFilePathResolver
  ]
})
.catch(err => {
  const logHandler = new BrowserLogHandler();
  logHandler.error('Bootstrap failed: ' + err.message);
});
