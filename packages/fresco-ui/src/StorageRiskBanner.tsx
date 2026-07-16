'use client';

import { Download } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

import { Alert, AlertDescription } from './Alert';
import Button, { type ButtonProps } from './Button';
import CloseButton from './CloseButton';
import { cx } from './utils/cva';

/**
 * Browser-storage danger, ordered from high to low risk.
 *
 * 1: high — data can be removed proactively.
 * 2: medium — data can be removed under storage pressure.
 * 3: low — automatic removal is possible but uncommon.
 */
export type StorageRisk = 1 | 2 | 3;

type StorageRiskIntent = Extract<
  ButtonProps['color'],
  'destructive' | 'warning' | 'info'
>;

const intentByRisk: Record<StorageRisk, StorageRiskIntent> = {
  1: 'destructive',
  2: 'warning',
  3: 'info',
};

const contextLabelByRisk: Record<StorageRisk, string> = {
  1: 'High data-loss risk',
  2: 'Medium data-loss risk',
  3: 'Low data-loss risk',
};

/**
 * Classify the active browser engine by its storage-eviction behaviour. Apple
 * requires third-party iOS browsers to use WebKit, so they correctly receive
 * WebKit's high-risk policy rather than their desktop brand's policy.
 */
export function getBrowserStorageRisk(): StorageRisk {
  if (typeof navigator === 'undefined') return 2;
  if ('userAgentData' in navigator) return 3;
  if (navigator.userAgent.includes('Firefox')) return 2;
  if (
    navigator.userAgent.includes('Safari') ||
    navigator.userAgent.includes('AppleWebKit')
  ) {
    return 1;
  }
  return 2;
}

export type StorageRiskBannerProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children'
> & {
  risk: StorageRisk;
  children: ReactNode;
  installAction?: (() => void) | undefined;
  installLabel?: string | undefined;
  onDismiss: () => void;
};

/**
 * Compact data-safety banner whose alert, action, and dismiss controls all
 * inherit the semantic intent selected by `risk`.
 */
export function StorageRiskBanner({
  risk,
  children,
  installAction,
  installLabel = 'Install',
  onDismiss,
  className,
  ...props
}: StorageRiskBannerProps) {
  const intent = intentByRisk[risk];

  return (
    <Alert
      variant={intent}
      contextLabel={contextLabelByRisk[risk]}
      density="compact"
      className={cx(
        'border-outline my-0 shrink-0 rounded-none! border-x-0 border-t-0 border-b px-6 py-2 shadow-none!',
        className,
      )}
      {...props}
    >
      <AlertDescription className="flex items-center gap-3 text-sm">
        <span className="flex-1">{children}</span>
        {installAction && (
          <Button
            color={intent}
            size="sm"
            icon={<Download />}
            onClick={installAction}
          >
            {installLabel}
          </Button>
        )}
        <CloseButton size="sm" title="Dismiss" onClick={onDismiss} />
      </AlertDescription>
    </Alert>
  );
}
