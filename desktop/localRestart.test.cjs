const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { installLocalRestart, RESTART_EXIT_CODE } = require('./localRestart.cjs');

function fixture(isPackaged = false, launchFlag = '1') {
  const handlers = new Map();
  const app = new EventEmitter();
  app.isPackaged = isPackaged;
  app.exits = [];
  app.relaunches = [];
  app.relaunch = options => app.relaunches.push(options);
  app.quits = 0;
  app.quit = () => { app.quits++; app.emit('will-quit'); };
  app.exit = code => app.exits.push(code);
  const webContents = { mainFrame: { url: 'http://127.0.0.1:3000/?tab=diagnostics' } };
  const window = { webContents, isDestroyed: () => false };
  installLocalRestart({ app, ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, getWindow: () => window, launchFlag, relaunchOptions: {execPath:'node.exe',args:['desktop.cjs','--wait-for-launcher=1234']} });
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  return { app, event, handlers };
}

test('release builds and unmanaged launches reject restart even with a forged request', () => {
  for (const f of [fixture(true), fixture(false, ''), fixture(false, '0')]) {
    assert.equal(f.handlers.get('desktop:can-restart-local')(f.event), false);
    assert.throws(() => f.handlers.get('desktop:restart-local')(f.event));
    assert.equal(f.app.quits, 0);
  }
  const release = fixture(true, '1');
  assert.equal(release.handlers.get('desktop:can-restart-local')(release.event), false);
});

test('foreign windows, subframes, external origins and OBS pages cannot restart', () => {
  const f = fixture();
  for (const event of [{ ...f.event, sender: {} }, { ...f.event, senderFrame: { url: f.event.senderFrame.url } }]) {
    assert.equal(f.handlers.get('desktop:can-restart-local')(event), false);
    assert.throws(() => f.handlers.get('desktop:restart-local')(event));
  }
  for (const url of ['https://example.com/', 'http://127.0.0.1:3000/overlay', 'http://127.0.0.1:30000/']) {
    f.event.senderFrame.url = url;
    assert.equal(f.handlers.get('desktop:can-restart-local')(f.event), false);
  }
});

test('a local restart waits for normal quit and repeated clicks request one restart', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  assert.equal(f.handlers.get('desktop:can-restart-local')(f.event), true);
  f.handlers.get('desktop:restart-local')(f.event);
  f.handlers.get('desktop:restart-local')(f.event);
  assert.equal(f.app.quits, 0);
  t.mock.timers.tick(100);
  assert.equal(f.app.quits, 1);
  assert.deepEqual(f.app.exits, []);
  assert.deepEqual(f.app.relaunches, [{execPath:'node.exe',args:['desktop.cjs','--wait-for-launcher=1234']}]);
});

test('failed relaunch scheduling leaves the app open and allows another attempt', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  f.app.relaunch = () => { throw Error('Cannot schedule restart'); };
  assert.throws(() => f.handlers.get('desktop:restart-local')(f.event), /Cannot schedule restart/);
  t.mock.timers.tick(500);
  assert.equal(f.app.quits, 0);
  f.app.relaunch = options => f.app.relaunches.push(options);
  f.handlers.get('desktop:restart-local')(f.event);
  t.mock.timers.tick(100);
  assert.equal(f.app.quits, 1);
});

test('Windows launcher stops the owned process tree before opening the next desktop window', async () => {
  let serverRunning = true;
  const children = [];
  const exits = [];
  const oldServer = new EventEmitter();
  oldServer.pid = 1234;
  oldServer.kill = () => {};
  const stoppedTrees = [];
  const spawn = (_command, args) => {
    const child = new EventEmitter();
    child.kind = args[0] === '.' ? 'desktop' : 'server';
    child.kill = () => {};
    if (child.kind === 'server') serverRunning = true;
    children.push(child);
    return child;
  };
  const source = fs.readFileSync(path.join(__dirname, '../scripts/desktop.cjs'), 'utf8');
  const context = {
    __dirname: path.join(__dirname, '../scripts'), module: { exports: {} }, console,
    process: { platform: 'win32', execPath: process.execPath, argv: [], env: {}, exit: code => exits.push(code) },
    setTimeout,
    require(name) {
      if (name === 'node:path') return path;
      if (name === 'node:fs') return { existsSync: () => true };
      if (name === 'node:child_process') return { spawn, execFile(command, args, options, callback) {
        stoppedTrees.push([command, ...args]);
        assert.equal(options.windowsHide, true);
        serverRunning = false;
        oldServer.emit('exit', 0);
        callback(null);
      } };
      if (name === 'node:http') return { get(_url, callback) {
        const req = new EventEmitter();
        req.setTimeout = () => {};
        req.destroy = () => {};
        queueMicrotask(() => callback({ statusCode: serverRunning ? 200 : 503 }));
        return req;
      } };
      throw Error('Unexpected dependency: ' + name);
    }
  };
  vm.runInNewContext(source.slice(0, source.lastIndexOf('main().catch')) + '\nmodule.exports = { startElectron };', context);
  context.module.exports.startElectron(oldServer);
  children[0].emit('exit', RESTART_EXIT_CODE);
  for (let turn = 0; turn < 6; turn++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(children.map(child => child.kind), ['desktop', 'server', 'desktop']);
  assert.deepEqual(exits, []);
  assert.deepEqual(stoppedTrees, [['taskkill.exe', '/PID', '1234', '/T', '/F']]);
});

test('restart shortcut is scoped to the focused main window, ignores repeats and supports its player', () => {
 const app=new EventEmitter();app.isPackaged=false;
 const contents=new EventEmitter();contents.mainFrame={url:'http://127.0.0.1:3000/'};
 const sent=[];contents.send=channel=>sent.push(channel);
 let focused=true;
 const window={webContents:contents,isDestroyed:()=>false,isFocused:()=>focused};
 const support=installLocalRestart({app,ipcMain:{handle(){}},getWindow:()=>window,launchFlag:'1',relaunchOptions:{execPath:'node.exe'}});
 support.attachWindow(window);
 const input={type:'keyDown',key:'r',control:true,alt:true};let prevented=0;
 const event={preventDefault:()=>prevented++};
 contents.emit('before-input-event',event,input);
 assert.equal(sent.length,1);assert.equal(prevented,1);
 for(const patch of [{isAutoRepeat:true},{type:'keyUp'},{control:false},{alt:false},{meta:true},{shift:true}]) contents.emit('before-input-event',event,{...input,...patch});
 focused=false;contents.emit('before-input-event',event,input);focused=true;
 assert.equal(sent.length,1);
 const player=new EventEmitter();contents.emit('did-attach-webview',{},player);
 player.emit('before-input-event',event,input);assert.equal(sent.length,2);
 contents.mainFrame.url='https://example.com/';contents.emit('before-input-event',event,input);assert.equal(sent.length,2);
});
