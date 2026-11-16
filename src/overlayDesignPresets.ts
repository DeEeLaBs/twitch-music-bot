import {DEFAULT_CHAT_OPTIONS, type ChatStyle, type OverlayChatOptions} from './overlayChat.ts';
import {DEFAULT_OVERLAY_OPTIONS, type OverlayOptions} from './overlayOptions.ts';

const CHAT_DESIGN_KEYS = ['showBadges','showTimestamps','showNameColors','showBackground','showEmotes','showOutline','showReplies','highlightMentions','motion','exitMotion','fontSize','fontFamily','nameColor','messageColor','background','opacity','fadeMs'] as const;
const LIGHT = new Set<ChatStyle>(['bevel','handheld','y2k','receipt','brutal','comic','note','sakura']);
export function chatDesignPreset(style:ChatStyle):Partial<OverlayChatOptions> {
  const design:Partial<OverlayChatOptions> = Object.fromEntries(CHAT_DESIGN_KEYS.map(key=>[key,DEFAULT_CHAT_OPTIONS[key]]));
  return {...design,style,...(LIGHT.has(style)?{nameColor:'#44403c',messageColor:'#1c1917',showBackground:false}:{}),...(style==='ashen'?{fontFamily:'"Times New Roman", Georgia, serif',fontSize:22,nameColor:'#d6ba80',messageColor:'#ece7db',background:'#000000',opacity:100,showNameColors:false,showOutline:false,motion:'ember',exitMotion:'ember',fadeMs:180}: {})};
}
function resetWidget(options:OverlayOptions,id:string,fontSize:number) {
  return options.scene ? {...options.scene,widgets:options.scene.widgets.map(widget=>widget.id===id?{...widget,css:'',fontFamily:'',fontSize}:widget)} : undefined;
}
export function applyChatDesignPreset(options:OverlayOptions,style:ChatStyle,widgetId:string):OverlayOptions {
  const preset=chatDesignPreset(style);
  return {...options,chat:{...options.chat,...preset},scene:resetWidget(options,widgetId,preset.fontSize!)};
}
const PLAYER_DESIGN_KEYS=['showPlaybackStatus','showProgress','showArtwork','showRequester','showTime','showSource','showRequesterAvatar','showRequesterBadge','showLogo','showBorder','freePositioning','accent','radius','backgroundOpacity','shadowStrength','logoSize','fontStyle','fontFamily','textAlign','artworkShape','artworkScale','animation','progressStyle','backgroundImageUrl','logoImageUrl','customCss','useMarquee'] as const;
export function resetPlayerDesign(options:OverlayOptions,widgetId:string):OverlayOptions {
  const design=Object.fromEntries(PLAYER_DESIGN_KEYS.map(key=>[key,DEFAULT_OVERLAY_OPTIONS[key]]));
  return {...options,...design,theme:options.layout==='ashen'?'ashen':options.theme,scene:resetWidget(options,widgetId,18)};
}
