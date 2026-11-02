/** Native Windows caption buttons; apply exclusively to the main BrowserWindow. */
function mainWindowChrome(platform=process.platform) {
  return platform==='win32' ? {
    titleBarStyle:'hidden',
    titleBarOverlay:{color:'#09090b',symbolColor:'#f4f4f5',height:40}
  } : {};
}
module.exports={mainWindowChrome};
