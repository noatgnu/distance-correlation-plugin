import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { PluginInputV2 } from '@cauldron/forms';
import { environment, WebrPackage } from '../../environments/environment';

export interface ExecutionResult {
  outputs: { name: string; content: string; type: string }[];
  stdout: string;
  stderr: string;
}

interface WebRInterface {
  init(): Promise<void>;
  installPackages(packages: string[], options?: { repos?: string[]; quiet?: boolean }): Promise<void>;
  evalRBoolean(code: string): Promise<boolean>;
  evalRString(code: string): Promise<string>;
  FS: {
    mkdir(path: string): Promise<void>;
    writeFile(path: string, content: Uint8Array): Promise<void>;
    readFile(path: string): Promise<Uint8Array>;
  };
  objs: {
    globalEnv: {
      bind(name: string, value: unknown): Promise<void>;
    };
  };
  Shelter: new () => Promise<ShelterInterface>;
}

interface ShelterInterface {
  captureR(code: string, options?: CaptureROptions): Promise<CaptureRResult>;
  purge(): void;
}

interface CaptureROptions {
  withAutoprint?: boolean;
  captureStreams?: boolean;
  captureConditions?: boolean;
  captureGraphics?: {
    width: number;
    height: number;
    bg: string;
  };
}

interface CaptureRResult {
  output?: Array<{ type: string; data: string }>;
  images?: ImageBitmap[];
}

const WEBR_CDN = 'https://webr.r-wasm.org/v' + environment.webrVersion + '/';

@Injectable({ providedIn: 'root' })
export class WebRService {
  private webR: WebRInterface | null = null;

  progress$ = new Subject<{ stage: string; percent: number }>();
  output$ = new Subject<string>();

  async initialize(packages: string[], packageRepos: WebrPackage[] = []): Promise<void> {
    this.progress$.next({ stage: 'Loading WebR...', percent: 10 });

    const { WebR } = await import(/* webpackIgnore: true */ WEBR_CDN + 'webr.mjs') as { WebR: new () => WebRInterface };

    this.progress$.next({ stage: 'Initializing R...', percent: 20 });

    this.webR = new WebR();
    await this.webR.init();

    this.progress$.next({ stage: 'Installing packages...', percent: 40 });

    const repoMap = new Map<string, string>();
    for (const pr of packageRepos) {
      repoMap.set(pr.name, pr.repo);
    }

    const defaultRepos = ['https://repo.r-wasm.org'];
    const installed = new Set<string>();
    let toInstall = [...packages];
    let pass = 0;
    const maxPasses = 5;

    while (toInstall.length > 0 && pass < maxPasses) {
      pass++;
      this.progress$.next({ stage: 'Installation pass ' + pass + '...', percent: 40 + (pass / maxPasses) * 40 });

      const failed: string[] = [];
      for (const pkg of toInstall) {
        if (installed.has(pkg)) continue;

        this.progress$.next({ stage: 'Installing ' + pkg + '...', percent: 40 + (pass / maxPasses) * 40 });

        const pkgRepo = repoMap.get(pkg);
        const repos = pkgRepo ? [pkgRepo, ...defaultRepos] : defaultRepos;

        try {
          await this.webR.installPackages([pkg], { repos: repos, quiet: false });

          const isInstalled = await this.webR.evalRBoolean(
            'requireNamespace("' + pkg + '", quietly = TRUE)'
          );

          if (isInstalled) {
            installed.add(pkg);
          } else {
            failed.push(pkg);
          }
        } catch {
          failed.push(pkg);
        }
      }

      if (failed.length === toInstall.length) {
        break;
      }

      toInstall = failed;
    }

    this.progress$.next({ stage: 'Ready', percent: 100 });
  }

