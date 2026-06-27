"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { mergeModuleStats, moduleLabel } from "@/lib/modules";

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
};

function statusTag(status: string) {
  const cls =
    status === "success"
      ? "tag tag-ok"
      : status === "blocked"
        ? "tag tag-block"
        : status === "failed"
          ? "tag tag-fail"
          : "tag tag-sim";
  return <span className={cls}>{status}</span>;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString();
}

function formatEventDetail(event: AvEvent): string {
  const payload = event.payload;
  if (payload && typeof payload === "object") {
    const log = payload.display_log;
    const result = payload.display_result;
    if (Array.isArray(log) || typeof result === "string") {
      const lines: string[] = [
        `Action: ${event.action}`,
        `Status: ${event.status}`,
        "",
        "Activity log",
      ];
      if (Array.isArray(log)) {
        for (const line of log) lines.push(`> ${line}`);
      }
      if (typeof result === "string") {
        lines.push("", `Result: ${result}`);
      }
      if (event.error_message) lines.push("", `Error: ${event.error_message}`);
      return lines.join("\n");
    }
  }
  return JSON.stringify(event, null, 2);
}

function getPcName(events: AvEvent[]): string {
  for (const e of events) {
    const h = e.payload?.hostname;
    if (h && typeof h === "string") return h;
  }
  return "Unknown";
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
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const groups = useMemo(() => groupByPc(events), [events]);
  const modules = useMemo(
    () => mergeModuleStats(stats?.by_module),
    [stats?.by_module],
  );

  const refresh = useCallback(async () => {
    try {
      const [statsData, eventsData] = await Promise.all([
        apiFetch("/api/stats"),
        apiFetch("/api/events?limit=500"),
      ]);
      setStats(statsData);
      setEvents(eventsData);
      setError(null);
      setLastSync(new Date());
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

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-block">
          <Image src="/logo.png" alt="SystemPulse" width={52} height={52} className="brand-logo" priority />
          <div className="brand-text">
            <h1>
              System<span>Pulse</span>
            </h1>
            <p>AV research telemetry — one row per endpoint</p>
          </div>
        </div>
        <div className="topbar-right">
          <Link href="/control" className="btn">
            Remote control
          </Link>
          <div className="sync-pill">
            <span className="sync-dot" />
            {lastSync ? lastSync.toLocaleTimeString() : "syncing"}
          </div>
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
          <button className="btn btn-accent" onClick={refresh}>
            Refresh
          </button>
        </div>
      </header>

      {error && <div className="alert">{error}</div>}

      <section className="metrics">
        <div className="metric">
          <div className="metric-label">Endpoints</div>
          <div className="metric-value">{groups.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Total events</div>
          <div className="metric-value">{stats?.total ?? "—"}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Detected</div>
          <div className="metric-value alert-val">{stats?.detected ?? "—"}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Blocked</div>
          <div className="metric-value block-val">{stats?.blocked ?? "—"}</div>
        </div>
      </section>

      <div className="section-head">Simulation modules (15)</div>
      <section className="module-matrix">
        {modules.map((m) => (
          <div key={m.id} className={`mod-cell${m.count > 0 ? " active" : ""}`}>
            <div className="name">{m.label}</div>
            <div className={`meta${m.count > 0 ? " hit" : ""}`}>
              {m.count > 0 ? `${m.count} fired` : "idle"}
            </div>
          </div>
        ))}
      </section>

      <div className="panel">
        <div className="panel-title">Live sessions</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Host</th>
                <th>User</th>
                <th>Started</th>
                <th>Events</th>
                <th>Detected</th>
                <th>Blocked</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    No sessions yet. Run SystemPulse.exe and click Run Health Scan.
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <Fragment key={g.sessionId}>
                    <tr className="clickable group-row" onClick={() => toggleGroup(g.sessionId)}>
                      <td className="expand-cell">{expanded.has(g.sessionId) ? "▼" : "▶"}</td>
                      <td>
                        <span className="pc-name">{g.pcName}</span>
                      </td>
                      <td>{g.username}</td>
                      <td>{formatTime(g.startedAt)}</td>
                      <td>{g.events.length}</td>
                      <td className={g.detected ? "yes" : "no"}>
                        {g.detected > 0 ? g.detected : "—"}
                      </td>
                      <td className={g.blocked ? "yes" : "no"}>
                        {g.blocked > 0 ? g.blocked : "—"}
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
                            <span className="mod-tag">{moduleLabel(e.module)}</span>
                          </td>
                          <td className="no">—</td>
                          <td>{formatTime(e.created_at)}</td>
                          <td>{e.action}</td>
                          <td>{statusTag(e.status)}</td>
                          <td className={e.detected ? "yes" : "no"}>{e.detected ? "yes" : "—"}</td>
                          <td className={e.blocked ? "yes" : "no"}>{e.blocked ? "yes" : "—"}</td>
                        </tr>
                      ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <aside className="drawer">
          <div className="drawer-head">
            <h3>{moduleLabel(selected.module)}</h3>
            <button className="close-btn" onClick={() => setSelected(null)} aria-label="Close">
              ✕
            </button>
          </div>
          <pre>{formatEventDetail(selected)}</pre>
          <div className="drawer-foot">
            <label>
              <input type="checkbox" checked={detected} onChange={(e) => setDetected(e.target.checked)} />
              Mark detected
            </label>
            <label>
              <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />
              Mark blocked
            </label>
            <button className="btn btn-accent" onClick={saveDetection}>
              Save
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
