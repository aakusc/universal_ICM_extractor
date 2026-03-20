'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { brd } from '@/lib/api';
import { showToast } from '@/lib/toast';

interface BrdQuestion {
  id: string;
  section: string;
  question: string;
  hint: string;
  required: boolean;
}

type AnalysisData = { questions: BrdQuestion[]; summary: string; knownFields: Record<string, string> };

export default function BrdPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { data: savedBrd } = useSWR(`brd-${projectId}`, () => brd.get(projectId).catch(() => null));
  const { data: savedAnalysis } = useSWR<AnalysisData | null>(`brd-analysis-${projectId}`, () => brd.analysis(projectId).catch(() => null));

  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [generatedBrd, setGeneratedBrd] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync SWR data into local state when it resolves
  useEffect(() => {
    if (savedAnalysis && !analysis && !analyzing) {
      setAnalysis(savedAnalysis);
    }
  }, [savedAnalysis, analysis, analyzing]);

  useEffect(() => {
    if (savedBrd && !generatedBrd && !generating) {
      setGeneratedBrd(savedBrd);
    }
  }, [savedBrd, generatedBrd, generating]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await brd.analyze(projectId);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if (!analysis) return;

    // Validate required fields
    const missing = analysis.questions?.filter((q) => q.required && !answers[q.id]?.trim());
    if (missing?.length) {
      setError(`Please answer required questions: ${missing.map((q) => q.question).join(', ')}`);
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const answerArray = Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer }));
      const result = await brd.generate(projectId, answerArray);
      setGeneratedBrd(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const copyBrd = () => {
    navigator.clipboard.writeText(JSON.stringify(generatedBrd, null, 2));
    showToast('Copied!');
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Business Requirements Document</h2>

      {error && (
        <div className="bg-[var(--error)]/10 border border-[var(--error)]/20 rounded-lg p-3 mb-4 text-sm text-[var(--error)]">
          {error}
        </div>
      )}

      {/* Step 1: Analyze */}
      {!analysis && !generatedBrd && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6 text-center">
          <p className="text-[var(--text-muted)] mb-4">Analyze pipeline results to identify what information is needed for the BRD.</p>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium"
          >
            {analyzing ? 'Analyzing...' : 'Analyze Pipeline Results'}
          </button>
        </div>
      )}

      {/* Step 2: Answer questions */}
      {analysis && !generatedBrd && (
        <div>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 mb-6">
            <h3 className="font-medium mb-2">Analysis Summary</h3>
            <p className="text-sm text-[var(--text-muted)]">{analysis.summary}</p>
            {analysis.knownFields && (
              <div className="mt-3 text-xs text-[var(--text-muted)]">
                <strong>Known:</strong> {Object.entries(analysis.knownFields).map(([k, v]) => `${k}: ${v}`).join(' | ')}
              </div>
            )}
          </div>

          <h3 className="font-medium mb-3">Clarification Questions ({analysis.questions?.length ?? 0})</h3>
          <div className="space-y-4 mb-6">
            {analysis.questions?.map((q) => (
              <div key={q.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
                <label className="block text-sm font-medium mb-1">
                  {q.question}
                  {q.required && <span className="text-[var(--error)]">*</span>}
                </label>
                <p className="text-xs text-[var(--text-muted)] mb-2">{q.hint}</p>
                <textarea
                  rows={2}
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)] resize-y"
                  placeholder={`Section: ${q.section}`}
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium"
          >
            {generating ? 'Generating BRD...' : 'Generate BRD'}
          </button>
        </div>
      )}

      {/* Step 3: View BRD */}
      {generatedBrd && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Generated BRD</h3>
            <div className="flex gap-2">
              <button
                onClick={copyBrd}
                className="bg-[var(--bg-card)] border border-[var(--border)] px-3 py-1 rounded text-sm"
              >
                Copy JSON
              </button>
              <button
                onClick={() => { setGeneratedBrd(null); setAnalysis(null); setAnswers({}); }}
                className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Regenerate
              </button>
            </div>
          </div>

          {/* BRD Summary */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-[var(--text-muted)]">Client:</span> {generatedBrd.clientName}</div>
              <div><span className="text-[var(--text-muted)]">Fiscal Year:</span> {generatedBrd.fiscalYear}</div>
              <div><span className="text-[var(--text-muted)]">Start:</span> {generatedBrd.projectStartDate}</div>
              <div><span className="text-[var(--text-muted)]">Target Deploy:</span> {generatedBrd.targetDeploymentDate}</div>
            </div>
          </div>

          {/* Plan Matrix */}
          {generatedBrd.planMatrix?.length > 0 && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
              <h4 className="text-sm font-medium mb-2">Plan Matrix</h4>
              <table className="w-full text-xs">
                <thead><tr className="text-[var(--text-muted)]"><th className="text-left pb-1">Group</th><th className="text-left pb-1">Plan</th><th className="text-left pb-1">Period</th><th className="text-left pb-1">SPIFF</th></tr></thead>
                <tbody>
                  {generatedBrd.planMatrix.map((p: any, i: number) => (
                    <tr key={i}><td>{p.planGroup}</td><td>{p.planName}</td><td>{p.period}</td><td>{p.hasSpiff ? 'Yes' : 'No'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Full JSON */}
          <details className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg">
            <summary className="px-4 py-2 text-sm cursor-pointer text-[var(--text-muted)]">Full BRD JSON</summary>
            <pre className="px-4 pb-4 text-xs overflow-x-auto whitespace-pre-wrap max-h-96">
              {JSON.stringify(generatedBrd, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
