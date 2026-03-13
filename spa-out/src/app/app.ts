import { Component, signal, OnInit, ViewChild, Inject, inject } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import {
  DynamicFormComponent,
  PluginV2,
  PluginInputV2,
  FILE_HANDLER,
  FileHandler,
  ExampleFilePathResolver
} from '@cauldron/forms';
import { environment, ExampleFile } from '../environments/environment';
import { PyodideService } from './services/pyodide';
import { WebRService } from './services/webr';
import { BrowserFileHandler } from './services/browser-file-handler';
import { BrowserExampleFilePathResolver } from './services/browser-example-resolver';
import { ResultsPanel, OutputFile } from './components/results-panel/results-panel';
import { ProgressPanel, ProgressState } from './components/progress-panel/progress-panel';
import { ThemeService, Theme } from './services/theme.service';

@Component({
  selector: 'app-root',
  imports: [
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
    DynamicFormComponent,
    ResultsPanel,
    ProgressPanel
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent implements OnInit {
  @ViewChild(DynamicFormComponent) dynamicForm!: DynamicFormComponent;

  readonly themeService = inject(ThemeService);

  plugin: PluginV2 = {
    id: 0,
    definition: environment.pluginDefinition,
    folderPath: '',
    scriptPath: '',
    installSource: 'spa',
    commitHash: '',
    repository: environment.pluginDefinition.plugin.repository || '',
    enabled: true
  };

  runtimeReady = signal(false);
  loading = signal(false);
  outputs = signal<OutputFile[]>([]);
  logs = signal<string[]>([]);
  error = signal<string | null>(null);
  progress = signal<ProgressState>({ stage: '', percent: 0 });

  exampleResolver: ExampleFilePathResolver;

  constructor(
    @Inject(FILE_HANDLER) private fileHandler: FileHandler,
    private pyodide: PyodideService,
    private webr: WebRService,
    exampleResolver: BrowserExampleFilePathResolver
  ) {
    this.exampleResolver = exampleResolver;
  }

  async ngOnInit() {
    await this.initializeRuntime();
  }

  private async initializeRuntime() {
    this.loading.set(true);

    if (environment.runtime === 'webr') {
      this.webr.progress$.subscribe(p => this.progress.set(p));
      this.webr.output$.subscribe(line => {
        this.logs.update(logs => [...logs, line]);
      });

      try {
        const packages = environment.webrPackages.map(p => p.name);
        await this.webr.initialize(packages, environment.webrPackages);
        this.runtimeReady.set(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.error.set('Failed to initialize WebR: ' + message);
      }
    } else {
      this.pyodide.progress$.subscribe(p => this.progress.set(p));
      this.pyodide.output$.subscribe(line => {
        this.logs.update(logs => [...logs, line]);
      });

      try {
        await this.pyodide.initialize(environment.pyodidePackages);
        this.runtimeReady.set(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.error.set('Failed to initialize Pyodide: ' + message);
      }
    }

    this.loading.set(false);
  }

  async onFormSubmit(values: Record<string, unknown>) {
    this.loading.set(true);
    this.error.set(null);
    this.outputs.set([]);
    this.logs.set([]);

    try {
      const params = await this.prepareParams(values);

      const argsMapping = environment.pluginDefinition.execution?.argsMapping || {};
      const outputDirFlag = environment.pluginDefinition.execution?.outputDir;
      const inputs = environment.pluginDefinition.inputs || [];

      let result: { outputs: OutputFile[] };

      if (environment.runtime === 'webr') {
        result = await this.webr.execute(
          environment.pluginScript,
          params,
          environment.pluginModules,
          argsMapping,
          outputDirFlag,
          inputs
        );
      } else {
        result = await this.pyodide.execute(
          environment.pluginScript,
          params,
          environment.pluginModules,
          argsMapping,
          outputDirFlag,
          inputs
        );
      }

      this.outputs.set(result.outputs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set('Execution failed: ' + message);
    } finally {
      this.loading.set(false);
    }
  }

  private async prepareParams(values: Record<string, unknown>): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = { ...values };

    for (const input of environment.pluginDefinition.inputs) {
      if (input.type === 'file' && params[input.name]) {
        const filePath = params[input.name] as string;
        const fileContent = await (this.fileHandler as BrowserFileHandler).readFileAsUint8Array(filePath);
        const fileName = filePath.split('/').pop() || 'file';
        params[input.name] = { name: fileName, content: fileContent };
      }
    }

    return params;
  }

  async loadExample() {
    if (this.dynamicForm) {
      await this.dynamicForm.loadExample();
    }
  }

  hasExample(): boolean {
    return environment.pluginDefinition.example?.enabled === true;
  }

  getExampleFiles(): ExampleFile[] {
    return environment.exampleFiles || [];
  }

  hasExampleFiles(): boolean {
    return this.getExampleFiles().length > 0;
  }

  async downloadExampleFile(file: ExampleFile): Promise<void> {
    const basePath = environment.exampleBasePath || 'assets/examples/';
    const url = basePath + file.path;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Failed to download example file:', error);
    }
  }

  async downloadAllExampleFiles(): Promise<void> {
    const files = this.getExampleFiles();
    if (files.length === 0) return;

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const basePath = environment.exampleBasePath || 'assets/examples/';

    for (const file of files) {
      const url = basePath + file.path;
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          zip.file(file.filename, buffer);
        }
      } catch (error) {
        console.error(`Failed to fetch ${file.filename}:`, error);
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = environment.pluginDefinition.plugin.id + '-examples.zip';
    a.click();
    URL.revokeObjectURL(url);
  }

  submitForm() {
    if (this.dynamicForm) {
      this.dynamicForm.submit();
    }
  }

  downloadOutput(output: OutputFile) {
    let url: string;
    if (output.content.startsWith('data:')) {
      url = output.content;
    } else {
      const mimeType = output.type === 'image' ? 'image/png' : 'text/plain';
      const blob = new Blob([output.content], { type: mimeType });
      url = URL.createObjectURL(blob);
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = output.name;
    a.click();

    if (!output.content.startsWith('data:')) {
      URL.revokeObjectURL(url);
    }
  }

  async downloadAll() {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    for (const output of this.outputs()) {
      if (output.content.startsWith('data:')) {
        const base64Data = output.content.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        zip.file(output.name, bytes);
      } else {
        zip.file(output.name, output.content);
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = environment.pluginDefinition.plugin.id + '-results.zip';
    a.click();
    URL.revokeObjectURL(url);
  }

  get pluginName(): string {
    return environment.pluginDefinition.plugin.name;
  }

  get pluginDescription(): string {
    return environment.pluginDefinition.plugin.description;
  }

  get repositoryUrl(): string | undefined {
    return environment.pluginDefinition.plugin.repository;
  }
}
