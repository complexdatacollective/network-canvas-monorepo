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

export type BrowserStorageProfile = {
  browserName: string;
  engine: 'chromium' | 'gecko' | 'webkit' | 'unknown';
  risk: StorageRisk;
};

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    brands?: readonly { brand: string; version: string }[];
  };
};

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
export function getBrowserStorageProfile(): BrowserStorageProfile {
  if (typeof navigator === 'undefined') {
    return { browserName: 'Browser', engine: 'unknown', risk: 2 };
  }

  const userAgent = navigator.userAgent;

  // Brand-specific iOS tokens must win over their desktop names: Apple requires
  // all iOS browsers to use WebKit and therefore its high-risk storage policy.
  if (userAgent.includes('CriOS')) {
    return { browserName: 'Chrome on iOS', engine: 'webkit', risk: 1 };
  }
  if (userAgent.includes('FxiOS')) {
    return { browserName: 'Firefox on iOS', engine: 'webkit', risk: 1 };
  }
  if (userAgent.includes('EdgiOS')) {
    return { browserName: 'Edge on iOS', engine: 'webkit', risk: 1 };
  }

  if (userAgent.includes('Firefox')) {
    return { browserName: 'Firefox', engine: 'gecko', risk: 2 };
  }

  const userAgentData = (navigator as NavigatorWithUserAgentData).userAgentData;
  if (userAgentData) {
    const brands = userAgentData.brands?.map(({ brand }) => brand) ?? [];
    const browserName = brands.some((brand) => brand.includes('Microsoft Edge'))
      ? 'Edge'
      : brands.some((brand) => brand.includes('Google Chrome'))
        ? 'Chrome'
        : 'Chromium';
    return { browserName, engine: 'chromium', risk: 3 };
  }

  if (userAgent.includes('Edg/')) {
    return { browserName: 'Edge', engine: 'chromium', risk: 3 };
  }
  if (userAgent.includes('Chrome/')) {
    return { browserName: 'Chrome', engine: 'chromium', risk: 3 };
  }
  if (userAgent.includes('Safari') || userAgent.includes('AppleWebKit')) {
    return { browserName: 'Safari', engine: 'webkit', risk: 1 };
  }

  return { browserName: 'Browser', engine: 'unknown', risk: 2 };
}

export const getBrowserStorageRisk = (): StorageRisk =>
  getBrowserStorageProfile().risk;

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
            variant="default-inverted"
            size="sm"
            icon={<Download />}
            onClick={installAction}
          >
            {installLabel}
          </Button>
        )}
        <CloseButton
          color={intent}
          variant="default-inverted"
          size="sm"
          title="Dismiss"
          onClick={onDismiss}
        />
      </AlertDescription>
    </Alert>
  );
}
