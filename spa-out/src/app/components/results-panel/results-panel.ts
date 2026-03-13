import { Component, input, output } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

export interface OutputFile {
  name: string;
  content: string;
  type: string;
}

@Component({
  selector: 'app-results-panel',
  imports: [
    MatExpansionModule,
    MatListModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './results-panel.html',
  styleUrl: './results-panel.scss'
})
export class ResultsPanel {
  outputs = input.required<OutputFile[]>();
  pluginId = input<string>('plugin');

  downloadRequested = output<OutputFile>();
  downloadAllRequested = output<void>();

  downloadOutput(outputFile: OutputFile): void {
    this.downloadRequested.emit(outputFile);
  }

  downloadAll(): void {
    this.downloadAllRequested.emit();
  }

  getIcon(type: string): string {
    switch (type) {
      case 'image': return 'image';
      case 'json': return 'data_object';
      case 'text': return 'description';
      default: return 'insert_drive_file';
    }
  }
}
