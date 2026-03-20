'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import {
  tester,
  profiles,
  type TesterConnectResult,
  type TesterExtractResult,
  type PlanTestResult,
  type ComparisonItem,
  type Profile,
} from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  match: 'text-[var(--success)]',
  partial: 'text-[var(--warning)]',
  mismatch: 'text-[var(--error)]',
  'missing-in-ciq': 'text-[var(--error)]',
  'extra-in-ciq': 'text-[var(--text-muted)]',
  'not-applicable': 'text-[var(--text-muted)]',
};

const STATUS_BG: Record<string, string> = {
  match: 'bg-[var(--success)]/10 border-[var(--success)]/20',
  partial: 'bg-[var(--warning)]/10 border-[var(--warning)]/20',
  mismatch: 'bg-[var(--error)]/10 border-[var(--error)]/20',
  'missing-in-ciq': 'bg-[var(--error)]/10 border-[var(--error)]/20',
  'extra-in-ciq': 'bg-[var(--bg-card)] border-[var(--border)]',
  'not-applicable': 'bg-[var(--bg-card)] border-[var(--border)]',
};

const STATUS_LABELS: Record<string, string> = {
  match: 'Match',
  partial: 'Partial',
  mismatch: 'Mismatch',
  'missing-in-ciq': 'Missing in CIQ',
  'extra-in-ciq': 'Extra in CIQ',
  'not-applicable': 'N/A',
};

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--error)';
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={4} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.25} fontWeight="bold">{score}%</text>
    </svg>
  );
}

