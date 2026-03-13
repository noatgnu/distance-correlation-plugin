import { Component, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';

export interface ProgressState {
  stage: string;
  percent: number;
}

@Component({
  selector: 'app-progress-panel',
  imports: [
    MatProgressBarModule,
    MatCardModule
  ],
  templateUrl: './progress-panel.html',
  styleUrl: './progress-panel.scss'
})
export class ProgressPanel {
  progress = input.required<ProgressState>();
}
