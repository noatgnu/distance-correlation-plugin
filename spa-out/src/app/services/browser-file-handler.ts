import { Injectable } from '@angular/core';
import { FileHandler, ImportedFile } from '@cauldron/forms';

@Injectable({ providedIn: 'root' })
export class BrowserFileHandler implements FileHandler {
  private virtualFS = new Map<string, Uint8Array>();
  private fileHeaders = new Map<string, string[]>();

  async openFileDialog(title: string, accept?: string): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        const buffer = await file.arrayBuffer();
        const content = new Uint8Array(buffer);
        const path = '/input/' + file.name;
        this.virtualFS.set(path, content);
        
        const decoder = new TextDecoder();
        const text = decoder.decode(content.slice(0, 10000)); // Read start for headers
        this.parseAndStoreHeaders(path, text);
        resolve(path);
      };

      input.click();
    });
  }

  async openDirectoryDialog(_title: string): Promise<string | null> {
    return null;
  }

  async readFile(path: string): Promise<string> {
    const content = this.virtualFS.get(path);
    if (!content) return '';
    return new TextDecoder().decode(content);
  }

  async readFileAsUint8Array(path: string): Promise<Uint8Array> {
    return this.virtualFS.get(path) || new Uint8Array(0);
  }

  async readFilePreview(path: string, lines: number): Promise<string> {
    const content = this.virtualFS.get(path);
    if (!content) return '';
    const text = new TextDecoder().decode(content.slice(0, 100000)); // Limit preview read
    return text.split('\n').slice(0, lines).join('\n');
  }

  async saveTempFile(filename: string, content: string | Uint8Array): Promise<string> {
    const path = '/temp/' + filename;
    let data: Uint8Array;
    if (typeof content === 'string') {
      data = new TextEncoder().encode(content);
    } else {
      data = content;
    }
    this.virtualFS.set(path, data);
    
    if (typeof content === 'string') {
      this.parseAndStoreHeaders(path, content);
    } else {
      const text = new TextDecoder().decode(data.slice(0, 10000));
      this.parseAndStoreHeaders(path, text);
    }
    return path;
  }

  async getFileHeaders(path: string): Promise<string[]> {
    if (this.fileHeaders.has(path)) {
      return this.fileHeaders.get(path) || [];
    }
    const content = this.virtualFS.get(path);
    if (!content) return [];
    const text = new TextDecoder().decode(content.slice(0, 10000));
    return this.parseHeaders(text);
  }

  async getImportedFiles(): Promise<ImportedFile[]> {
    return [];
  }

  async parseDataFile(path: string): Promise<{ columns: string[]; rows: string[][] }> {
    const content = this.virtualFS.get(path);
    if (!content) return { columns: [], rows: [] };
    
    const text = new TextDecoder().decode(content);
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) return { columns: [], rows: [] };

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const columns = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    const rows = lines.slice(1).map(line => line.split(delimiter).map(v => v.trim()));

    return { columns, rows };
  }

  writeFile(path: string, content: string | Uint8Array): void {
    let data: Uint8Array;
    if (typeof content === 'string') {
      data = new TextEncoder().encode(content);
    } else {
      data = content;
    }
    this.virtualFS.set(path, data);
    
    const text = typeof content === 'string' ? content : new TextDecoder().decode(data.slice(0, 10000));
    this.parseAndStoreHeaders(path, text);
  }

  getFileContent(path: string): Uint8Array | undefined {
    return this.virtualFS.get(path);
  }

  getFileContentAsString(path: string): string | undefined {
    const content = this.virtualFS.get(path);
    if (!content) return undefined;
    return new TextDecoder().decode(content);
  }

  private parseAndStoreHeaders(path: string, content: string): void {
    const headers = this.parseHeaders(content);
    this.fileHeaders.set(path, headers);
  }

  private parseHeaders(content: string): string[] {
    const firstLine = content.split('\n')[0];
    if (!firstLine) return [];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';
    return firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
  }
}
