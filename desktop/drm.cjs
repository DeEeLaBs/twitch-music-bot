async function initializeDrm(components, timeoutMs = 60000) {
  if (!components?.whenReady) return { ready: false, reason: 'runtime-missing' };
  let timeout;
  try {
    await Promise.race([
      components.whenReady([components.WIDEVINE_CDM_ID]),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), timeoutMs); })
    ]);
    return { ready: true };
  } catch (error) {
    return { ready: false, reason: error.message === 'timeout' ? 'timeout' : 'installation-failed' };
  } finally { clearTimeout(timeout); }
}
async function openDesktopAfterDrm(components, openDesktop, onFailure = () => {}) {
  const result = await initializeDrm(components);
  if (!result.ready) onFailure(result);
  openDesktop();
  return result;
}
module.exports = { initializeDrm, openDesktopAfterDrm };
