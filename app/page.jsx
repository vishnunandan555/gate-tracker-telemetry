'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'gate-tracker-telemetry-dashboard-key';

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function shortDate(value) {
  if (!value) {
    return '';
  }

  const [year, month, day] = value.split('-');
  return `${month}/${day}`;
}

function MetricCard({ label, value, delta }) {
  return (
    <article className="metric">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="delta">{delta}</div>
    </article>
  );
}

function StackList({ title, items }) {
  const max = Math.max(...items.map((item) => Number(item.count || 0)), 0);

  return (
    <div className="section">
      <div>
        <p className="section-kicker">{title}</p>
        <h3>{title}</h3>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">No data for today yet.</div>
      ) : (
        <div className="stack-grid">
          {items.map((item) => {
            const percent = max ? Math.max((Number(item.count || 0) / max) * 100, 6) : 0;

            return (
              <div className="stack" key={item.label}>
                <div className="stack-head">
                  <span>{item.label}</span>
                  <span className="token">{formatNumber(item.count)}</span>
                </div>
                <div className="stack-track">
                  <div className="stack-fill" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [inputKey, setInputKey] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    if (saved) {
      setInputKey(saved);
      setAccessKey(saved);
    }
  }, []);

  useEffect(() => {
    if (!accessKey) {
      return undefined;
    }

    let mounted = true;

    const refresh = async () => {
      setBusy(true);
      setError('');

      try {
        const headers = {
          Authorization: `Bearer ${accessKey}`,
        };

        const [healthResponse, statsResponse] = await Promise.all([
          fetch('/api/health', { cache: 'no-store' }),
          fetch('/api/stats', { cache: 'no-store', headers }),
        ]);

        const healthJson = await healthResponse.json();
        const statsJson = await statsResponse.json();

        if (!mounted) {
          return;
        }

        setHealth(healthJson);

        if (!statsResponse.ok) {
          throw new Error(statsJson.error || 'Dashboard access failed.');
        }

        setStats(statsJson);
        setMessage(`Updated ${formatDate(statsJson.updated_at)}.`);
      } catch (fetchError) {
        if (mounted) {
          setError(fetchError.message || 'Unable to load dashboard.');
        }
      } finally {
        if (mounted) {
          setBusy(false);
        }
      }
    };

    refresh();
    const timer = setInterval(refresh, 30000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [accessKey]);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = inputKey.trim();

    if (!trimmed) {
      setError('Enter a dashboard key first.');
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, trimmed);
    setAccessKey(trimmed);
    setError('');
  }

  function handleReset() {
    window.localStorage.removeItem(STORAGE_KEY);
    setInputKey('');
    setAccessKey('');
    setStats(null);
    setHealth(null);
    setMessage('');
    setError('');
  }

  if (!accessKey) {
    return (
      <main>
        <div className="shell">
          <div className="topbar">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true" />
              <div>
                <h1>Gate Tracker Telemetry</h1>
                <p>Private developer dashboard</p>
              </div>
            </div>

            <span className="badge">
              <strong>Vercel ready</strong>
              <span>Redis on serverless, SQLite locally</span>
            </span>
          </div>

          <div className="hero-grid">
            <section className="hero">
              <span className="eyebrow">Developer access only</span>
              <h2>Sign in with the dashboard key.</h2>
              <p>
                This landing page is intentionally locked. Enter the stats key to open the
                analytics view, inspect pings, and monitor the daily active user trail.
              </p>

              <ul className="feature-list">
                <li>
                  <span className="dot" aria-hidden="true" />
                  <span>Daily dedupe is based on a SHA-256 token, so one user counts once per UTC day.</span>
                </li>
                <li>
                  <span className="dot" aria-hidden="true" />
                  <span>The same app works locally with SQLite and on Vercel with Upstash Redis or Vercel KV.</span>
                </li>
                <li>
                  <span className="dot" aria-hidden="true" />
                  <span>The dashboard refreshes automatically and keeps the auth key in your browser only.</span>
                </li>
              </ul>
            </section>

            <aside className="login-aside">
              <form className="login-card" onSubmit={handleSubmit}>
                <div>
                  <p className="section-kicker">Protected dashboard</p>
                  <h2>Enter access key</h2>
                </div>

                <div className="field">
                  <label htmlFor="dashboard-key">Stats API key</label>
                  <div className="input-row">
                    <input
                      id="dashboard-key"
                      type="password"
                      placeholder="Paste the dashboard key here"
                      value={inputKey}
                      onChange={(event) => setInputKey(event.target.value)}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button className="button" type="submit">
                      Open dashboard
                    </button>
                  </div>
                  <div className="field-hint">The key never leaves this device except in API headers.</div>
                </div>

                {error ? <div className="error-banner">{error}</div> : null}

                <div className="hint-grid">
                  <div className="hint-card">
                    <strong>Vercel hosting</strong>
                    <span className="subtle">Use Vercel KV or Upstash Redis for production. SQLite is for local/self-hosted only.</span>
                  </div>
                  <div className="hint-card">
                    <strong>Public ingest</strong>
                    <span className="subtle">The ping endpoint stays public so the Flutter client can report usage without dashboard credentials.</span>
                  </div>
                </div>
              </form>
            </aside>
          </div>
        </div>
      </main>
    );
  }

  const trend = stats?.trend || [];
  const maxTrend = Math.max(...trend.map((item) => Number(item.count || 0)), 0);

  return (
    <main>
      <div className="shell dashboard">
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true" />
            <div>
              <h1>Gate Tracker Telemetry</h1>
              <p>Developer analytics and event stream</p>
            </div>
          </div>

          <div className="status-row">
            <span className="badge">
              <strong>{stats?.provider || 'sqlite'}</strong>
              <span>storage provider</span>
            </span>
            <button className="button-ghost" type="button" onClick={handleReset}>
              Change key
            </button>
          </div>
        </div>

        <section className="status-card">
          <div>
            <p className="section-kicker">Dashboard status</p>
            <div className="headline">
              <div>
                <h2>Key accepted. Analytics unlocked.</h2>
                <p className="subtle">{message || 'Fetching the latest telemetry snapshot.'}</p>
              </div>
            </div>
          </div>

          <div className="status-row">
            <span className="status-pill">
              <span className={`status-dot ${health?.status === 'healthy' ? '' : 'off'}`} />
              <span>{health?.status || 'checking'}</span>
            </span>
            <span className="status-pill">
              <span>Updated</span>
              <span className="token">{formatDate(stats?.updated_at)}</span>
            </span>
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="dashboard-grid">
          <MetricCard
            label="Daily active users"
            value={formatNumber(stats?.daily_active_users)}
            delta="Unique SHA-256 tokens for the current UTC day"
          />
          <MetricCard
            label="Accepted pings"
            value={formatNumber(stats?.accepted_pings)}
            delta="Events accepted after dedupe checks"
          />
          <MetricCard
            label="Recent events"
            value={formatNumber(stats?.recent_pings?.length || 0)}
            delta="Latest accepted telemetry rows shown below"
          />
          <MetricCard
            label="Health"
            value={health?.database === 'connected' ? 'Live' : 'Down'}
            delta={busy ? 'Refreshing now' : 'Automatic refresh every 30 seconds'}
          />

          <section className="chart-card section">
            <div>
              <p className="section-kicker">7 day trend</p>
              <h3>Daily active users</h3>
            </div>

            {trend.length === 0 ? (
              <div className="empty-state">No trend data yet.</div>
            ) : (
              <div className="chart" aria-label="Daily active user chart">
                {trend.map((item) => {
                  const height = maxTrend ? Math.max((Number(item.count || 0) / maxTrend) * 100, 8) : 0;

                  return (
                    <div className="bar-wrap" key={item.date}>
                      <div className="bar-track">
                        <div className="bar" style={{ height: `${height}%` }} />
                      </div>
                      <div className="bar-meta">
                        <span>{shortDate(item.date)}</span>
                        <span>{formatNumber(item.count)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="side-card section">
            <div>
              <p className="section-kicker">Breakdown</p>
              <h3>Version and platform mix</h3>
            </div>

            <div className="grid-two">
              <StackList title="Versions" items={stats?.versions || []} />
              <StackList title="Platforms" items={stats?.platforms || []} />
            </div>
          </aside>

          <section className="table-card section" style={{ gridColumn: '1 / -1' }}>
            <div>
              <p className="section-kicker">Latest pings</p>
              <h3>Accepted telemetry stream</h3>
            </div>

            {stats?.recent_pings?.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Token</th>
                    <th>Version</th>
                    <th>Platform</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_pings.map((row) => (
                    <tr key={`${row.daily_token}-${row.created_at}`}>
                      <td>{formatDate(row.created_at)}</td>
                      <td className="token">{row.daily_token}</td>
                      <td>{row.version}</td>
                      <td>{row.platform}</td>
                      <td>{row.created_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">No accepted pings yet.</div>
            )}

            <div className="footer-note">
              Dashboard login uses the stats key only. The telemetry endpoint stays separate and can remain public for clients.
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}