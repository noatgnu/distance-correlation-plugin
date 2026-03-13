import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { FormBuilder } from '@angular/forms';
import { PyodideService } from './services/pyodide';
import { WebRService } from './services/webr';
import { BrowserFileHandler } from './services/browser-file-handler';
import { FILE_HANDLER } from '@cauldron/forms';
import { environment } from '../environments/environment';

describe('Integration: Example Execution', () => {
  let pyodideService: PyodideService;
  let webrService: WebRService;
  let fileHandler: BrowserFileHandler;
  let fb: FormBuilder;

  beforeAll(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideAnimationsAsync(),
        PyodideService,
        WebRService,
        { provide: FILE_HANDLER, useClass: BrowserFileHandler },
        FormBuilder
      ]
    }).compileComponents();

    pyodideService = TestBed.inject(PyodideService);
    webrService = TestBed.inject(WebRService);
    fileHandler = TestBed.inject(FILE_HANDLER) as BrowserFileHandler;
    fb = TestBed.inject(FormBuilder);

    if (environment.runtime === 'webr') {
      console.log('Initializing WebR for integration test...');
      const packages = environment.webrPackages.map(p => p.name);
      await webrService.initialize(packages, environment.webrPackages);
      console.log('WebR initialized successfully');
    } else {
      console.log('Initializing Pyodide for integration test...');
      await pyodideService.initialize(environment.pyodidePackages);
      console.log('Pyodide initialized successfully');
    }
  }, 300000);

  it('should run example and produce output', async () => {
    const pluginDef = environment.pluginDefinition;
    const form = fb.group({});

    for (const input of pluginDef.inputs) {
      const defaultValue = input.default !== undefined ? input.default : '';
      form.addControl(input.name, fb.control(defaultValue));
    }

    const fileInputs = new Set<string>();
    for (const input of pluginDef.inputs) {
      if (input.type === 'file') {
        fileInputs.add(input.name);
      }
    }

    const fileData = new Map<string, {name: string, content: string}>();
    const exampleValues = pluginDef.example?.values || {};

    for (const [key, value] of Object.entries(exampleValues)) {
      if ((key as string).endsWith('_source')) continue;

      if (typeof value === 'string' && fileInputs.has(key)) {
        const fileName = (value as string).split('/').pop() || 'example.txt';
        const assetPath = (value as string).startsWith('examples/')
          ? 'assets/examples/' + (value as string).substring(9)
          : 'assets/examples/' + value;

        const response = await fetch(assetPath);
        if (response.ok) {
          const content = await response.text();
          fileData.set(key, { name: fileName, content });
          form.patchValue({ [key]: fileName });
        }
      } else {
        form.patchValue({ [key]: value });
      }
    }

    expect(fileData.size).toBeGreaterThan(0);

    const params: Record<string, unknown> = { ...form.value };
    for (const [key, fileInfo] of fileData.entries()) {
      params[key] = fileInfo;
    }

    console.log('Running plugin with example data...');
    console.log('Params:', JSON.stringify(Object.keys(params)));
    console.log('File data loaded:', fileData.size, 'files');
    for (const [key, fileInfo] of fileData.entries()) {
      console.log('  ' + key + ': ' + fileInfo.name + ' (' + fileInfo.content.length + ' bytes)');
    }

    const argsMapping = pluginDef.execution?.argsMapping || {};
    const outputDirFlag = pluginDef.execution?.outputDir;
    const inputs = pluginDef.inputs || [];

    console.log('Args mapping:', JSON.stringify(argsMapping));
    console.log('Output dir flag:', outputDirFlag);

    let result: { outputs: Array<{ name: string; content: string; type: string }>; stdout?: string; stderr?: string };

    try {
      if (environment.runtime === 'webr') {
        result = await webrService.execute(
          environment.pluginScript,
          params,
          environment.pluginModules,
          argsMapping,
          outputDirFlag,
          inputs
        );
      } else {
        result = await pyodideService.execute(
          environment.pluginScript,
          params,
          environment.pluginModules,
          argsMapping,
          outputDirFlag,
          inputs
        );
      }
    } catch (e) {
      console.error('Execution failed:', e);
      throw e;
    }

    console.log('Plugin execution completed');
    console.log('Outputs count:', result.outputs.length);
    if (result.stdout) console.log('Stdout:', result.stdout.slice(0, 500));
    if (result.stderr) console.log('Stderr:', result.stderr.slice(0, 500));

    expect(result).toBeDefined();
    expect(result.outputs).toBeDefined();
    expect(result.outputs.length).toBeGreaterThan(0);

    for (const output of result.outputs) {
      expect(output.name).toBeTruthy();
      expect(output.content).toBeTruthy();
      console.log('Output generated: ' + output.name + ' (' + output.content.length + ' bytes)');
    }
  }, 300000);
});
