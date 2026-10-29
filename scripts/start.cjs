const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
process.chdir(root);
process.env.NODE_ENV = 'production';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packageVersion = require(path.join(root, 'package.json')).version;
const buildVersionFile = path.join(root, 'dist', 'build-version.txt');
const serverBundle = path.join(root, 'dist', 'server.cjs');
const sourceServer = path.join(root, 'server.ts');
let buildVersion = '';
try { buildVersion = fs.readFileSync(buildVersionFile, 'utf8').trim(); } catch {}

function runNpm(args, label, { allowFailure = false } = {}) {
  console.log(label);
  const result = spawnSync(npmCommand, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  if (result.error) {
    const detail = result.error.message || String(result.error);
    if (allowFailure) return { ok: false, detail };
    throw new Error(`${label} fehlgeschlagen.\n${detail}`);
  }
  if (result.status !== 0) {
    const detail = `npm Exit-Code ${result.status}`;
    if (allowFailure) return { ok: false, detail };
    throw new Error(`${label} fehlgeschlagen.\n\n${detail}`);
  }
  return { ok: true, detail: '' };
}

function dependenciesLookReady() {
  if (!fs.existsSync(path.join(root, 'node_modules', 'vite'))) return false;
  if (!fs.existsSync(path.join(root, 'node_modules', 'tsx'))) return false;
  if (!fs.existsSync(path.join(root, 'node_modules', 'typescript'))) return false;
  if (process.platform === 'win32') {
    if (!fs.existsSync(path.join(root, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe'))) return false;
    const rollupRoot = path.join(root, 'node_modules', '@rollup');
    if (!fs.existsSync(rollupRoot)) return false;
    const rollupOk = fs.readdirSync(rollupRoot).some(name => name.startsWith('rollup-win32-'));
    if (!rollupOk) return false;
  }
  return true;
}

function repairDependencies() {
  return runNpm(
    ['ci', '--no-audit', '--no-fund'],
    'Abhängigkeiten werden für dieses System repariert ...',
    { allowFailure: true },
  );
}

function buildCurrentVersion() {
  return runNpm(
    ['run', 'build'],
    `Build ${buildVersion || 'unbekannt'} ist nicht aktuell. Erzeuge Version ${packageVersion} ...`,
    { allowFailure: true },
  );
}

function runSourceFallback(reason) {
  if (!fs.existsSync(sourceServer)) throw new Error(reason);
  console.error('\nProduktions-Build konnte nicht aktualisiert werden.');
  console.error('Der Bot startet deshalb im sicheren Source-Fallback.');
  console.error('Hinweis: Die Oberfläche kann dabei noch vom letzten erfolgreichen Frontend-Build stammen.');
  console.error(`Build-Fehler:\n${reason}\n`);

  const child = spawnSync(process.execPath, ['--experimental-strip-types', sourceServer], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  if (child.error) throw child.error;
  process.exit(child.status == null ? 1 : child.status);
}

function isSourceNewer() {
  try {
    if (!fs.existsSync(serverBundle)) return true;
    const bundleMtime = fs.statSync(serverBundle).mtimeMs;
    if (fs.existsSync(sourceServer) && fs.statSync(sourceServer).mtimeMs > bundleMtime) return true;
    const srcDir = path.join(root, 'src');
    if (fs.existsSync(srcDir)) {
      const checkDir = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (checkDir(full)) return true;
          } else if (entry.isFile() && /\.(tsx?|css|html)$/.test(entry.name)) {
            if (fs.statSync(full).mtimeMs > bundleMtime) return true;
          }
        }
        return false;
      };
      if (checkDir(srcDir)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

const bundleMissing = !fs.existsSync(serverBundle);
const indexHtml = path.join(root, 'dist', 'index.html');
const bundleReady = !bundleMissing && fs.existsSync(indexHtml);
const sourcesNewer = isSourceNewer();
const buildRequired = bundleMissing || sourcesNewer;

if (!buildRequired && buildVersion !== packageVersion) {
  fs.mkdirSync(path.dirname(buildVersionFile), { recursive: true });
  fs.writeFileSync(buildVersionFile, packageVersion);
  console.log(`Build war schon aktuell. Stempel auf Version ${packageVersion} gesetzt.`);
}

let serverChild = null;
let replacingServer = false;

function hookServer(child) {
  serverChild = child;
  child.on('exit', (code, signal) => {
    if (replacingServer || serverChild !== child) return;
    process.exit(code == null ? (signal ? 1 : 0) : code);
  });
}

function startBundle() {
  const child = spawn(process.execPath, [serverBundle], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, MUSICBOT_PARENT_PID: String(process.pid) },
  });
  hookServer(child);
  return child;
}

function stopBundle() {
  const child = serverChild;
  if (!child || child.killed) return Promise.resolve();
  replacingServer = true;
  return new Promise(resolve => {
    child.once('exit', () => {
      replacingServer = false;
      resolve();
    });
    child.kill();
  });
}

// OBS loads the Songbot dock as soon as it starts. Serve the last bundle
// before a source rebuild so that dock is not left on a connection error.
if (bundleReady) {
  console.log('Server startet mit dem vorhandenen Build, damit das OBS-Dock verbinden kann.');
  startBundle();
}

if (buildRequired) {
  let repairInfo = '';
  if (!dependenciesLookReady()) {
    const repair = repairDependencies();
    if (!repair.ok) repairInfo = `\n\nAbhängigkeits-Reparatur:\n${repair.detail}`;
  }

  let build = buildCurrentVersion();
  if (!build.ok) {
    // A common update failure is a stale/native package from a previous archive.
    // Repair once automatically, then retry the complete build.
    const repair = repairDependencies();
    if (!repair.ok) {
      repairInfo = `\n\nAbhängigkeits-Reparatur:\n${repair.detail}`;
    } else {
      build = buildCurrentVersion();
    }
  }

  if (!build.ok || !fs.existsSync(serverBundle)) {
    const reason = `${build.detail || 'Der Produktions-Build wurde nicht erzeugt.'}${repairInfo}`;
    if (serverChild) {
      console.error('\nProduktions-Build konnte nicht aktualisiert werden. Der vorhandene Server bleibt aktiv.');
      console.error(reason);
    } else {
      runSourceFallback(reason);
    }
  } else if (serverChild) {
    stopBundle().then(() => startBundle());
  } else {
    startBundle();
  }
} else if (!serverChild) {
  startBundle();
}
