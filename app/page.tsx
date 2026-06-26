"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<AvEvent[]>([]);
  const [selected, setSelected] = useState<AvEvent | null>(null);
  const [detected, setDetected] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [statsData, eventsData] = await Promise.all([
        apiFetch("/api/stats"),
        apiFetch("/api/events?limit=100"),
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
              <p className="subtitle">Live results from Railway API</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={refresh}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <p className="api-banner">API: {typeof window !== "undefined" ? "proxied via Vercel → Railway" : apiUrl}</p>
      {error && <p className="api-banner error">{error}</p>}

      <section className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total Events</span>
          <span className="stat-value">{stats?.total ?? "—"}</span>
        </div>
        <div className="stat-card success">
          <span className="stat-label">Succeeded</span>
          <span className="stat-value">{stats?.succeeded ?? "—"}</span>
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
            {m.detected > 0 && <span className="bool-yes">⚠ {m.detected} detected</span>}
            {m.blocked > 0 && <span className="bool-yes">🛑 {m.blocked} blocked</span>}
          </div>
        ))}
      </section>

      <main className="events-panel">
        <div className="panel-header">
          <h2>Simulation Events</h2>
          <span className="live-indicator">● Live</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Module</th>
                <th>Action</th>
                <th>Status</th>
                <th>Detected</th>
                <th>Blocked</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    No events yet. Run the simulator pointing at the Railway API.
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id} className="clickable" onClick={() => {
                    setSelected(e);
                    setDetected(e.detected);
                    setBlocked(e.blocked);
                  }}>
                    <td>{formatTime(e.created_at)}</td>
                    <td>
                      <span className="module-label">{MODULE_LABELS[e.module] || e.module}</span>
                    </td>
                    <td>{e.action}</td>
                    <td>{statusBadge(e.status)}</td>
                    <td className={e.detected ? "bool-yes" : "bool-no"}>{e.detected ? "Yes" : "No"}</td>
                    <td className={e.blocked ? "bool-yes" : "bool-no"}>{e.blocked ? "Yes" : "No"}</td>
                    <td>{e.error_message ? "⚠ Error" : e.payload ? "📋 Payload" : "—"}</td>
                  </tr>
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
