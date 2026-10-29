const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { builtinModules } = require('node:module');

function copyDesktopRuntime(source, destination) {
  const signature = path.join(source, 'electron.exe.sig');
  if (!fs.existsSync(signature) || !fs.statSync(signature).size) throw new Error('DRM-Signatur der Desktop-Laufzeit fehlt.');
  fs.cpSync(source, destination, { recursive: true });
  fs.renameSync(path.join(destination, 'electron.exe'), path.join(destination, 'MusicBot.exe'));
  fs.renameSync(path.join(destination, 'electron.exe.sig'), path.join(destination, 'MusicBot.exe.sig'));
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Die Windows-Standalone-Version muss unter Windows gebaut werden.');
  const root = path.resolve(__dirname, '..');
  const pkg = require(path.join(root, 'package.json'));
  const electronRuntime = path.join(root, 'desktop/node_modules/electron/dist');
  if (!fs.existsSync(path.join(electronRuntime, 'electron.exe'))) throw new Error('Desktop-Laufzeit fehlt im Build-Arbeitsplatz.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = path.join(root, 'standalone', `Bot-${pkg.version}-win-${process.arch}-${stamp}`);
  const portable = path.join(output, 'Portable');
  fs.mkdirSync(portable, { recursive: true });
  const { build: viteBuild } = await import('vite');
  await viteBuild({ root, build: { outDir: path.join(portable, 'dist'), emptyOutDir: false } });
  const plugins = [{ name: 'optional-console-colors', setup(builder) {
    builder.onResolve({ filter: /^supports-color$/ }, () => ({ path: 'supports-color', namespace: 'optional' }));
    builder.onLoad({ filter: /.*/, namespace: 'optional' }, () => ({ contents: 'module.exports = false;' }));
  } }];
  const defines = { 'process.env.NODE_ENV': '"production"', 'process.env.WS_NO_BUFFER_UTIL': '"1"', 'process.env.WS_NO_UTF_8_VALIDATE': '"1"' };
  const results = [];
  results.push(await build({ absWorkingDir: root, entryPoints: ['server.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: path.join(portable, 'dist/server.cjs'), metafile: true, define: defines, plugins }));
  fs.mkdirSync(path.join(portable, 'desktop'));
  results.push(await build({ absWorkingDir: root, entryPoints: ['desktop/main.cjs'], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(portable, 'desktop/main.cjs'), external: ['electron'], metafile: true, define: defines, plugins }));
  const builtins = new Set(builtinModules);
  for (const result of results) for (const item of Object.values(result.metafile.outputs)) for (const dep of item.imports) {
    if (dep.external && dep.path !== 'electron' && !dep.path.startsWith('node:') && !builtins.has(dep.path)) throw new Error(`Nicht gebuendelte Abhaengigkeit: ${dep.path}`);
  }
  for (const name of ['preload.cjs', 'playerPreload.cjs', 'drm.cjs']) fs.copyFileSync(path.join(root, 'desktop', name), path.join(portable, 'desktop', name));
  // Preserve the entire runtime, its locale files, codecs, signature and licenses.
  copyDesktopRuntime(electronRuntime, portable);
  fs.mkdirSync(path.join(portable, 'runtime'));
  fs.copyFileSync(process.execPath, path.join(portable, 'runtime/node.exe'));
  const licenseResponse = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`, { signal: AbortSignal.timeout(30000) });
  if (!licenseResponse.ok) throw new Error(`Node-Lizenz konnte nicht geladen werden: ${licenseResponse.status}`);
  fs.writeFileSync(path.join(portable, 'runtime/LICENSE.txt'), await licenseResponse.text());
  fs.mkdirSync(path.join(portable, 'scripts'));
  fs.copyFileSync(path.join(root, 'scripts/portable-launcher.cjs'), path.join(portable, 'scripts/portable-launcher.cjs'));
  fs.writeFileSync(path.join(portable, 'scripts/start.cjs'), "const path = require('node:path');\nprocess.chdir(path.resolve(__dirname, '..'));\nprocess.env.NODE_ENV = 'production';\nrequire('../dist/server.cjs');\n");
  const appDirectory = path.join(portable, 'resources/app');
  fs.mkdirSync(appDirectory, { recursive: true });
  fs.writeFileSync(path.join(appDirectory, 'package.json'), JSON.stringify({ name: 'musicbot-portable', version: pkg.version, main: 'bootstrap.cjs' }, null, 2));
  fs.writeFileSync(path.join(appDirectory, 'bootstrap.cjs'), "const path = require('node:path');\nconst root = path.resolve(__dirname, '../..');\nprocess.chdir(root);\nrequire(path.join(root, 'scripts/portable-launcher.cjs')).startPortable(root);\n");
  fs.writeFileSync(path.join(portable, 'Start-MusicBot.bat'), '@echo off\r\ncd /d "%~dp0"\r\nset ELECTRON_RUN_AS_NODE=\r\nset NODE_OPTIONS=\r\nstart "" "%~dp0MusicBot.exe"\r\n');
  fs.writeFileSync(path.join(portable, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, private: true, type: 'module' }, null, 2));
  fs.mkdirSync(path.join(portable, 'data'));
  fs.cpSync(path.join(root, 'plugins'), path.join(portable, 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(portable, 'BUILD-INFO.json'), JSON.stringify({ version: pkg.version, builtAt: stamp, node: process.version, electron: fs.readFileSync(path.join(electronRuntime, 'version'), 'utf8').trim(), platform: process.platform, arch: process.arch, desktopIncluded: true }, null, 2));
  const licenses = path.join(portable, 'licenses');
  fs.mkdirSync(licenses);
  function collect(dir, prefix = '') {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!item.isDirectory() || item.name.startsWith('.')) continue;
      const folder = path.join(dir, item.name);
      if (item.name.startsWith('@')) { collect(folder, item.name + '-'); continue; }
      for (const file of fs.readdirSync(folder)) if (/^(licen[sc]e|copying|notice)(\.|$)/i.test(file) && fs.statSync(path.join(folder, file)).isFile()) fs.copyFileSync(path.join(folder, file), path.join(licenses, prefix + item.name + '-' + file));
      if (fs.existsSync(path.join(folder, 'node_modules'))) collect(path.join(folder, 'node_modules'), prefix + item.name + '-');
    }
  }
  collect(path.join(root, 'node_modules'));
  collect(path.join(root, 'desktop/node_modules'), 'desktop-');
  // Source snapshot excludes installed dependencies and any personal application data.
  const source = path.join(output, 'Quellcode');
  fs.mkdirSync(source);
  for (const name of ['src', 'desktop', 'scripts', 'tests', 'plugins', 'public', 'docs', 'package.json', 'package-lock.json', 'server.ts', 'index.html', 'tsconfig.json', 'vite.config.ts', '.env.example', '.gitignore', 'README.md', 'CHANGELOG.md', 'Standalone-Erstellen.bat']) {
    if (fs.existsSync(path.join(root, name))) fs.cpSync(path.join(root, name), path.join(source, name), { recursive: true, filter: item => !item.split(path.sep).some(part => ['node_modules', '.evs-venv'].includes(part)) && !/\.log$/.test(item) });
  }
  const readme = fs.readFileSync(path.join(root, 'docs/STANDALONE.md'), 'utf8');
  fs.writeFileSync(path.join(output, 'BITTE-LESEN.md'), readme);
  fs.writeFileSync(path.join(portable, 'BITTE-LESEN.md'), readme);
  console.log(`\nStandalone erfolgreich erstellt:\n${output}`);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main, copyDesktopRuntime };
