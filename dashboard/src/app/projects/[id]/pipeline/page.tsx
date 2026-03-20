'use client';

import { useParams } from 'next/navigation';
import { useState, useRef, useCallback, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import Link from 'next/link';
import { pipeline, runPipeline, type PipelineStatus } from '@/lib/api';

interface FileStatus {
  fileId: string;
  fileName: string;
  status: string;
  ruleCount?: number;
  error?: string;
}

function formatEvent(event: string, data: any): { text: string; color?: string } {
  switch (event) {
    case 'progress':
      return { text: `Phase: ${data.progress?.label ?? data.label ?? '...'} (${data.progress?.percent ?? data.percent ?? 0}%)` };
    case 'file-start':
      return { text: `Processing ${data.fileName ?? data.file ?? '...'}` };
    case 'error':
      return { text: data.message ?? 'Error', color: 'text-[var(--error)]' };
    case 'result':
    case 'complete':
      return { text: `Pipeline complete${data.ruleCount ? ` — ${data.ruleCount} rules extracted` : ''}`, color: 'text-[var(--success)]' };
    default: {
      const json = typeof data === 'object' ? JSON.stringify(data) : String(data);
      return { text: json.length > 200 ? json.slice(0, 200) + '...' : json };
    }
  }
}

export default function PipelinePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: status } = useSWR<PipelineStatus>(
    `pipeline-${projectId}`, () => pipeline.status(projectId), { refreshInterval: 3000 },
  );

  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<Array<{ event: string; data: any }>>([]);
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [progress, setProgress] = useState<{ label: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events]);

  const handleRun = useCallback((force: boolean) => {
    setRunning(true);
    setEvents([]);
    setFileStatuses([]);
    setProgress(null);
    setError(null);
    setComplete(false);

    const { abort } = runPipeline(projectId, force, (event, data) => {
      if (event === 'done') {
        setRunning(false);
        return;
      }

      setEvents((prev) => [...prev, { event, data }]);

      if (event === 'progress') {
        setProgress(data.progress);
        if (data.fileStatuses) setFileStatuses(data.fileStatuses);
      } else if (event === 'error') {
        setError(data.message);
        setRunning(false);
      } else if (event === 'result' || event === 'complete') {
        setComplete(true);
        // Invalidate results and pipeline status caches
        globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('results-'));
        globalMutate(`pipeline-${projectId}`);
      }
    });

    abortRef.current = abort;
  }, [projectId, globalMutate]);

  useEffect(() => {
    return () => { abortRef.current?.(); };
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => handleRun(false)}
          disabled={running}
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          {running ? 'Running...' : 'Run Pipeline'}
        </button>
        <button
          onClick={() => handleRun(true)}
          disabled={running}
          className="bg-[var(--bg-card)] border border-[var(--border)] hover:bg-[var(--bg-hover)] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
        >
          Force Re-run
        </button>
        {status && status.phase !== 'idle' && !running && (
          <span className="text-sm text-[var(--text-muted)]">
            Last run: {status.phase} {status.progress?.percent ? `(${status.progress.percent}%)` : ''}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm mb-1">
            <span>{progress.label}</span>
            <span className="text-[var(--text-muted)]">{progress.percent}%</span>
          </div>
          <div className="w-full bg-[var(--bg-card)] rounded-full h-2">
            <div
              className="bg-[var(--accent)] h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* File statuses */}
      {fileStatuses.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Files</h3>
          <div className="space-y-1">
            {fileStatuses.map((f) => (
              <div key={f.fileId} className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${
                  f.status === 'done' ? 'bg-[var(--success)]'
                  : f.status === 'running' ? 'bg-[var(--accent)] animate-pulse'
                  : f.status === 'error' ? 'bg-[var(--error)]'
                  : 'bg-[var(--text-muted)]'
                }`} />
                <span>{f.fileName}</span>
                {f.ruleCount !== undefined && <span className="text-[var(--text-muted)]">({f.ruleCount} rules)</span>}
                {f.error && <span className="text-[var(--error)]">{f.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-lg p-3 mb-4 text-sm text-[var(--error)]">
          {error}
        </div>
      )}

      {complete && (
        <div className="bg-[var(--success)]/10 border border-[var(--success)]/20 rounded-lg p-3 mb-4 text-sm text-[var(--success)] flex items-center justify-between">
          <span>Pipeline complete!</span>
          <Link
            href={`/projects/${projectId}/results`}
            className="bg-[var(--success)] text-white px-3 py-1 rounded text-sm font-medium hover:opacity-90 transition-opacity"
          >
            View Results
          </Link>
        </div>
      )}

      {/* Event log */}
      {events.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Event Log</h3>
          <div ref={logRef} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
            {events.map((ev, i) => {
              const formatted = formatEvent(ev.event, ev.data);
              return (
                <div key={i} className={formatted.color || 'text-[var(--text-muted)]'}>
                  <span className="text-[var(--accent)]">{ev.event}</span>{' '}
                  {formatted.text}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
