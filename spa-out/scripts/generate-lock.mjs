import { loadPyodide } from 'pyodide';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGES = ["numpy\u003e=1.24.0","pandas\u003e=2.0.0","statsmodels\u003e=0.14.0","scikit-learn\u003e=1.3.0","plotly\u003e=5.18.0","dcor\u003e=0.6","click\u003e=8.0.0"];
const LOCK_FILE = join(__dirname, '..', 'src', 'assets', 'pyodide-lock.json');

async function generateLock() {
  if (PACKAGES.length === 0) {
    console.log('No packages configured, skipping lock file generation');
    return;
  }

  console.log('Loading Pyodide...');
  const pyodide = await loadPyodide();

  console.log('Loading micropip...');
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');

  console.log('Installing packages:', PACKAGES);
  for (const pkg of PACKAGES) {
    console.log('  Installing ' + pkg + '...');
    try {
      await micropip.install(pkg);
    } catch (e) {
      console.warn('  Warning: Failed to install ' + pkg + ':', e.message);
    }
  }

  console.log('Generating lock file...');
  const lockJson = micropip.freeze();

  const assetsDir = dirname(LOCK_FILE);
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true });
  }

  writeFileSync(LOCK_FILE, lockJson);
  console.log('Lock file generated:', LOCK_FILE);
}

generateLock().catch(console.error);
