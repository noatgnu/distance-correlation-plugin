import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationHandler } from '@cauldron/forms';

@Injectable({ providedIn: 'root' })
export class BrowserNotificationHandler implements NotificationHandler {
  constructor(private snackBar: MatSnackBar) {}

  showError(message: string, duration = 5000): void {
    this.snackBar.open(message, 'Close', {
      duration,
      panelClass: ['error-snackbar']
    });
  }

  showSuccess(message: string, duration = 3000): void {
    this.snackBar.open(message, 'Close', {
      duration,
      panelClass: ['success-snackbar']
    });
  }

  showWarning(message: string, duration = 4000): void {
    this.snackBar.open(message, 'Close', {
      duration,
      panelClass: ['warning-snackbar']
    });
  }

  showInfo(message: string, duration = 3000): void {
    this.snackBar.open(message, 'Close', {
      duration
    });
  }
}
