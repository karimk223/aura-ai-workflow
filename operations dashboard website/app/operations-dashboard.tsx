'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type View = 'all' | 'raw' | 'content';
type Theme = 'light' | 'dark';
type StageKey =
  | 'received'
  | 'processed'
  | 'approved'
  | 'rejected'
  | 'aiApproved'
  | 'aiRejected'
  | 'creatorApproved'
  | 'creatorRejected'
  | 'designerApproved'
  | 'designerRejected';

interface Piece {
  id: string;
  name: string;
  area: 'raw' | 'content';
  stage: StageKey;
  updatedAt: string | null;
  driveUrl: string | null;
}

interface DashboardData {
  generatedAt: string;
  counts: Record<StageKey, number>;
  pieces: Piece[];
  connection?: 'live' | 'pending';
  message?: string;
}

interface Props {
  operatorName: string;
  previewMode: boolean;
}

const stages: Array<{
  key: StageKey;
  label: string;
  short: string;
  area: 'raw' | 'content';
  color: string;
}> = [
  { key: 'received', label: 'Received', short: 'IN', area: 'raw', color: '#b98a36' },
  { key: 'processed', label: 'Processed', short: 'PR', area: 'raw', color: '#6f7783' },
  { key: 'approved', label: 'Approved', short: 'OK', area: 'raw', color: '#3f7a5c' },
  { key: 'rejected', label: 'Rejected', short: 'NO', area: 'raw', color: '#a34d57' },
  { key: 'aiApproved', label: 'AI Approved', short: 'AI', area: 'content', color: '#a97a2c' },
  { key: 'aiRejected', label: 'AI Rejected', short: 'AI', area: 'content', color: '#7e5b78' },
  { key: 'creatorApproved', label: 'Creator Approved', short: 'CR', area: 'content', color: '#40776b' },
  { key: 'creatorRejected', label: 'Creator Rejected', short: 'CR', area: 'content', color: '#b2604a' },
  { key: 'designerApproved', label: 'Designer Approved', short: 'DA', area: 'content', color: '#3f6283' },
  { key: 'designerRejected', label: 'Designer Rejected', short: 'DA', area: 'content', color: '#6a5a83' },
];

const emptyCounts = Object.fromEntries(
  stages.map((stage) => [stage.key, 0]),
) as Record<StageKey, number>;

function formatTime(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  }).format(date);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={spinning ? 'spin' : ''} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M6.1 8.3a7 7 0 0 1 11.4-1.6L20 9M4 15l2.5 2.3a7 7 0 0 0 11.4-1.6" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  return theme === 'light' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
    </svg>
  );
}

