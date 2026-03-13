import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { PluginInputV2 } from '@cauldron/forms';
import { environment } from '../../environments/environment';

declare let loadPyodide: (config: { indexURL: string; lockFileURL?: string }) => Promise<PyodideInterface>;

interface PyodideInterface {
  loadPackage(packages: string | string[]): Promise<void>;
  pyimport(name: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, content: string | Uint8Array): void;
    readFile(path: string, options?: { encoding: string }): string;
    readdir(path: string): string[];
  };
  globals: {
    set(name: string, value: unknown): void;
  };
  toPy(value: unknown): unknown;
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
}

export interface ExecutionResult {
  outputs: { name: string; content: string; type: string }[];
  stdout: string;
  stderr: string;
}

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v' + environment.pyodideVersion + '/full/';
const LOCK_FILE_PATH = 'assets/pyodide-lock.json';

@Injectable({ providedIn: 'root' })
export class PyodideService {
  private pyodide: PyodideInterface | null = null;

  progress$ = new Subject<{ stage: string; percent: number }>();
  output$ = new Subject<string>();

  async initialize(packages: string[]): Promise<void> {
    this.progress$.next({ stage: 'Loading Pyodide...', percent: 10 });

    const script = document.createElement('script');
    script.src = PYODIDE_CDN + 'pyodide.js';
    document.head.appendChild(script);

    await new Promise<void>((resolve) => {
      script.onload = () => resolve();
    });

    const isTestEnvironment = typeof (window as unknown as { jasmine?: unknown }).jasmine !== 'undefined';
    const lockFileExists = !isTestEnvironment && await this.checkLockFile();

    if (lockFileExists) {
      this.progress$.next({ stage: 'Loading packages from lock file...', percent: 30 });
      try {
        const lockFileURL = new URL(LOCK_FILE_PATH, window.location.href).href;
        this.pyodide = await loadPyodide({
          indexURL: PYODIDE_CDN,
          lockFileURL: lockFileURL
        });

        this.progress$.next({ stage: 'Loading packages...', percent: 60 });
        const packageNames = packages.map(p => p.split(/[<>=]/)[0]);
        await this.pyodide.loadPackage(packageNames);

        const testPkg = packageNames[0];
        try {
          this.pyodide.pyimport(testPkg);
          this.progress$.next({ stage: 'Ready', percent: 100 });
          return;
        } catch {
          this.pyodide = null;
        }
      } catch {
        this.pyodide = null;
      }
    }

    if (!this.pyodide) {
      this.pyodide = await loadPyodide({
        indexURL: PYODIDE_CDN
      });
    }

    this.progress$.next({ stage: 'Installing packages...', percent: 40 });

    await this.pyodide.loadPackage(['micropip', 'packaging']);
    const micropip = this.pyodide.pyimport('micropip') as { install(pkg: string | string[]): Promise<void> };

    const nativePackages = ['scipy', 'lmfit', 'scikit-learn', 'statsmodels'];

    this.progress$.next({ stage: 'Loading native packages...', percent: 45 });
    for (const nativePkg of nativePackages) {
      try {
        await this.pyodide!.loadPackage(nativePkg);
        console.log('Pre-loaded ' + nativePkg + ' from Pyodide channel');
      } catch {
        console.log('Native package ' + nativePkg + ' not available, skipping');
      }
    }

    const total = packages.length;
    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];
      const pkgName = pkg.split(/[<>=]/)[0];
      this.progress$.next({
        stage: 'Installing ' + pkgName + '...',
        percent: 50 + (i / total) * 45
      });