  async execute(
    script: string,
    params: Record<string, unknown>,
    modules: Record<string, string> = {},
    argsMapping: Record<string, unknown> = {},
    outputDirFlag?: string,
    inputs?: PluginInputV2[]
  ): Promise<ExecutionResult> {
    if (!this.webR) {
      throw new Error('WebR not initialized');
    }

    const outputs: { name: string; content: string; type: string }[] = [];
    let stdout = '';
    let stderr = '';

    const shelter = await new this.webR.Shelter();

    try {
      await this.webR.FS.mkdir('/input');
    } catch { /* exists */ }
    try {
      await this.webR.FS.mkdir('/output');
    } catch { /* exists */ }

    const encoder = new TextEncoder();

    for (const [moduleName, moduleContent] of Object.entries(modules)) {
      const parts = moduleName.split('/');
      if (parts.length > 1) {
        let current = '';
        for (let i = 0; i < parts.length - 1; i++) {
          current += '/' + parts[i];
          try { await this.webR.FS.mkdir(current); } catch { /* exists */ }
        }
      }
      await this.webR.FS.writeFile('/' + moduleName + '.R', encoder.encode(moduleContent));
    }
    for (const [key, value] of Object.entries(params)) {
      if (value && typeof value === 'object' && 'name' in value && 'content' in value) {
        const fileValue = value as { name: string; content: Uint8Array | string };
        const filePath = '/input/' + fileValue.name;
        const data = typeof fileValue.content === 'string' ? encoder.encode(fileValue.content) : fileValue.content;
        await this.webR.FS.writeFile(filePath, data);
        params[key] = filePath;
      }
    }

    const args = this.buildArgs(params, argsMapping, outputDirFlag, inputs);

    await this.webR.FS.writeFile('/plugin_script.R', encoder.encode(script));

    await this.webR.objs.globalEnv.bind('webrArgs', ['Rscript', ...args]);

    const wrappedScript = `options(webr = TRUE);
Sys.setenv(WEBR = "1");
options(device = webr::canvas);
pdf <- function(file = NULL, ...) { webr::canvas(...) };
svg <- function(filename = NULL, ...) { webr::canvas(...) };
png <- function(filename = NULL, ...) { webr::canvas(...) };
commandArgs <- function(trailingOnly = FALSE) {
  args <- get("webrArgs", envir = globalenv());
  if (trailingOnly) args[-1] else args
};
tryCatch({
  env <- new.env(parent = globalenv());
  source("/plugin_script.R", local = env);
}, error = function(e) {
  message("Error: ", conditionMessage(e));
  invisible(NULL)
})`;

    const result = await shelter.captureR(wrappedScript, {
      withAutoprint: true,
      captureStreams: true,
      captureConditions: false,
      captureGraphics: {
        width: 800,
        height: 600,
        bg: 'white'
      }
    });

    if (result.output) {
      for (const item of result.output) {
        if (item.type === 'stdout') {
          stdout += item.data + '\n';
          this.output$.next(item.data);
        } else if (item.type === 'stderr') {
          stderr += item.data + '\n';
          this.output$.next('[stderr] ' + item.data);
        }
      }
    }

    if (result.images && result.images.length > 0) {
      for (let i = 0; i < result.images.length; i++) {
        const img = result.images[i];
        try {
          const canvas = new OffscreenCanvas(img.width, img.height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const blob = await canvas.convertToBlob({ type: 'image/png' });
            const arrayBuffer = await blob.arrayBuffer();
            const binaryContent = new Uint8Array(arrayBuffer);
            const base64 = this.uint8ArrayToBase64(binaryContent);
            const filename = result.images.length === 1 ? 'plot.png' : 'plot_' + (i + 1) + '.png';
            outputs.push({
              name: filename,
              content: 'data:image/png;base64,' + base64,
              type: 'image'
            });
          }
        } catch {
          // Failed to convert plot image
        }
      }
    }

    try {
      const outputFiles = await this.webR.evalRString('paste(list.files("/output"), collapse = "\\n")');
      const files = outputFiles.split('\n').filter((f: string) => f.trim() !== '');

      for (const file of files) {
        try {
          const type = this.getFileType(file);
          const binaryContent = await this.webR.FS.readFile('/output/' + file);
          let content: string;
          if (type === 'text' || type === 'json') {
            content = new TextDecoder().decode(binaryContent);
          } else {
            const base64 = this.uint8ArrayToBase64(binaryContent);
            content = type === 'image' ? 'data:image/png;base64,' + base64 : base64;
          }
          outputs.push({
            name: file,
            content: content,
            type: type
          });
        } catch {
          // Failed to read output file
        }
      }
    } catch {
      // Failed to list output files
    }

    shelter.purge();

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
      case 'rds': case 'rda': case 'rdata': return 'binary';
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
