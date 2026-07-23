import { cn } from '~/lib/cn';

import type { CompatibilityStatus } from './summerUpdateContent';

export function StatusChip({ status }: { status: CompatibilityStatus }) {
  const labels = {
    migrates: '→ Migrates to 8',
    native: '✓ Native',
    unsupported: '✗ Not supported',
  } as const;

  const statusClass = {
    migrates: 'bg-sea-serpent/15 text-sea-serpent-dark',
    native: 'bg-sea-green/15 text-sea-green-dark',
    unsupported: 'bg-neon-coral/10 text-slate-blue font-semibold-dark',
  }[status];

  return (
    <span
      className={cn(
        'font-monospace inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-wide whitespace-nowrap',
        statusClass,
      )}
    >
      {labels[status]}
    </span>
  );
}
