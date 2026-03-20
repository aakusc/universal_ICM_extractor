'use client';

import { useParams, usePathname } from 'next/navigation';
import useSWR from 'swr';
import { projects, type Project } from '@/lib/api';
import Link from 'next/link';

const tabs = [
  { label: 'Files', path: '' },
  { label: 'Pipeline', path: '/pipeline' },
  { label: 'Results', path: '/results' },
  { label: 'BRD', path: '/brd' },
  { label: 'Tester', path: '/tester' },
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { data: project } = useSWR<Project>(`project-${id}`, () => projects.get(id));

  const basePath = `/projects/${id}`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <Link href="/" className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm">&larr; Projects</Link>
        <span className="text-[var(--text-muted)]">/</span>
        <h1 className="text-xl font-bold">{project?.name ?? 'Loading...'}</h1>
      </div>

      {project?.description && (
        <p className="text-sm text-[var(--text-muted)] mb-4">{project.description}</p>
      )}

      {/* Tab bar */}
      <nav className="flex gap-1 border-b border-[var(--border)] mb-6">
        {tabs.map((tab) => {
          const href = basePath + tab.path;
          const isActive = tab.path === ''
            ? pathname === basePath
            : pathname.startsWith(href);
          return (
            <Link
              key={tab.path}
              href={href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-[var(--accent)] text-[var(--text)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