      console.log('Loading ' + pkgName);
      try {
        await this.pyodide!.loadPackage(pkgName);
        console.log('Loaded ' + pkgName + ' from default channel');
      } catch {
        console.log('Package ' + pkgName + ' not in Pyodide, installing via micropip');
        try {
          await micropip.install(pkg);
          console.log('Installed ' + pkgName + ' via micropip');
        } catch (e) {
          console.error('Failed to install ' + pkgName + ':', e);
        }
      }
    }

    this.progress$.next({ stage: 'Ready', percent: 100 });
  }

  private async checkLockFile(): Promise<boolean> {
    try {
      const response = await fetch(LOCK_FILE_PATH, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  async execute(
    script: string,
    params: Record<string, unknown>,
    modules: Record<string, string> = {},
    argsMapping: Record<string, unknown> = {},
    outputDirFlag?: string,
    inputs?: PluginInputV2[]
  ): Promise<ExecutionResult> {
    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }

    const outputs: { name: string; content: string; type: string }[] = [];
    let stdout = '';
    let stderr = '';

    this.pyodide.setStdout({
      batched: (text: string) => {
        stdout += text + '\n';
        this.output$.next(text);
      }
    });

    this.pyodide.setStderr({
      batched: (text: string) => {
        stderr += text + '\n';
        this.output$.next('[stderr] ' + text);
      }
    });

    const fs = this.pyodide.FS;

    for (const [moduleName, moduleContent] of Object.entries(modules)) {
      const parts = moduleName.split('/');
      if (parts.length > 1) {
        let current = '';
        for (let i = 0; i < parts.length - 1; i++) {
          current += '/' + parts[i];
          try { fs.mkdir(current); } catch { /* exists */ }
        }
      }
      fs.writeFile('/' + moduleName + '.py', moduleContent);
    }

    try { fs.mkdir('/input'); } catch { /* exists */ }
    try { fs.mkdir('/output'); } catch { /* exists */ }

    for (const [key, value] of Object.entries(params)) {
      if (value && typeof value === 'object' && 'name' in value && 'content' in value) {
        const fileValue = value as { name: string; content: Uint8Array | string };
        const filePath = '/input/' + fileValue.name;
        if (typeof fileValue.content === 'string') {
          fs.writeFile(filePath, new TextEncoder().encode(fileValue.content));
        } else {
          fs.writeFile(filePath, fileValue.content);
        }
        params[key] = filePath;
      }
    }

    const args = this.buildArgs(params, argsMapping, outputDirFlag, inputs);

    this.pyodide.globals.set('__params__', this.pyodide.toPy(params));

    fs.writeFile('/plugin_script.py', script);

    const wrappedScript = 'import sys\n' +
      'import traceback\n' +
      'sys.argv = ' + JSON.stringify(['script.py', ...args]) + '\n' +
      'print("[wrapper] sys.argv:", sys.argv)\n' +
      'def __run_plugin__():\n' +
      '    _globals = dict(globals())\n' +
      '    try:\n' +
      '        exec(open("/plugin_script.py").read(), _globals)\n' +
      '        print("[wrapper] Script executed successfully")\n' +
      '    except SystemExit as e:\n' +
      '        print("[wrapper] SystemExit:", e.code)\n' +
      '        if e.code != 0:\n' +
      '            raise\n' +
      '    except Exception as e:\n' +
      '        print("[wrapper] Exception:", str(e))\n' +
      '        traceback.print_exc()\n' +
      '        raise\n' +
      '__run_plugin__()\n';

    await this.pyodide.runPythonAsync(wrappedScript);

    try {
      const outputFiles = fs.readdir('/output');
      for (const file of outputFiles) {
        if (file === '.' || file === '..') continue;
        const type = this.getFileType(file);
        let content: string;
        if (type === 'text' || type === 'json') {
          content = fs.readFile('/output/' + file, { encoding: 'utf8' });
        } else {
          const binaryContent = fs.readFile('/output/' + file, { encoding: 'binary' }) as unknown as Uint8Array;
          const base64 = this.uint8ArrayToBase64(binaryContent);
          content = type === 'image' ? 'data:image/png;base64,' + base64 : base64;
        }
        outputs.push({
          name: file,
          content: content,
          type: type
        });
      }
    } catch { /* no output files */ }

    return { outputs, stdout, stderr };
  }

  private buildArgs(
    params: Record<string, unknown>,
    argsMapping: Record<string, unknown>,
    outputDirFlag?: string,
    inputs?: PluginInputV2[]
  ): string[] {
    const args: string[] = [];

    const inputMap = new Map<string, PluginInputV2>();
    if (inputs) {
      for (const input of inputs) {
        inputMap.set(input.name, input);
      }
    }

    for (const [paramName, value] of Object.entries(params)) {
      const mapping = argsMapping[paramName];
      if (!mapping) continue;

      const input = inputMap.get(paramName);
      const inputType = input?.type;

      let flag: string;
      let transform: string | undefined;
      let when: string | undefined;
      let fixedValue: string | undefined;
      let passAsValue = false;

      if (typeof mapping === 'string') {
        flag = mapping;
      } else {
        const mappingObj = mapping as {
          flag: string;
          transform?: string;
          when?: string;
          value?: string;
          passAsValue?: boolean;
        };
        flag = mappingObj.flag;
        transform = mappingObj.transform;
        when = mappingObj.when;
        fixedValue = mappingObj.value;
        passAsValue = mappingObj.passAsValue === true;
      }

      if (!flag) continue;

      if (when !== undefined) {
        const shouldInclude = this.evaluateCondition(value, when);
        if (!shouldInclude) continue;
        args.push(flag);
        continue;
      }

      if (inputType === 'boolean' && fixedValue === undefined) {
        const boolVal = value === true || value === 'true';
        if (passAsValue) {
          args.push(flag, String(boolVal));
        } else if (boolVal) {
          args.push(flag);
        }
        continue;
      }

      if (value === undefined || value === null || value === '') continue;

      if (fixedValue !== undefined) {
        args.push(flag, fixedValue);
        continue;
      }

      const transformedValue = this.transformValue(value, transform);
      args.push(flag, transformedValue);
    }

    if (outputDirFlag) {
      args.push(outputDirFlag, '/output');
    }

    return args;
  }

  private evaluateCondition(value: unknown, condition: string): boolean {
    const valueStr = String(value ?? '');

    switch (condition) {
      case 'true':
        return value === true || valueStr === 'true' || valueStr === '1';
      case 'false':
        return value === false || valueStr === 'false' || valueStr === '0';
      case 'not-empty':
        return valueStr !== '';
      case 'empty':
        return valueStr === '';
      default:
        return valueStr === condition;
    }
  }

  private transformValue(value: unknown, transform?: string): string {
    if (!transform) {
      return String(value);
    }

    switch (transform) {
      case 'comma-join':
        if (Array.isArray(value)) {
          return value.join(',');
        }
        return String(value);

      case 'space-join':
        if (Array.isArray(value)) {
          return value.join(' ');
        }
        return String(value);

      case 'json-encode':
        return JSON.stringify(value);

      default:
        return String(value);
    }
  }

  private getFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'csv': case 'tsv': case 'txt': case 'html': return 'text';
      case 'png': case 'jpg': case 'jpeg': case 'svg': return 'image';
      case 'json': return 'json';
      default: return 'binary';
    }
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000;
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
    }
    return btoa(chunks.join(''));
  }
}
