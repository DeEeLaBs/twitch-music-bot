import { useEffect, useState } from 'react';
import type { AppState, QueueDelta, ServerToClientMessage } from '../types.ts';

function isServerMessage(value: unknown): value is ServerToClientMessage {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return type === 'playlist:track_added' || type === 'state' || type === 'patch' || type === 'queue_delta' || type === 'log' || type === 'overlay_update';
}

export function useBotState() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionLost, setConnectionLost] = useState(false);
  const [initialError, setInitialError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;
    let delay = 1000;
    let receivedSocketState = false;
    const controller = new AbortController();

    fetch('/api/state', { signal: controller.signal, cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() as Promise<AppState>; })
      .then((data) => { if (!stopped && !receivedSocketState) { setState(data); setLoading(false); setInitialError(null); } })
      .catch((err: unknown) => { if (!stopped && !receivedSocketState) { console.error('Failed to load initial bot state:', err); setInitialError('BOT_API_UNREACHABLE'); setLoading(false); } });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const requestFullState = () => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'get_state' })); };

    const applyQueueDelta = (prev: AppState, delta: QueueDelta): AppState => {
      const queue = [...prev.queue];
      if (delta.op === 'replace') return { ...prev, queue: delta.queue };
      if (delta.op === 'add') {
        if (queue.some((track) => track.id === delta.track.id)) return prev;
        queue.splice(Math.max(0, Math.min(delta.index, queue.length)), 0, delta.track);
        return { ...prev, queue };
      }
      if (delta.op === 'remove') return { ...prev, queue: queue.filter((track) => track.id !== delta.trackId) };
      if (delta.op === 'move') {
        const from = queue.findIndex((track) => track.id === delta.trackId);
        if (from < 0) { requestFullState(); return prev; }
        const [track] = queue.splice(from, 1);
        if (!track) { requestFullState(); return prev; }
        queue.splice(Math.max(0, Math.min(delta.newIndex, queue.length)), 0, track);
        return { ...prev, queue };
      }
      return prev;
    };

    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => { delay = 1000; setConnectionLost(false); };
      ws.onclose = () => { if (!stopped) { setConnectionLost(true); timer = setTimeout(connect, delay); delay = Math.min(delay * 2, 15000); } };
      ws.onmessage = (event) => {
        if (stopped) return;
        try {
          const parsed: unknown = JSON.parse(String(event.data));
          if (!isServerMessage(parsed)) { console.warn('Unknown WS message ignored'); return; }
          const payload = parsed;
          if (payload.type === 'playlist:track_added') window.dispatchEvent(new CustomEvent('playlist:track_added', {detail: payload.data}));
          else if (payload.type === 'state') { receivedSocketState = true; setState(payload.data); setLoading(false); setInitialError(null); }
          else if (payload.type === 'patch') setState((prev) => prev ? { ...prev, ...payload.data } : prev);
          else if (payload.type === 'overlay_update') setState((prev) => prev ? { ...prev, activeOverlay: payload.data } : prev);
          else if (payload.type === 'queue_delta') setState((prev) => prev ? applyQueueDelta(prev, payload.data) : prev);
          else if (payload.type === 'log') setState((prev) => {
            if (!prev || prev.logs.some((log) => log.id === payload.data.id)) return prev;
            return { ...prev, logs: [payload.data, ...prev.logs].slice(0, 100) };
          });
        } catch (error) { console.warn('WS message parse error:', error); }
      };
    };
    connect();
    return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); ws?.close(); ws = null; };
  }, []);

  return { state, loading, connectionLost, initialError };
}
