'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { results } from '@/lib/api';
import { showToast } from '@/lib/toast';

type Tab = 'rules' | 'config' | 'validation' | 'completeness' | 'build-doc' | 'export';

const CHECK_STATUS_ICON: Record<string, string> = {
  complete: '\u2713',
  partial: '\u25CB',
  missing: '\u2717',
  'not-applicable': '\u2014',
};

const CHECK_STATUS_COLOR: Record<string, string> = {
  complete: 'text-[var(--success)]',
  partial: 'text-[var(--warning)]',
  missing: 'text-[var(--error)]',
  'not-applicable': 'text-[var(--text-muted)]',
};

export default function ResultsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { data, error } = useSWR(`results-${projectId}`, () => results.get(projectId));
  const { data: completenessData } = useSWR(`completeness-${projectId}`, () => results.completeness(projectId).catch(() => null));
  const [activeTab, setActiveTab] = useState<Tab>('rules');

  // Loading state
  if (!data && !error) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-20" />
        <div className="skeleton h-10" />
        <div className="skeleton h-40" />
      </div>
    );
  }

  // No results yet
  if (error || data?.error) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-8 text-center">
        <p className="text-[var(--text-muted)] mb-4">No results yet. Run the pipeline first.</p>
        <Link
          href={`/projects/${projectId}/pipeline`}
          className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
        >
          Go to Pipeline
        </Link>
      </div>
    );
  }

  const extraction = data.extraction;
  const pipelineData = data.pipeline;
  const completeness = completenessData || data.completeness;

  const subtabs: { id: Tab; label: string }[] = [
    { id: 'rules', label: `Rules (${extraction?.ruleCount ?? 0})` },
    { id: 'config', label: 'CIQ Config' },
    { id: 'validation', label: `Validation${pipelineData?.validation ? ` (${pipelineData.validation.overallScore}/100)` : ''}` },
    { id: 'completeness', label: `Readiness${completeness ? ` (${completeness.overallReadiness}%)` : ''}` },
    { id: 'build-doc', label: 'Build Doc' },
    { id: 'export', label: 'Export' },
  ];

  return (
    <div>
      {/* Score banner */}
      {pipelineData?.validation && (
        <div className="flex items-center gap-6 mb-6 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-center">
            <div className={`text-3xl font-bold ${
              pipelineData.validation.overallScore >= 80 ? 'text-[var(--success)]'
              : pipelineData.validation.overallScore >= 60 ? 'text-[var(--warning)]'
              : 'text-[var(--error)]'
            }`}>
              {pipelineData.validation.overallScore}
            </div>
            <div className="text-xs text-[var(--text-muted)]">Score /100</div>
          </div>
          <div className="text-sm text-[var(--text-muted)] space-y-1">
            <div>{pipelineData.validation.checksRun} checks run, {pipelineData.validation.checksPassed} passed</div>
            <div>{pipelineData.validation.flaggedRules} rules flagged</div>
            <div>{extraction.ruleCount} rules extracted</div>
          </div>
          {data.stats && (
            <div className="text-sm text-[var(--text-muted)] space-y-1 border-l border-[var(--border)] pl-6">
              <div>{data.stats.filesProcessed} files processed</div>
              <div>{data.stats.excelFiles} Excel + {data.stats.documentFiles} documents</div>
              {data.stats.parseErrors > 0 && (
                <div className="text-[var(--error)]">{data.stats.parseErrors} parse errors</div>
              )}
            </div>
          )}
          {completeness && (
            <div className="ml-auto text-center">
              <div className={`text-2xl font-bold ${
                completeness.overallReadiness >= 80 ? 'text-[var(--success)]'
                : completeness.overallReadiness >= 50 ? 'text-[var(--warning)]'
                : 'text-[var(--error)]'
              }`}>
                {completeness.overallReadiness}%
              </div>
              <div className="text-xs text-[var(--text-muted)]">Build Ready</div>
            </div>
          )}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-4 overflow-x-auto">
        {subtabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-[var(--accent)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Rules tab */}
      {activeTab === 'rules' && (
        <div className="space-y-2">
          {extraction.rules?.length > 0 ? (
            extraction.rules.map((rule: any, i: number) => (
              <div key={rule.id || i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{rule.name || rule.id}</span>
                  <span className="text-xs bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded">{rule.concept}</span>
                  <span className="text-xs text-[var(--text-muted)]">{Math.round((rule.confidence ?? 0) * 100)}%</span>
                </div>
                {rule.description && <p className="text-xs text-[var(--text-muted)]">{rule.description}</p>}
                {rule.parameters && (
                  <pre className="text-xs text-[var(--text-muted)] mt-1 overflow-x-auto">{JSON.stringify(rule.parameters, null, 2)}</pre>
                )}
              </div>
            ))
          ) : (
            <p className="text-[var(--text-muted)] text-sm py-4 text-center">No rules extracted.</p>
          )}
        </div>
      )}

      {/* Config tab */}
      {activeTab === 'config' && (
        extraction.captivateiqConfig ? (
          <div className="space-y-3">
            {/* Config summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {extraction.captivateiqConfig.planName && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-muted)]">Plan Name</div>
                  <div className="text-sm font-medium mt-1">{extraction.captivateiqConfig.planName}</div>
                </div>
              )}
              {extraction.captivateiqConfig.periodType && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-muted)]">Period</div>
                  <div className="text-sm font-medium mt-1">{extraction.captivateiqConfig.periodType}</div>
                </div>
              )}
              {extraction.captivateiqConfig.dataWorksheets && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-muted)]">Data Worksheets</div>
                  <div className="text-sm font-medium mt-1">{extraction.captivateiqConfig.dataWorksheets.length}</div>
                </div>
              )}
              {extraction.captivateiqConfig.employeeAssumptions && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-muted)]">Employee Assumptions</div>
                  <div className="text-sm font-medium mt-1">{extraction.captivateiqConfig.employeeAssumptions.length}</div>
                </div>
              )}
            </div>
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap max-h-[600px]">
                {JSON.stringify(extraction.captivateiqConfig, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6 text-center">
            <p className="text-[var(--text-muted)] text-sm">No CIQ configuration generated for this extraction.</p>
          </div>
        )
      )}

      {/* Validation tab */}
      {activeTab === 'validation' && (
        pipelineData?.validation ? (
          <div className="space-y-3">
            {/* File results */}
            {pipelineData.fileResults?.map((fr: any) => (
              <div key={fr.fileId} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{fr.fileName}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {fr.classification?.fileType} &middot; {fr.ruleCount} rules
                      {fr.classification?.documentCompleteness && ` \u00b7 ${fr.classification.documentCompleteness}`}
                    </div>
                  </div>
                  <span className="text-xs bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded">
                    {fr.ruleCount} rules
                  </span>
                </div>
              </div>
            ))}

            {/* Synthesis summary */}
            {pipelineData.synthesis && (
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                <div className="text-sm font-medium mb-1">Cross-Reference Synthesis</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {pipelineData.synthesis.ruleCount} unified rules &middot;
                  {pipelineData.synthesis.conflictCount} conflicts resolved &middot;
                  {pipelineData.synthesis.crossRefCount} cross-references
                </div>
              </div>
            )}

            {/* Insights */}
            {extraction.insights && (
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                <div className="text-sm font-medium mb-1">Insights</div>
                <div className="text-sm text-[var(--text-muted)] whitespace-pre-wrap">{extraction.insights}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6 text-center">
            <p className="text-[var(--text-muted)] text-sm">No validation data. Run the full pipeline to get validation results.</p>
          </div>
        )
      )}

      {/* Completeness tab — full 8-category readiness checklist */}
      {activeTab === 'completeness' && (
        completeness ? (
          <div className="space-y-4">
            {/* Overall readiness bar */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Build Readiness</span>
                <span className={`text-lg font-bold ${
                  completeness.overallReadiness >= 80 ? 'text-[var(--success)]'
                  : completeness.overallReadiness >= 50 ? 'text-[var(--warning)]'
                  : 'text-[var(--error)]'
                }`}>
                  {completeness.overallReadiness}%
                </span>
              </div>
              <div className="w-full bg-[var(--bg)] rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    completeness.overallReadiness >= 80 ? 'bg-[var(--success)]'
                    : completeness.overallReadiness >= 50 ? 'bg-[var(--warning)]'
                    : 'bg-[var(--error)]'
                  }`}
                  style={{ width: `${completeness.overallReadiness}%` }}
                />
              </div>
              {completeness.totalChecks && (
                <div className="text-xs text-[var(--text-muted)] mt-2">
                  {completeness.completeCount ?? 0} complete &middot; {completeness.partialCount ?? 0} partial &middot;
                  {completeness.missingCount ?? 0} missing &middot; {completeness.naCount ?? 0} N/A
                  &middot; {completeness.totalChecks} total checks
                </div>
              )}
            </div>

            {/* Category summaries */}
            {completeness.categorySummaries?.map((cat: any) => (
              <div key={cat.category} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{cat.displayName}</span>
                  <span className={`text-sm font-bold ${
                    cat.completionPercent >= 80 ? 'text-[var(--success)]'
                    : cat.completionPercent >= 50 ? 'text-[var(--warning)]'
                    : 'text-[var(--error)]'
                  }`}>{cat.completionPercent}%</span>
                </div>
                <div className="w-full bg-[var(--bg)] rounded-full h-1.5 mb-3">
                  <div
                    className={`h-1.5 rounded-full ${
                      cat.completionPercent >= 80 ? 'bg-[var(--success)]'
                      : cat.completionPercent >= 50 ? 'bg-[var(--warning)]'
                      : 'bg-[var(--error)]'
                    }`}
                    style={{ width: `${cat.completionPercent}%` }}
                  />
                </div>
                <div className="text-xs text-[var(--text-muted)] mb-2">
                  {cat.complete}/{cat.total} complete, {cat.missing} missing
                </div>

                {/* Individual checks within this category */}
                {completeness.checklist?.filter((item: any) => item.category === cat.category).map((item: any) => (
                  <div key={item.id} className="flex items-start gap-2 py-1.5 border-t border-[var(--border)]/50 first:border-t-0">
                    <span className={`text-xs font-bold mt-0.5 w-4 text-center shrink-0 ${CHECK_STATUS_COLOR[item.status]}`}>
                      {CHECK_STATUS_ICON[item.status]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{item.name}</span>
                        <span className={`text-[10px] px-1 rounded ${
                          item.priority === 'required' ? 'bg-[var(--error)]/10 text-[var(--error)]'
                          : item.priority === 'recommended' ? 'bg-[var(--warning)]/10 text-[var(--warning)]'
                          : 'bg-[var(--bg)] text-[var(--text-muted)]'
                        }`}>{item.priority}</span>
                      </div>
                      {item.evidence && (
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.evidence}</div>
                      )}
                      {item.gapDescription && item.status !== 'complete' && (
                        <div className="text-[11px] text-[var(--warning)] mt-0.5">Gap: {item.gapDescription}</div>
                      )}
                      {item.suggestedAction && item.status !== 'complete' && (
                        <div className="text-[11px] text-[var(--accent)] mt-0.5">Action: {item.suggestedAction}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Blockers */}
            {completeness.blockers?.length > 0 && (
              <div className="bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-2 text-[var(--error)]">
                  Blockers ({completeness.blockers.length})
                </h3>
                <div className="space-y-2">
                  {completeness.blockers.map((b: any) => (
                    <div key={b.id} className="text-xs">
                      <div className="font-medium text-[var(--error)]">[{b.priority}] {b.name}</div>
                      {b.gapDescription && <div className="text-[var(--text-muted)] mt-0.5">{b.gapDescription}</div>}
                      {b.suggestedAction && <div className="text-[var(--accent)] mt-0.5">{b.suggestedAction}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6 text-center">
            <p className="text-[var(--text-muted)] text-sm">No completeness analysis yet. Run the pipeline first.</p>
            <Link
              href={`/projects/${projectId}/pipeline`}
              className="inline-block mt-3 text-sm text-[var(--accent)] hover:underline"
            >
              Go to Pipeline
            </Link>
          </div>
        )
      )}

      {/* Build Document tab */}
      {activeTab === 'build-doc' && (
        data.buildDocument ? (
          <div className="space-y-3">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.buildDocument.projectName && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-muted)]">Project</div>
                  <div className="text-sm font-medium mt-1">{data.buildDocument.projectName}</div>
                </div>
              )}
              {data.buildDocument.generatedAt && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-muted)]">Generated</div>
                  <div className="text-sm font-medium mt-1">{new Date(data.buildDocument.generatedAt).toLocaleDateString()}</div>
                </div>
              )}
              {data.buildDocument.ruleCount !== undefined && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-muted)]">Rules</div>
                  <div className="text-sm font-medium mt-1">{data.buildDocument.ruleCount}</div>
                </div>
              )}
              {data.buildDocument.version && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-muted)]">Version</div>
                  <div className="text-sm font-medium mt-1">{data.buildDocument.version}</div>
                </div>
              )}
            </div>

            {/* Sections */}
            {data.buildDocument.sections?.map((section: any, i: number) => (
              <details key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg" open={i === 0}>
                <summary className="px-4 py-2 text-sm font-medium cursor-pointer">{section.title || `Section ${i + 1}`}</summary>
                <div className="px-4 pb-3">
                  {section.content && <p className="text-xs text-[var(--text-muted)] whitespace-pre-wrap">{section.content}</p>}
                  {section.items?.map((item: any, j: number) => (
                    <div key={j} className="text-xs text-[var(--text-muted)] py-1 border-t border-[var(--border)]/50 mt-1">
                      {typeof item === 'string' ? item : JSON.stringify(item, null, 2)}
                    </div>
                  ))}
                </div>
              </details>
            ))}

            {/* Full JSON fallback */}
            <details className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg">
              <summary className="px-4 py-2 text-sm cursor-pointer text-[var(--text-muted)]">Full Build Document JSON</summary>
              <pre className="px-4 pb-4 text-xs overflow-x-auto whitespace-pre-wrap max-h-96">
                {JSON.stringify(data.buildDocument, null, 2)}
              </pre>
            </details>

            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(data.buildDocument, null, 2));
                showToast('Copied build document');
              }}
              className="bg-[var(--bg-card)] border border-[var(--border)] px-4 py-2 rounded-lg text-sm"
            >
              Copy Build Doc JSON
            </button>
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6 text-center">
            <p className="text-[var(--text-muted)] text-sm">No build document generated yet.</p>
          </div>
        )
      )}

      {/* Export tab */}
      {activeTab === 'export' && (
        <div className="space-y-3">
          <button
            onClick={() => window.open(`/api/projects/${projectId}/results/excel`, '_blank')}
            className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm"
          >
            Download Excel
          </button>
          {data.payloads && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(data.payloads, null, 2));
                showToast('Copied JSON to clipboard');
              }}
              className="bg-[var(--bg-card)] border border-[var(--border)] px-4 py-2 rounded-lg text-sm"
            >
              Copy CIQ Payloads
            </button>
          )}
          {data.buildDocument && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(data.buildDocument, null, 2));
                showToast('Copied build document');
              }}
              className="bg-[var(--bg-card)] border border-[var(--border)] px-4 py-2 rounded-lg text-sm"
            >
              Copy Build Document
            </button>
          )}
          {extraction.captivateiqConfig && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(extraction.captivateiqConfig, null, 2));
                showToast('Copied CIQ config');
              }}
              className="bg-[var(--bg-card)] border border-[var(--border)] px-4 py-2 rounded-lg text-sm"
            >
              Copy CIQ Config
            </button>
          )}
        </div>
      )}
    </div>
  );
}
