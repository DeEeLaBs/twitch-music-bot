import streamDeck, { SingletonAction, type DialAction, type DialDownEvent, type DialRotateEvent, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from '@elgato/streamdeck';
import WebSocket from 'ws';
import { BotClient, type SocketLike } from './core/botClient.ts';
import { ACTIONS, ConfirmGate, VolumeController, type ActionDefinition } from './core/commands.ts';
import { FlashTracker } from './core/flash.ts';
import { dialFeedback, renderKey, svgToDataUri } from './core/render.ts';
import { withVolume } from './core/state.ts';

// Thin glue between the Stream Deck SDK and the (fully unit-tested) core in ./core.
// Everything here only forwards events and draws images; decisions live in the core.

const UUID_PREFIX = 'com.twitchmusicbot.';
const CONFIRM_WINDOW_MS = 3000;
const DIAL_STEP = 2; // volume percent per dial tick
const VOLUME_HOLD_MS = 1500; // how long the asked-for volume stays on display after the bot has answered

const client = new BotClient({ createSocket: url => new WebSocket(url) as unknown as SocketLike });
const confirmGate = new ConfirmGate(CONFIRM_WINDOW_MS);
const volume = new VolumeController(client, () => client.state.playback.volume, { holdMs: VOLUME_HOLD_MS });
const flash = new FlashTracker();

// Album art is downloaded once per URL (through the bot's proxy) and kept for a short list of recent songs.
const artCache = new Map<string, string | null>();
function artFor(url: string | undefined, onLoaded: () => void): string | null {
  if (!url) return null;
  if (artCache.has(url)) return artCache.get(url) ?? null;
  artCache.set(url, null);
  if (artCache.size > 8) artCache.delete(artCache.keys().next().value as string);
  void client.fetchArtwork(url).then(data => { artCache.set(url, data); if (data) onLoaded(); });
  return null;
}

const keyActions: BotKeyAction[] = [];

// The bot reports progress about once a second; only send an image to the device when it actually changed.
const lastDrawn = new Map<string, string>();

// The SDK's action classes are generic over per-action settings, which this plugin does not use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyKey = KeyAction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDial = DialAction<any>;

// What the keys display: the bot's state, except that the volume is the one the user just asked for while the bot
// (and the player, which may still report the old value for a moment) catches up. Without this the number springs back and forth.
const viewState = () => withVolume(client.state, volume.shownVolume());

let volumeRefreshTimer: ReturnType<typeof setTimeout> | undefined;
/** Redraws everything that shows the volume now, and once more when the asked-for volume stops being held. */
function refreshVolumeViews(): void {
  for (const action of keyActions) action.redraw();
  dial.redraw();
  clearTimeout(volumeRefreshTimer);
  volumeRefreshTimer = setTimeout(() => { for (const action of keyActions) action.redraw(); dial.redraw(); }, VOLUME_HOLD_MS + 50);
}

function drawKey(spec: ActionDefinition, key: AnyKey, rerender: () => void): void {
  const art = spec.id === 'now-playing' ? artFor(client.state.playback.currentSong?.albumArtUrl, rerender) : null;
  const image = svgToDataUri(renderKey(spec.id, viewState(), { online: client.connected, armed: confirmGate.isArmed(key.id, Date.now()), flash: flash.isActive(key.id, Date.now()), art }));
  if (lastDrawn.get(key.id) === image) return;
  lastDrawn.set(key.id, image);
  void key.setImage(image).catch((error: unknown) => { lastDrawn.delete(key.id); streamDeck.logger.warn(`setImage failed: ${String(error)}`); });
}

class BotKeyAction extends SingletonAction {
  override readonly manifestId: string;
  private readonly spec: ActionDefinition;

  constructor(spec: ActionDefinition) {
    super();
    this.spec = spec;
    this.manifestId = UUID_PREFIX + spec.id;
  }

  // One pending "redraw later" per key and purpose, so mashing a key restarts its timer instead of stacking new ones.
  private readonly redrawTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private redrawLater(timerId: string, ms: number): void {
    clearTimeout(this.redrawTimers.get(timerId));
    this.redrawTimers.set(timerId, setTimeout(() => { this.redrawTimers.delete(timerId); this.redraw(); }, ms));
  }

  /** A short green flash instead of the SDK's checkmark, which covers the key for about a second. */
  private flashNow(keyId: string): void {
    flash.trigger(keyId, Date.now());
    this.redrawLater(`flash:${keyId}`, flash.duration + 20);
  }

  redraw(): void {
    for (const action of this.actions) {
      if (!action.isKey()) continue;
      drawKey(this.spec, action, () => this.redraw());
    }
  }

  override onWillAppear(ev: WillAppearEvent): void {
    if (!ev.action.isKey()) return;
    lastDrawn.delete(ev.action.id); // the key (re)appeared on the device, so it must be drawn again
    drawKey(this.spec, ev.action, () => this.redraw());
  }

  override onWillDisappear(ev: WillDisappearEvent): void { lastDrawn.delete(ev.action.id); }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const key = ev.action;
    if (!client.connected) { await key.showAlert(); return; }
    if (this.spec.confirm && !confirmGate.check(key.id, Date.now())) {
      this.redraw(); // shows "Press again"
      this.redrawLater(`confirm:${key.id}`, CONFIRM_WINDOW_MS + 50);
      return;
    }
    const pending = this.spec.run(client, client.state, { volume });
    // Volume keys answer at once: the requested volume is shown and the key flashes before the bot has replied.
    if (this.spec.instant) { this.flashNow(key.id); refreshVolumeViews(); }
    const result = await pending;
    if (result.ok) {
      if (!this.spec.instant) { this.flashNow(key.id); this.redraw(); }
      return;
    }
    flash.clear(key.id);
    streamDeck.logger.warn(`${this.spec.id} failed: ${result.error}`);
    await key.showAlert();
    if (this.spec.instant) refreshVolumeViews(); else this.redraw();
  }
}

class VolumeDialAction extends SingletonAction {
  override readonly manifestId = UUID_PREFIX + 'volume-dial';

  redraw(): void {
    const feedback = dialFeedback(viewState(), client.connected);
    for (const action of this.actions) {
      if (action.isDial()) void (action as AnyDial).setFeedback(feedback).catch((error: unknown) => streamDeck.logger.warn(`setFeedback failed: ${String(error)}`));
    }
  }

  override onWillAppear(ev: WillAppearEvent): void {
    if (ev.action.isDial()) void (ev.action as AnyDial).setFeedback(dialFeedback(viewState(), client.connected));
  }

  override async onDialRotate(ev: DialRotateEvent): Promise<void> {
    if (!client.connected) return;
    const pending = volume.nudge(ev.payload.ticks * DIAL_STEP);
    refreshVolumeViews(); // the new volume is shown straight away, not after the round trip
    await pending;
    refreshVolumeViews();
  }

  override async onDialDown(_ev: DialDownEvent): Promise<void> {
    if (!client.connected) return;
    const pending = volume.toggleMute();
    refreshVolumeViews();
    await pending;
    refreshVolumeViews();
  }
}

const dial = new VolumeDialAction();
for (const spec of ACTIONS) {
  const action = new BotKeyAction(spec);
  keyActions.push(action);
  streamDeck.actions.registerAction(action);
}
streamDeck.actions.registerAction(dial);

// Redraw everything whenever the bot's state or connection changes. Unchanged images are skipped in drawKey.
client.onChange(() => {
  for (const action of keyActions) action.redraw();
  dial.redraw();
});

client.start();
await streamDeck.connect();
