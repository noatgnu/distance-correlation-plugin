import { Injectable } from '@angular/core';
import { LogHandler } from '@cauldron/forms';

@Injectable({ providedIn: 'root' })
export class BrowserLogHandler implements LogHandler {
  private logs: string[] = [];

  async log(message: string): Promise<void> {
    this.logs.push('[LOG] ' + message);
  }

  async error(message: string): Promise<void> {
    this.logs.push('[ERROR] ' + message);
  }

  async warn(message: string): Promise<void> {
    this.logs.push('[WARN] ' + message);
  }

  async debug(message: string): Promise<void> {
    this.logs.push('[DEBUG] ' + message);
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }
}
