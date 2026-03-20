import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'ICM Services',
  description: 'ICM Extraction Pipeline Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[var(--bg)]">
        <header className="border-b border-[var(--border)] px-6 py-3 flex items-center gap-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">ICM Services</Link>
          <span className="text-xs text-[var(--text-muted)]">Extraction Pipeline</span>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
