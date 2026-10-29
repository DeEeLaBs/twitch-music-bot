const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const desktopDir = path.join(root, 'desktop');
const localElectron = path.join(desktopDir, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');

function isServerRunning() {
  return new Promise(resolve => {
    const req = http.get('http://127.0.0.1:3000/api/state', res => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerRunning()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

function spawnSafe(command, args, options = {}) {
  // On Windows, .cmd/.bat files or batch wrappers (like npm, npx) cannot be spawned directly without cmd.exe.
  // Using cmd.exe /c explicitly prevents both EINVAL and Node.js DEP0190 (shell:true with args array).
  if (process.platform === 'win32') {
    if (/\.(cmd|bat)$/i.test(command) || command === 'npm' || command === 'npx') {
      return spawn('cmd.exe', ['/c', command, ...args], { ...options, shell: false });
    }
  }
  return spawn(command, args, { ...options, shell: false });
}

function startElectron(serverChild) {
  console.log('Starting Electron Interface...');
  const electronExe = fs.existsSync(localElectron)
    ? localElectron
    : process.platform === 'win32' ? 'electron.cmd' : 'electron';
  const electronEnv = { ...process.env };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  const child = spawnSafe(electronExe, ['.'], {
    cwd: desktopDir,
    stdio: 'inherit',
    env: electronEnv
  });

  child.on('error', err => {
    console.error('Failed to start Electron process:', err);
    if (serverChild) serverChild.kill();
    process.exit(1);
  });

  child.on('exit', code => {
    if (serverChild) serverChild.kill();
    process.exit(code ?? 0);
  });
}

async function main() {
  const alreadyRunning = await isServerRunning();
  let serverChild = null;
  if (!alreadyRunning) {
    console.log('Starting Twitch Music Bot server...');
    // Default: the prebuilt production bundle (start.cjs rebuilds it only when sources changed).
    // It skips npm.cmd, tsx and the Vite dev server, which cost ~2 s on every launch.
    // Use `npm run desktop:dev` (or MUSICBOT_DEV=1) for the hot-reloading dev server.
    const devMode = process.argv.includes('--dev') || process.env.MUSICBOT_DEV === '1';
    serverChild = devMode
      ? spawnSafe('npm', ['run', 'dev'], { cwd: root, stdio: 'inherit' })
      : spawn(process.execPath, [path.join(root, 'scripts', 'start.cjs')], { cwd: root, stdio: 'inherit' });

    serverChild.on('error', err => {
      console.error('Failed to spawn server process:', err);
      process.exit(1);
    });

    serverChild.on('exit', code => {
      if (code && code !== 0) {
        console.error(`Server process exited with code ${code}`);
      }
      process.exit(code ?? 0);
    });

    // A stale build is rebuilt first (~5 s, longer if dependencies need repair), so allow more time.
    const ready = await waitForServer(90000);
    if (!ready) {
      console.error('Server did not become ready on port 3000 within 90 seconds.');
      if (serverChild) serverChild.kill();
      process.exit(1);
    }
    startElectron(serverChild);
  } else {
    console.log('Twitch Music Bot server is already running on port 3000.');
    startElectron(null);
  }
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