export default function TesterPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { data: savedProfiles } = useSWR<Profile[]>('profiles', () => profiles.list());

  // Connection state
  const [apiToken, setApiToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<TesterConnectResult | null>(null);

  // Extraction state
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState<TesterExtractResult | null>(null);

  // Comparison state
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<PlanTestResult | null>(null);

  // Profile save
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileName, setProfileName] = useState('');

  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!apiToken.trim()) { setError('API token is required'); return; }
    setConnecting(true);
    setError(null);
    setConnection(null);
    setExtraction(null);
    setComparison(null);
    try {
      const result = await tester.connect(apiToken.trim(), baseUrl.trim() || undefined);
      setConnection(result);
      if (!result.connected) setError(result.error || 'Connection failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    setError(null);
    try {
      const result = await tester.extract(apiToken.trim(), baseUrl.trim() || undefined);
      setExtraction(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const handleCompare = async () => {
    if (!extraction || selectedPlans.length === 0) {
      setError('Select at least one plan to compare');
      return;
    }
    setComparing(true);
    setError(null);
    try {
      const result = await tester.compare(projectId, extraction, selectedPlans);
      setComparison(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return;
    setSavingProfile(true);
    try {
      await profiles.save(profileName.trim(), undefined, {
        apiToken: apiToken.trim(),
        baseUrl: baseUrl.trim() || undefined,
      });
      setProfileName('');
    } catch {}
    setSavingProfile(false);
  };

  const handleLoadProfile = async (id: string) => {
    try {
      const p = await profiles.get(id);
      if (p.data?.apiToken) setApiToken(p.data.apiToken);
      if (p.data?.baseUrl) setBaseUrl(p.data.baseUrl);
    } catch {}
  };

  const togglePlan = (id: string) => {
    setSelectedPlans(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">CaptivateIQ Tester</h2>

      {error && (
        <div className="bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-lg p-3 text-sm text-[var(--error)]">
          {error}
        </div>
      )}

      {/* Step 1: Connect */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
        <h3 className="text-sm font-medium mb-3">1. Connect to CaptivateIQ</h3>

        {/* Saved profiles */}
        {savedProfiles && savedProfiles.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            <span className="text-xs text-[var(--text-muted)] self-center">Saved:</span>
            {savedProfiles.map(p => (
              <button
                key={p.id}
                onClick={() => handleLoadProfile(p.id)}
                className="text-xs bg-[var(--bg-hover)] border border-[var(--border)] px-2 py-1 rounded hover:border-[var(--accent)] transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="CaptivateIQ API Token"
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
          />
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Base URL (optional, default: api.captivateiq.com)"
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
          />
          <div className="flex gap-2">
            <button
              onClick={handleConnect}
              disabled={connecting || !apiToken.trim()}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
            {connection?.connected && (
              <div className="flex gap-2 items-center">
                <input
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder="Profile name"
                  className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-sm"
                />
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile || !profileName.trim()}
                  className="text-xs text-[var(--accent)] hover:underline disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        </div>

        {connection?.connected && (
          <div className="mt-3 text-sm text-[var(--success)] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
            Connected{connection.authenticatedAs ? ` as ${connection.authenticatedAs}` : ''}
            {connection.apiVersion ? ` (v${connection.apiVersion})` : ''}
            &middot; {connection.plans.length} plan{connection.plans.length !== 1 ? 's' : ''} found
          </div>
        )}
      </div>

      {/* Step 2: Extract */}
      {connection?.connected && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">2. Extract Live Data</h3>
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {extracting ? 'Extracting...' : 'Extract CIQ Data'}
          </button>

          {extraction && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-2 rounded bg-[var(--bg)]/50">
                <div className="text-lg font-bold">{extraction.plans.length}</div>
                <div className="text-[10px] text-[var(--text-muted)]">Plans</div>
              </div>
              <div className="text-center p-2 rounded bg-[var(--bg)]/50">
                <div className="text-lg font-bold">{extraction.workbooks.length}</div>
                <div className="text-[10px] text-[var(--text-muted)]">Workbooks</div>
              </div>
              <div className="text-center p-2 rounded bg-[var(--bg)]/50">
                <div className="text-lg font-bold">{extraction.worksheets.length}</div>
                <div className="text-[10px] text-[var(--text-muted)]">Worksheets</div>
              </div>
              <div className="text-center p-2 rounded bg-[var(--bg)]/50">
                <div className="text-lg font-bold">{extraction.employeeCount}</div>
                <div className="text-[10px] text-[var(--text-muted)]">Employees</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Select plans & compare */}
      {extraction && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">3. Compare Against Pipeline Output</h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">Select plans to compare:</p>

          <div className="space-y-1 mb-4 max-h-48 overflow-y-auto">
            {(connection?.plans || extraction.plans || []).map((plan: any) => (
              <label
                key={plan.id}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                  selectedPlans.includes(plan.id)
                    ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/30'
                    : 'hover:bg-[var(--bg-hover)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedPlans.includes(plan.id)}
                  onChange={() => togglePlan(plan.id)}
                  className="accent-[var(--accent)]"
                />
                <span className="text-sm">{plan.name}</span>
              </label>
            ))}
          </div>

          <button
            onClick={handleCompare}
            disabled={comparing || selectedPlans.length === 0}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {comparing ? 'Comparing...' : `Compare ${selectedPlans.length} Plan${selectedPlans.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Results */}
      {comparison && (
        <div className="space-y-4">
          {/* Score banner */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-6">
            <ScoreRing score={comparison.trueToPlanScore} />
            <div>
              <div className="text-sm font-medium mb-1">True-to-Plan Score</div>
              <div className="text-xs text-[var(--text-muted)] space-y-0.5">
                <div>{comparison.counts.matched} matched &middot; {comparison.counts.partial} partial &middot; {comparison.counts.mismatched} mismatched</div>
                <div>{comparison.counts.missingInCiq} missing in CIQ &middot; {comparison.counts.extraInCiq} extra in CIQ</div>
                <div className="mt-1">Tested {new Date(comparison.testedAt).toLocaleString()}</div>
              </div>
            </div>
            {comparison.liveSummary.matchedPlanName && (
              <div className="ml-auto text-right">
                <div className="text-sm font-medium text-[var(--accent)]">{comparison.liveSummary.matchedPlanName}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {comparison.liveSummary.worksheetCount} worksheets &middot; {comparison.liveSummary.attributeWorksheetCount} attr sheets
                </div>
              </div>
            )}
          </div>

          {/* Category breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {comparison.categorySummaries.map(cat => (
              <div key={cat.category} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{cat.displayName}</span>
                  <span className={`text-sm font-bold ${
                    cat.matchPercent >= 80 ? 'text-[var(--success)]' : cat.matchPercent >= 60 ? 'text-[var(--warning)]' : 'text-[var(--error)]'
                  }`}>
                    {cat.matchPercent}%
                  </span>
                </div>
                <div className="w-full bg-[var(--bg)] rounded-full h-1.5 mb-2">
                  <div
                    className={`h-1.5 rounded-full ${
                      cat.matchPercent >= 80 ? 'bg-[var(--success)]' : cat.matchPercent >= 60 ? 'bg-[var(--warning)]' : 'bg-[var(--error)]'
                    }`}
                    style={{ width: `${cat.matchPercent}%` }}
                  />
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {cat.matched} matched, {cat.partial} partial, {cat.mismatched} mismatch, {cat.missingInCiq} missing
                </div>
              </div>
            ))}
          </div>

          {/* Issues */}
          {comparison.mismatches.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2 text-[var(--error)]">
                Mismatches ({comparison.mismatches.length})
              </h3>
              <div className="space-y-1">
                {comparison.mismatches.map(item => (
                  <ComparisonRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          {comparison.missingInCiq.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2 text-[var(--warning)]">
                Missing in CIQ ({comparison.missingInCiq.length})
              </h3>
              <div className="space-y-1">
                {comparison.missingInCiq.map(item => (
                  <ComparisonRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          {comparison.extraInCiq.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2 text-[var(--text-muted)]">
                Extra in CIQ ({comparison.extraInCiq.length})
              </h3>
              <div className="space-y-1">
                {comparison.extraInCiq.map(item => (
                  <ComparisonRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* All items detail */}
          <details className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg">
            <summary className="px-4 py-2 text-sm cursor-pointer text-[var(--text-muted)]">
              All Comparison Items ({comparison.items.length})
            </summary>
            <div className="px-4 pb-4 space-y-1">
              {comparison.items.map(item => (
                <ComparisonRow key={item.id} item={item} />
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function ComparisonRow({ item }: { item: ComparisonItem }) {
  return (
    <div className={`border rounded p-2 text-sm ${STATUS_BG[item.status] || 'bg-[var(--bg-card)] border-[var(--border)]'}`}>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold uppercase ${STATUS_COLORS[item.status]}`}>
          {STATUS_LABELS[item.status]}
        </span>
        <span className="font-medium text-xs">{item.name}</span>
        <span className="text-[10px] text-[var(--text-muted)] ml-auto">{item.category} &middot; {item.priority}</span>
      </div>
      {(item.planned || item.actual) && (
        <div className="flex gap-4 mt-1 text-[11px]">
          {item.planned && <div><span className="text-[var(--text-muted)]">Planned:</span> {item.planned}</div>}
          {item.actual && <div><span className="text-[var(--text-muted)]">Actual:</span> {item.actual}</div>}
        </div>
      )}
      {item.details && (
        <div className="text-[11px] text-[var(--text-muted)] mt-1">{item.details}</div>
      )}
    </div>
  );
}
