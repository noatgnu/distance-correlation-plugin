import { TestBed } from '@angular/core/testing';
import { BrowserExampleFilePathResolver } from './browser-example-resolver';
import { BrowserFileHandler } from './browser-file-handler';
import { FILE_HANDLER } from '@cauldron/forms';

describe('BrowserExampleFilePathResolver', () => {
  let resolver: BrowserExampleFilePathResolver;
  let fileHandler: BrowserFileHandler;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BrowserExampleFilePathResolver,
        { provide: FILE_HANDLER, useClass: BrowserFileHandler }
      ]
    });

    resolver = TestBed.inject(BrowserExampleFilePathResolver);
    fileHandler = TestBed.inject(FILE_HANDLER) as BrowserFileHandler;
  });

  it('should be created', () => {
    expect(resolver).toBeTruthy();
  });

  describe('getPluginExampleFilePath', () => {
    it('should fetch example file and store in file handler', async () => {
      const mockContent = 'Compound,Conc,Rab10\nDrugA,1.0,0.5\nDrugA,10.0,0.8';

      spyOn(window, 'fetch').and.returnValue(Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockContent)
      } as Response));

      const path = await resolver.getPluginExampleFilePath('dose-response', 'dose_response/example_data.csv');

      expect(window.fetch).toHaveBeenCalledWith('assets/examples/dose_response/example_data.csv');
      expect(path).toContain('dose_response_example_data.csv');

      const storedContent = await fileHandler.readFile(path);
      expect(storedContent).toBe(mockContent);
    });

    it('should throw error when fetch fails', async () => {
      spyOn(window, 'fetch').and.returnValue(Promise.resolve({
        ok: false
      } as Response));

      await expectAsync(
        resolver.getPluginExampleFilePath('dose-response', 'nonexistent.csv')
      ).toBeRejectedWithError('Failed to fetch example file: nonexistent.csv');
    });

    it('should extract headers from loaded file', async () => {
      const mockContent = 'Compound\tConc\tRab10\nDrugA\t1.0\t0.5';

      spyOn(window, 'fetch').and.returnValue(Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockContent)
      } as Response));

      const path = await resolver.getPluginExampleFilePath('test-plugin', 'test.tsv');
      const headers = await fileHandler.getFileHeaders(path);

      expect(headers).toEqual(['Compound', 'Conc', 'Rab10']);
    });
  });
});
