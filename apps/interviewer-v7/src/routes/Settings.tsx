import { Lock, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import PageHeader from '@codaco/fresco-ui/typography/PageHeader';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { ManageAuthenticator } from '~/components/ManageAuthenticator';
import { type IdleTimeoutMinutes, useAuth } from '~/lib/auth/AuthContext';
import { getSettings, updateSettings } from '~/lib/db/api';
import type { StoredSettings } from '~/lib/db/types';
import { hostAppName } from '~/lib/platform/platform';
import {
  estimateStorage,
  formatBytes,
  isStoragePersistent,
  type StorageEstimate,
} from '~/lib/platform/storage';

const IDLE_TIMEOUT_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: '1 minute' },
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '60 minutes' },
];

const EXPORT_DEFAULTS = {
  exportGraphML: true,
  exportCSV: true,
  useScreenLayoutCoordinates: false,
  screenLayoutWidth: 1920,
  screenLayoutHeight: 1080,
} as const;

// Narrows the string select value back to the literal union before persisting.
function parseIdleTimeoutMinutes(
  value: string | number | undefined,
): IdleTimeoutMinutes | null {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value ?? ''), 10);
  if (
    parsed === 1 ||
    parsed === 5 ||
    parsed === 15 ||
    parsed === 30 ||
    parsed === 60
  ) {
    return parsed;
  }
  return null;
}

export function SettingsRoute() {
  const auth = useAuth();
  const toast = useToast();
  const [settings, setSettings] = useState<StoredSettings | null>(null);
  const [storage, setStorage] = useState<StorageEstimate>({
    usage: null,
    quota: null,
    percent: null,
  });
  const [persistent, setPersistent] = useState<boolean>(false);

  const reload = useCallback(async () => {
    const [s, e, p] = await Promise.all([
      getSettings(),
      estimateStorage(),
      isStoragePersistent(),
    ]);
    setSettings(s);
    setStorage(e);
    setPersistent(p);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persistExport = useCallback(
    async (patch: Partial<Omit<StoredSettings, 'id'>>) => {
      const next = await updateSettings(patch);
      setSettings(next);
    },
    [],
  );

  const handleIdleTimeoutChange = useCallback(
    async (value: string | number | undefined) => {
      const minutes = parseIdleTimeoutMinutes(value);
      if (minutes === null) return;
      await auth.setIdleTimeoutMinutes(minutes);
    },
    [auth],
  );

  const handleLockNow = useCallback(async () => {
    await auth.lock();
  }, [auth]);

  const handleResetExportDefaults = useCallback(async () => {
    await persistExport(EXPORT_DEFAULTS);
    toast.add({
      title: 'Export preferences reset',
      variant: 'success',
    });
  }, [persistExport, toast]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <PageHeader
        headerText="Settings"
        subHeaderText="Configure exports, security, and view diagnostics."
      />

      <Surface level={1} spacing="lg" className="flex flex-col gap-4">
        <Heading level="h3">Data export</Heading>
        <UnconnectedField
          name="exportGraphML"
          label="Export GraphML"
          hint="Include GraphML files in interview exports."
          inline
          component={ToggleField}
          value={settings?.exportGraphML ?? false}
          onChange={(value) =>
            void persistExport({ exportGraphML: Boolean(value) })
          }
        />
        <UnconnectedField
          name="exportCSV"
          label="Export CSV"
          hint="Include CSV files (attribute list, edge list, ego attributes) in interview exports."
          inline
          component={ToggleField}
          value={settings?.exportCSV ?? false}
          onChange={(value) =>
            void persistExport({ exportCSV: Boolean(value) })
          }
        />
        <UnconnectedField
          name="useScreenLayoutCoordinates"
          label="Export node positions as screen-coordinate pixels"
          hint="When enabled, sociogram node positions are exported in pixel coordinates relative to the screen layout below."
          inline
          component={ToggleField}
          value={settings?.useScreenLayoutCoordinates ?? false}
          onChange={(value) =>
            void persistExport({ useScreenLayoutCoordinates: Boolean(value) })
          }
        />
        <UnconnectedField
          name="screenLayoutWidth"
          label="Screen layout width (px)"
          component={InputField}
          type="number"
          min={1}
          value={settings ? String(settings.screenLayoutWidth) : ''}
          onChange={(value) => {
            const parsed = Number.parseInt(value ?? '', 10);
            if (!Number.isFinite(parsed) || parsed <= 0) return;
            void persistExport({ screenLayoutWidth: parsed });
          }}
        />
        <UnconnectedField
          name="screenLayoutHeight"
          label="Screen layout height (px)"
          component={InputField}
          type="number"
          min={1}
          value={settings ? String(settings.screenLayoutHeight) : ''}
          onChange={(value) => {
            const parsed = Number.parseInt(value ?? '', 10);
            if (!Number.isFinite(parsed) || parsed <= 0) return;
            void persistExport({ screenLayoutHeight: parsed });
          }}
        />
      </Surface>

      <Surface level={1} spacing="lg" className="flex flex-col gap-4">
        <Heading level="h3">Idle timeout</Heading>
        <UnconnectedField
          name="idleTimeoutMinutes"
          label="Lock the app after"
          hint="How long the app may sit idle before automatically locking."
          component={SelectField}
          options={IDLE_TIMEOUT_OPTIONS}
          value={String(auth.idleTimeoutMinutes)}
          onChange={(value) => void handleIdleTimeoutChange(value)}
        />
      </Surface>

      <Surface level={1} spacing="lg">
        <ManageAuthenticator />
      </Surface>

      <Surface level={1} spacing="lg" className="flex flex-col gap-4">
        <Heading level="h3">Lock now</Heading>
        <Paragraph emphasis="muted">
          Immediately lock the app. You will need to authenticate again to
          continue.
        </Paragraph>
        <div>
          <Button
            onClick={() => void handleLockNow()}
            icon={<Lock className="size-4" />}
          >
            Lock now
          </Button>
        </div>
      </Surface>

      <Surface level={1} spacing="lg" className="flex flex-col gap-4">
        <Heading level="h3">Reset to defaults</Heading>
        <Paragraph emphasis="muted">
          Restore the export preferences above to their default values. Idle
          timeout and authenticator settings are unaffected.
        </Paragraph>
        <div>
          <Button
            variant="outline"
            onClick={() => void handleResetExportDefaults()}
            icon={<RotateCcw className="size-4" />}
          >
            Reset export preferences
          </Button>
        </div>
      </Surface>

      <Surface level={1} spacing="lg" className="flex flex-col gap-4">
        <Heading level="h3">Diagnostics</Heading>
        <Paragraph emphasis="muted">
          Read-only details about this device&apos;s storage.
        </Paragraph>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-mono text-xs">
          <dt className="text-text/60">Platform</dt>
          <dd>{hostAppName}</dd>
          <dt className="text-text/60">Storage usage</dt>
          <dd>
            {formatBytes(storage.usage)} of {formatBytes(storage.quota)}
            {storage.percent !== null
              ? ` (${storage.percent.toFixed(1)}%)`
              : ''}
          </dd>
          <dt className="text-text/60">Persistent storage</dt>
          <dd>{persistent ? 'granted' : 'not granted'}</dd>
        </dl>
      </Surface>
    </div>
  );
}
