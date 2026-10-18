/**
 * Nachrichtenweg zwischen Fenstern und Geräten.
 *  - BroadcastChannel: Fenster im selben Browser (Zweitfenster auf weiteren Bildschirmen)
 *  - WebSocket: andere Geräte im LAN (z. B. Tablet), nur wenn das Spiel über den LAN-Server
 *    (server/lan.mjs) ausgeliefert wird. Der Server leitet jede Nachricht an alle anderen Geräte weiter.
 * Beide Wege tragen dieselben Nachrichten; ist kein LAN-Server da, bleibt es beim BroadcastChannel.
 */

export const WS_PATH = '/__sync';

export class SyncBus<M> {
  private bc: BroadcastChannel | null = null;
  private ws: WebSocket | null = null;
  private handlers = new Set<(m: M) => void>();
  private retry = 0;
  private everConnected = false;
  private closed = false;
  /** Anzahl anderer Geräte am LAN-Server (vom Server gemeldet) */
  peers = 0;
  onStatus: (() => void) | null = null;

  constructor(name: string, useWebSocket: boolean) {
    if (typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel(name);
      this.bc.onmessage = (ev) => this.deliver(ev.data as M);
    }
    if (useWebSocket) this.connect();
  }

  get lanConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private deliver(m: M) {
    for (const h of this.handlers) h(m);
  }

  private connect() {
    if (this.closed || typeof WebSocket === 'undefined' || typeof location === 'undefined') return;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.everConnected = true;
      this.retry = 0;
      this.onStatus?.();
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data));
        if (data && data.__lan === 'peers') {
          this.peers = Number(data.count) || 0;
          this.onStatus?.();
          return;
        }
        this.deliver(data as M);
      } catch {
        /* ungültige Nachricht ignorieren */
      }
    };
    ws.onclose = () => {
      this.ws = null;
      this.peers = 0;
      this.onStatus?.();
      // Ohne LAN-Server (z. B. "npm run dev") nicht endlos versuchen
      if (!this.everConnected && this.retry >= 2) return;
      const wait = Math.min(10_000, 1000 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
  }

  post(m: M, opts: { lan?: boolean } = {}) {
    this.bc?.postMessage(m);
    if (opts.lan !== false && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** Nur an andere Geräte (WebSocket), z. B. gedrosselte Zustandsmeldungen */
  postLan(m: M) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  postLocal(m: M) {
    this.bc?.postMessage(m);
  }

  on(h: (m: M) => void): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  close() {
    this.closed = true;
    this.bc?.close();
    this.ws?.close();
  }
}
