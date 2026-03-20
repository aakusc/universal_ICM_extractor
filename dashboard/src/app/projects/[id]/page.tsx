'use client';

import { useParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { files, context, fileToBase64, type ProjectFile, type Requirement, type Note } from '@/lib/api';

const PRIORITIES = ['high', 'medium', 'low'] as const;
const PRIORITY_LABELS: Record<string, string> = { high: 'H', medium: 'M', low: 'L' };
const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-[var(--error)] text-white',
  medium: 'bg-[var(--warning)] text-white',
  low: 'bg-[var(--success)] text-white',
};
const PRIORITY_INACTIVE: Record<string, string> = {
  high: 'border-[var(--error)]/30 text-[var(--error)]',
  medium: 'border-[var(--warning)]/30 text-[var(--warning)]',
  low: 'border-[var(--success)]/30 text-[var(--success)]',
};

export default function FilesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: fileList, mutate: mutateFiles } = useSWR<ProjectFile[]>(
    `files-${projectId}`, () => files.list(projectId),
  );
  const { data: reqs, mutate: mutateReqs } = useSWR<Requirement[]>(
    `reqs-${projectId}`, () => context.requirements.list(projectId),
  );
  const { data: notes, mutate: mutateNotes } = useSWR<Note[]>(
    `notes-${projectId}`, () => context.notes.list(projectId),
  );

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [reqText, setReqText] = useState('');
  const [reqPriority, setReqPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [noteText, setNoteText] = useState('');
  const [filesChanged, setFilesChanged] = useState(false);

  const uploadFiles = useCallback(async (fileListInput: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(fileListInput)) {
        const data = await fileToBase64(file);
        await files.upload(projectId, file.name, data, file.type);
      }
      mutateFiles();
      globalMutate(`pipeline-${projectId}`);
      setFilesChanged(true);
    } finally {
      setUploading(false);
    }
  }, [projectId, mutateFiles, globalMutate]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) uploadFiles(e.target.files);
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Remove this file?')) return;
    await files.delete(projectId, fileId);
    mutateFiles();
    globalMutate(`pipeline-${projectId}`);
    setFilesChanged(true);
  };

  const addRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqText.trim()) return;
    await context.requirements.add(projectId, reqText.trim(), reqPriority);
    setReqText('');
    mutateReqs();
  };

  const deleteRequirement = async (id: string) => {
    await context.requirements.delete(projectId, id);
    mutateReqs();
  };

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    await context.notes.add(projectId, noteText.trim());
    setNoteText('');
    mutateNotes();
  };

  const deleteNote = async (id: string) => {
    await context.notes.delete(projectId, id);
    mutateNotes();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Files section */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Files</h2>

        {/* Files-changed banner */}
        {filesChanged && (
          <div className="bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-lg px-3 py-2 mb-3 text-sm text-[var(--warning)] flex items-center justify-between">
            <span>Files changed — re-run the pipeline to update results</span>
            <button onClick={() => setFilesChanged(false)} className="text-xs opacity-60 hover:opacity-100 ml-2">dismiss</button>
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-4 ${
            dragOver ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)]'
          }`}
        >
          <p className="text-[var(--text-muted)] text-sm">
            {uploading ? 'Uploading...' : 'Drop Excel or document files here'}
          </p>
          <label className="mt-2 inline-block text-sm text-[var(--accent)] cursor-pointer hover:underline">
            or browse files
            <input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.docx,.doc" onChange={handleFileInput} className="hidden" />
          </label>
        </div>

        {/* File list */}
        <div className="space-y-2">
          {fileList?.map((f) => (
            <div key={f.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{f.originalName}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {(f.size / 1024).toFixed(0)} KB &middot; {f.category}
                  {f.parseError && <span className="text-[var(--error)]"> &middot; Parse error</span>}
                </div>
              </div>
              <button onClick={() => handleDeleteFile(f.id)} className="text-xs text-[var(--text-muted)] hover:text-[var(--error)]">
                Remove
              </button>
            </div>
          ))}
          {fileList && fileList.length === 0 && <p className="text-[var(--text-muted)] text-sm">No files uploaded yet.</p>}
          {!fileList && (
            <div className="space-y-2">
              <div className="skeleton h-12" />
              <div className="skeleton h-12" />
            </div>
          )}
        </div>
      </section>

      {/* Context section */}
      <section className="space-y-6">
        {/* Requirements */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Requirements</h2>
          <form onSubmit={addRequirement} className="flex gap-2 mb-3">
            <input
              value={reqText}
              onChange={(e) => setReqText(e.target.value)}
              placeholder="Add a requirement..."
              className="flex-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            />
            {/* Priority toggle */}
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setReqPriority(p)}
                  className={`w-8 text-xs font-bold transition-colors ${
                    reqPriority === p ? PRIORITY_COLORS[p] : `bg-transparent ${PRIORITY_INACTIVE[p]}`
                  }`}
                  title={p}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
            <button type="submit" className="bg-[var(--accent)] text-white px-3 py-2 rounded-lg text-sm">Add</button>
          </form>
          <div className="space-y-1">
            {reqs?.map((r) => (
              <div key={r.id} className="flex items-start justify-between bg-[var(--bg-card)] border border-[var(--border)] rounded p-2">
                <div className="text-sm">
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                    r.priority === 'high' ? 'bg-[var(--error)]' : r.priority === 'medium' ? 'bg-[var(--warning)]' : 'bg-[var(--success)]'
                  }`} />
                  {r.text}
                </div>
                <button onClick={() => deleteRequirement(r.id)} className="text-xs text-[var(--text-muted)] hover:text-[var(--error)] ml-2">x</button>
              </div>
            ))}
            {reqs && reqs.length === 0 && <p className="text-[var(--text-muted)] text-xs">No requirements yet.</p>}
          </div>
        </div>

        {/* Notes */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Notes</h2>
          <form onSubmit={addNote} className="flex gap-2 mb-3">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            />
            <button type="submit" className="bg-[var(--accent)] text-white px-3 py-2 rounded-lg text-sm">Add</button>
          </form>
          <div className="space-y-1">
            {notes?.map((n) => (
              <div key={n.id} className="flex items-start justify-between bg-[var(--bg-card)] border border-[var(--border)] rounded p-2">
                <div className="text-sm">{n.text}</div>
                <button onClick={() => deleteNote(n.id)} className="text-xs text-[var(--text-muted)] hover:text-[var(--error)] ml-2">x</button>
              </div>
            ))}
            {notes && notes.length === 0 && <p className="text-[var(--text-muted)] text-xs">No notes yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
