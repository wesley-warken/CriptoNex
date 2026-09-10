import { useState, type ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
export function Fullscreen({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const [full, setFull] = useState(false);
  return (
    <section className={cn('panel p-4', full && 'fixed inset-2 z-50 overflow-auto', className)}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted">{title}</h3>
        <button onClick={() => setFull((f) => !f)} className="rounded-lg border border-[var(--border)] p-1.5" title="Fullscreen"><Maximize2 size={14} /></button>
      </div>
      {children}
    </section>
  );
}
