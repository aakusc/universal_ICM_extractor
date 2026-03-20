'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { projects, type Project } from '@/lib/api';
import Link from 'next/link';

const fetcher = () => projects.list();

export default function HomePage() {
  const { data, error, mutate } = useSWR<Project[]>('projects', fetcher);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await projects.create(name.trim(), description.trim() || undefined);
      setName('');
      setDescription('');
      mutate();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project and all its data?')) return;
    await projects.delete(id);
    mutate();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
      </div>

      {/* Create form */}
      <form onSubmit={handleCreate} className="mb-8 space-y-3">
        <div className="flex gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project name..."
            className="flex-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
        />
        {createError && (
          <p className="text-sm text-[var(--error)]">{createError}</p>
        )}
      </form>

      {/* Project list */}
      {error && <p className="text-[var(--error)]">Failed to load projects</p>}

      {!data && !error && (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      )}

      <div className="grid gap-3">
        {data?.map((p) => (
          <div
            key={p.id}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors"
          >
            <Link href={`/projects/${p.id}`} className="flex-1">
              <div className="font-medium">{p.name}</div>
              {p.description && (
                <div className="text-sm text-[var(--text-muted)] mt-1">{p.description}</div>
              )}
              <div className="text-xs text-[var(--text-muted)] mt-2">
                Updated {new Date(p.updatedAt).toLocaleDateString()}
              </div>
            </Link>
            <button
              onClick={() => handleDelete(p.id)}
              className="text-[var(--text-muted)] hover:text-[var(--error)] text-sm ml-4"
            >
              Delete
            </button>
          </div>
        ))}
        {data?.length === 0 && (
          <p className="text-[var(--text-muted)] text-center py-8">No projects yet. Create one above.</p>
        )}
      </div>
    </div>
  );
}
