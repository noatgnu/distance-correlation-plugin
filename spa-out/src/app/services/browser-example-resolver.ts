import { Injectable, Inject } from '@angular/core';
import { ExampleFilePathResolver, FILE_HANDLER, FileHandler } from '@cauldron/forms';
import { environment } from '../../environments/environment';

@Injectable()
export class BrowserExampleFilePathResolver implements ExampleFilePathResolver {
  constructor(@Inject(FILE_HANDLER) private fileHandler: FileHandler) {}

  async getPluginExampleFilePath(pluginId: string, filename: string): Promise<string> {
    const basePath = environment.exampleBasePath || 'assets/examples/';
    const url = basePath + filename;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch example file: ${filename}`);
    }

    const buffer = await response.arrayBuffer();
    const content = new Uint8Array(buffer);
    const exampleFilename = filename.replace(/\//g, '_');

    return await this.fileHandler.saveTempFile(exampleFilename, content);
  }
}