export default function OperationsDashboard({ operatorName, previewMode }: Props) {
  const [data, setData] = useState<DashboardData>({
    generatedAt: new Date().toISOString(),
    counts: emptyCounts,
    pieces: [],
    connection: 'pending',
  });
  const [view, setView] = useState<View>('all');
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = window.localStorage.getItem('aura-dashboard-theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [query, setQuery] = useState('');
  const [activeStage, setActiveStage] = useState<StageKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard', { cache: 'no-store' });
      const payload = (await response.json()) as DashboardData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load dashboard data.');
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial client-side data hydration is intentionally started after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('aura-dashboard-theme', theme);
  }, [theme]);

  const visibleStages = useMemo(
    () => stages.filter((stage) => view === 'all' || stage.area === view),
    [view],
  );

  const total = visibleStages.reduce(
    (sum, stage) => sum + (data.counts[stage.key] ?? 0),
    0,
  );

  const chartMax = Math.max(
    1,
    ...visibleStages.map((stage) => data.counts[stage.key] ?? 0),
  );

  const filteredPieces = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.pieces.filter((piece) => {
      if (view !== 'all' && piece.area !== view) return false;
      if (activeStage && piece.stage !== activeStage) return false;
      if (!normalized) return true;
      const label = stages.find((stage) => stage.key === piece.stage)?.label ?? '';
      return piece.name.toLowerCase().includes(normalized) || label.toLowerCase().includes(normalized);
    });
  }, [activeStage, data.pieces, query, view]);

  const donut = useMemo(() => {
    if (total === 0) return 'conic-gradient(var(--chart-empty) 0 100%)';
    let cursor = 0;
    const slices = visibleStages.map((stage) => {
      const start = cursor;
      cursor += ((data.counts[stage.key] ?? 0) / total) * 100;
      return `${stage.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${slices.join(', ')})`;
  }, [data.counts, total, visibleStages]);

  const completion = data.counts.designerApproved + data.counts.designerRejected;
  const attention =
    data.counts.rejected +
    data.counts.aiRejected +
    data.counts.creatorRejected +
    data.counts.designerRejected;

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          {/* vinext serves this local brand asset directly without image-loader overhead. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aura-logo.png" alt="AURA by Nada" />
          <span className="brand-divider" />
          <div><strong>Operations</strong><small>Production dashboard</small></div>
        </div>
        <div className="top-actions">
          <span className={`connection ${data.connection === 'live' ? 'live' : ''}`}>
            <i />{data.connection === 'live' ? 'Drive connected' : 'Connection pending'}
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            <ThemeIcon theme={theme} />
          </button>
          <div className="operator">
            <span>{operatorName.slice(0, 1).toUpperCase()}</span>
            <div><strong>{operatorName}</strong><small>{previewMode ? 'Preview access' : 'Dashboard owner'}</small></div>
          </div>
        </div>
      </header>

      <section className="workspace">
        <div className="intro">
          <div>
            <span className="eyebrow">AURA production intelligence</span>
            <h1>Every piece, one clear view.</h1>
            <p>Track movement from raw intake to the final designer decision.</p>
          </div>
          <div className="freshness">
            <span>Last updated</span>
            <strong>{formatTime(data.generatedAt)}</strong>
            <button type="button" onClick={() => void loadDashboard()} disabled={loading}>
              <RefreshIcon spinning={loading} />{loading ? 'Refreshing' : 'Refresh data'}
            </button>
          </div>
        </div>

        <div className="control-row">
          <div className="segmented" aria-label="Dashboard category">
            {(['all', 'raw', 'content'] as View[]).map((option) => (
              <button
                type="button"
                className={view === option ? 'active' : ''}
                key={option}
                onClick={() => { setView(option); setActiveStage(null); }}
              >
                {option === 'all' ? 'All pipeline' : option === 'raw' ? 'Raw Footage' : 'Content'}
              </button>
            ))}
          </div>
          <label className="search">
            <SearchIcon />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pieces or stages" aria-label="Search pieces or stages" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
          </label>
        </div>

        {error && <div className="notice error">{error}</div>}
        {!error && data.connection === 'pending' && <div className="notice">{data.message ?? 'Live data connection pending.'}</div>}

        <section className="summary-grid" aria-label="Pipeline summary">
          <article><span>Total in view</span><strong>{total}</strong><small>{visibleStages.length} active stages</small></article>
          <article><span>Final decisions</span><strong>{completion}</strong><small>Approved or rejected by designer</small></article>
          <article><span>Needs attention</span><strong>{attention}</strong><small>Across all rejection stages</small></article>
          <article className="progress-summary">
            <span>Designer approval share</span>
            <strong>{completion ? Math.round((data.counts.designerApproved / completion) * 100) : 0}%</strong>
            <div><i style={{ width: `${completion ? (data.counts.designerApproved / completion) * 100 : 0}%` }} /></div>
          </article>
        </section>

        <section className="analytics-grid">
          <article className="panel">
            <div className="panel-heading">
              <div><span className="panel-kicker">Volume</span><h2>Pipeline by stage</h2></div>
              <span>{total} pieces</span>
            </div>
            <div className="bar-chart">
              {visibleStages.map((stage) => {
                const value = data.counts[stage.key] ?? 0;
                return (
                  <button
                    type="button"
                    key={stage.key}
                    className={activeStage === stage.key ? 'selected' : ''}
                    onClick={() => setActiveStage(activeStage === stage.key ? null : stage.key)}
                    aria-label={`Filter by ${stage.label}: ${value}`}
                  >
                    <span className="bar-value">{value}</span>
                    <span className="bar-track"><i style={{ height: `${Math.max(value ? 10 : 2, (value / chartMax) * 100)}%`, background: stage.color }} /></span>
                    <small>{stage.label}</small>
                  </button>
                );
              })}
            </div>
          </article>

          <article className="panel distribution">
            <div className="panel-heading">
              <div><span className="panel-kicker">Distribution</span><h2>Share of pipeline</h2></div>
              <span>{view === 'all' ? 'All areas' : view === 'raw' ? 'Raw Footage' : 'Content'}</span>
            </div>
            <div className="donut-wrap">
              <div className="donut" style={{ background: donut }}><div><strong>{total}</strong><span>Total</span></div></div>
              <div className="legend">
                {visibleStages.map((stage) => {
                  const value = data.counts[stage.key] ?? 0;
                  const percentage = total ? Math.round((value / total) * 100) : 0;
                  return (
                    <button type="button" key={stage.key} className={activeStage === stage.key ? 'selected' : ''} onClick={() => setActiveStage(activeStage === stage.key ? null : stage.key)}>
                      <i style={{ background: stage.color }} /><span>{stage.label}</span><strong>{value}</strong><small>{percentage}%</small>
                    </button>
                  );
                })}
              </div>
            </div>
          </article>
        </section>

        {(['raw', 'content'] as const).map((area) => {
          if (view !== 'all' && view !== area) return null;
          const areaStages = stages.filter((stage) => stage.area === area);
          return (
            <section className="stage-section" key={area}>
              <div className="section-title">
                <span>{area === 'raw' ? '01' : '02'}</span>
                <div>
                  <h2>{area === 'raw' ? 'Raw Footage' : 'Content'}</h2>
                  <p>{area === 'raw' ? 'Intake and preparation pipeline' : 'AI, creator, and designer decisions'}</p>
                </div>
              </div>
              <div className={`stage-grid ${area}`}>
                {areaStages.map((stage) => (
                  <button type="button" key={stage.key} className={activeStage === stage.key ? 'stage-card active' : 'stage-card'} onClick={() => setActiveStage(activeStage === stage.key ? null : stage.key)}>
                    <span className="stage-glyph" style={{ color: stage.color }}>{stage.short}</span>
                    <span><small>{stage.label}</small><strong>{data.counts[stage.key] ?? 0}</strong></span>
                    <i style={{ background: stage.color }} />
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        <section className="pieces-panel">
          <div className="panel-heading">
            <div><span className="panel-kicker">Piece locator</span><h2>Current pipeline position</h2></div>
            <div className="result-count">
              {activeStage && <button type="button" onClick={() => setActiveStage(null)}>Clear stage filter</button>}
              <span>{filteredPieces.length} results</span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Piece</th><th>Area</th><th>Current stage</th><th>Updated</th><th aria-label="Google Drive link" /></tr></thead>
              <tbody>
                {filteredPieces.map((piece) => {
                  const stage = stages.find((item) => item.key === piece.stage)!;
                  return (
                    <tr key={`${piece.stage}-${piece.id}`}>
                      <td><span className="piece-avatar">{piece.name.slice(0, 2).toUpperCase()}</span><strong>{piece.name}</strong></td>
                      <td>{piece.area === 'raw' ? 'Raw Footage' : 'Content'}</td>
                      <td><span className="status-pill"><i style={{ background: stage.color }} />{stage.label}</span></td>
                      <td>{formatTime(piece.updatedAt)}</td>
                      <td>{piece.driveUrl && <a href={piece.driveUrl} target="_blank" rel="noreferrer">Open Drive ↗</a>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && filteredPieces.length === 0 && (
              <div className="empty-state"><span>0</span><h3>No pieces match this view</h3><p>Adjust the category, stage filter, or search.</p></div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
