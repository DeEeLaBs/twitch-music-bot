const test=require('node:test');
const assert=require('node:assert/strict');
const {mainWindowChrome}=require('./windowChrome.cjs');
test('only Windows main-window options enable native controls without removing the native frame',()=>{
 const options=mainWindowChrome('win32');
 assert.equal(options.titleBarStyle,'hidden');assert.equal(options.titleBarOverlay.height,40);
 assert.equal(options.frame,undefined);assert.equal(options.webPreferences,undefined);
 for(const platform of ['darwin','linux'])assert.deepEqual(mainWindowChrome(platform),{});
});
test('window configuration calls receive independent overlay options',()=>{
 const first=mainWindowChrome('win32');first.titleBarOverlay.height=100;
 assert.equal(mainWindowChrome('win32').titleBarOverlay.height,40);
});
