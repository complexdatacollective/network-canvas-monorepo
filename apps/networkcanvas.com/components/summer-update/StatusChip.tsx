import { useTranslations } from 'next-intl';

import { Badge, type BadgeTone } from '@codaco/fresco-ui/Badge';

import type { CompatibilityStatus } from './summerUpdateContent';

const STATUS_TONES: Record<CompatibilityStatus, BadgeTone> = {
  migrates: 'info',
  native: 'success',
  unsupported: 'destructive',
};

export function StatusChip({ status }: { status: CompatibilityStatus }) {
  const t = useTranslations('SummerUpdate.compatibility.statuses');
  const labels = {
    migrates: `→ ${t('migrates')}`,
    native: `✓ ${t('native')}`,
    unsupported: `✗ ${t('unsupported')}`,
  } as const;

  return (
    <Badge
      mono
      appearance="outline"
      tone={STATUS_TONES[status]}
      className="whitespace-nowrap"
    >
      {labels[status]}
    </Badge>
  );
}
