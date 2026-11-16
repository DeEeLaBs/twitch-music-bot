export const APP_TABS = ['player','webPlayer','commands','chat','overlay','alertCreator','obsDock','countdown','greetings','wheel','games','diagnostics','settings'] as const;
export type AppTab = typeof APP_TABS[number];
const KEY = 'musicbot_activeTab';
type ViewStorage = {getItem(key:string):string|null;setItem(key:string,value:string):void};
function validTab(value:string|null):AppTab|undefined {
  const tab = value === 'blacklist' ? 'commands' : value === 'spotify' ? 'settings' : value;
  return APP_TABS.includes(tab as AppTab) ? tab as AppTab : undefined;
}
function storedTab(storage?:ViewStorage) {try{return validTab(storage?.getItem(KEY)??null);}catch{return undefined;}}
export function restoreAppTab(search:string, persistent?:ViewStorage, legacySession?:ViewStorage):AppTab {
  return validTab(new URLSearchParams(search).get('tab')) ?? storedTab(persistent) ?? storedTab(legacySession) ?? 'player';
}
export function saveAppTab(tab:AppTab, persistent?:ViewStorage, legacySession?:ViewStorage) {
  for (const storage of [persistent,legacySession]) {try{storage?.setItem(KEY,tab);}catch{/* Storage can be disabled in embedded browsers. */}}
}
