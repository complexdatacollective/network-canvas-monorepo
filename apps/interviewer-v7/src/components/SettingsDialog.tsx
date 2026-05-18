import {
  HardDrive,
  Info,
  Lock,
  Shield,
  Sun,
  Upload as UploadIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { HomeModal } from '~/components/HomeModal';
import { ManageAuthenticator } from '~/components/ManageAuthenticator';
import { type IdleTimeoutMinutes, useAuth } from '~/lib/auth/AuthContext';
import { getSettings, updateSettings } from '~/lib/db/api';
import type { StoredSettings } from '~/lib/db/types';
import { getInstallationId } from '~/lib/platform/installationId';
import { hostAppName } from '~/lib/platform/platform';
import {
  estimateStorage,
  formatBytes,
  type StorageEstimate,
} from '~/lib/platform/storage';

type SettingsDialogProps = {
  open: boolean;
  onClose: () => void;
};

type Section = 'device' | 'display' | 'data' | 'security' | 'about';

const APP_VERSION = '7.0.0';

const IDLE_TIMEOUT_OPTIONS: IdleTimeoutMinutes[] = [1, 5, 15, 30, 60];

const NAV_BUTTON_BASE =
  'flex w-full items-center gap-3 px-4 py-3 border-0 rounded-[var(--radius-pill)] font-heading font-extrabold text-sm text-left cursor-pointer';

const INPUT_PILL_CLASS =
  'rounded-[var(--radius-pill)] border-0 bg-surface-2 px-4 py-2.5 font-heading text-sm font-bold text-text';

function Row({
  title,
  desc,
  control,
}: {
  title: string;
  desc?: string;
  control: ReactNode;
}) {
  return (
    <div className="border-outline/60 flex items-center justify-between gap-6 border-b px-1 py-4">
      <div className="min-w-0">
        <Heading level="label" margin="none">
          {title}
        </Heading>
        {desc ? (
          <div className="text-text/60 mt-0.5 text-sm">{desc}</div>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`h-8 w-[52px] cursor-pointer rounded-full border-0 p-[3px] transition-colors duration-150 ${
        on ? 'bg-sea-green' : 'bg-surface-3'
      }`}
    >
      <span
        aria-hidden
        className={`block h-[26px] w-[26px] rounded-full bg-white transition-transform duration-200 ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function Progress({ value }: { value: number }) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <ProgressBar
      orientation="horizontal"
      percentProgress={clamped * 100}
      label="Storage usage"
      className="text-sea-green h-2"
    />
  );
}

const NAV_ITEMS: { id: Section; label: string; icon: typeof HardDrive }[] = [
  { id: 'device', label: 'Device', icon: HardDrive },
  { id: 'display', label: 'Display', icon: Sun },
  { id: 'data', label: 'Data export', icon: UploadIcon },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'about', label: 'About', icon: Info },
];

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const auth = useAuth();
  const toast = useToast();
  const [section, setSection] = useState<Section>('device');
  const [settings, setSettings] = useState<StoredSettings | null>(null);
  const [storage, setStorage] = useState<StorageEstimate>({
    usage: null,
    quota: null,
    percent: null,
  });
  const [installationId, setInstallationId] = useState('');

  const reload = useCallback(async () => {
    const [s, e] = await Promise.all([getSettings(), estimateStorage()]);
    setSettings(s);
    setStorage(e);
    setInstallationId(getInstallationId());
  }, []);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  const persist = useCallback(
    async (patch: Partial<Omit<StoredSettings, 'id'>>) => {
      const next = await updateSettings(patch);
      setSettings(next);
    },
    [],
  );

  const handleIdleTimeoutChange = useCallback(
    async (value: string) => {
      const parsed = Number.parseInt(value, 10);
      if (
        parsed === 1 ||
        parsed === 5 ||
        parsed === 15 ||
        parsed === 30 ||
        parsed === 60
      ) {
        await auth.setIdleTimeoutMinutes(parsed);
      }
    },
    [auth],
  );

  const handleLockNow = useCallback(async () => {
    await auth.lock();
    onClose();
    toast.add({ title: 'App locked', variant: 'default' });
  }, [auth, onClose, toast]);

  const storagePercent = storage.percent !== null ? storage.percent / 100 : 0;
  const storageLabel =
    storage.usage !== null && storage.quota !== null
      ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}${
          storage.percent !== null ? ` (${storage.percent.toFixed(1)}%)` : ''
        }`
      : 'Unknown';

  return (
    <HomeModal
      open={open}
      onClose={onClose}
      maxWidth={1000}
      title={
        <Heading level="h3" margin="none">
          Settings
        </Heading>
      }
    >
      <div className="grid grid-cols-[210px_1fr] gap-7">
        <nav aria-label="Settings sections" className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`${NAV_BUTTON_BASE} ${active ? 'bg-surface-2 text-text' : 'text-text/80 bg-transparent'}`}
              >
                <Icon size={18} strokeWidth={2.4} aria-hidden />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div>
          {section === 'device' ? (
            <>
              <Row
                title="Storage"
                desc={storageLabel}
                control={
                  <div className="w-[220px]">
                    <Progress value={storagePercent} />
                  </div>
                }
              />
              <Row
                title="Platform"
                desc="Host application this device is running"
                control={<span className="mono">{hostAppName}</span>}
              />
              <Row
                title="Installation ID"
                desc="Unique per-device identifier"
                control={<span className="mono text-xs">{installationId}</span>}
              />
            </>
          ) : null}

          {section === 'display' ? (
            <Row
              title="Display preferences"
              desc="Brightness, theme, and text size will follow the operating system."
              control={<span className="mono text-text/60">—</span>}
            />
          ) : null}

          {section === 'data' && settings ? (
            <>
              <Row
                title="Export GraphML"
                desc="Include GraphML files in interview exports."
                control={
                  <Toggle
                    label="Export GraphML"
                    on={settings.exportGraphML}
                    onChange={(next) => void persist({ exportGraphML: next })}
                  />
                }
              />
              <Row
                title="Export CSV"
                desc="Include CSV files (attributes, edges, ego) in interview exports."
                control={
                  <Toggle
                    label="Export CSV"
                    on={settings.exportCSV}
                    onChange={(next) => void persist({ exportCSV: next })}
                  />
                }
              />
              <Row
                title="Export node positions as screen-coordinate pixels"
                desc="Sociogram node positions are exported in pixel coordinates relative to the layout below."
                control={
                  <Toggle
                    label="Use screen layout coordinates"
                    on={settings.useScreenLayoutCoordinates}
                    onChange={(next) =>
                      void persist({ useScreenLayoutCoordinates: next })
                    }
                  />
                }
              />
              <Row
                title="Screen layout width"
                desc="Pixels"
                control={
                  <input
                    type="number"
                    min={1}
                    value={settings.screenLayoutWidth}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        void persist({ screenLayoutWidth: parsed });
                      }
                    }}
                    aria-label="Screen layout width"
                    className={`${INPUT_PILL_CLASS} w-[140px] font-bold`}
                  />
                }
              />
              <Row
                title="Screen layout height"
                desc="Pixels"
                control={
                  <input
                    type="number"
                    min={1}
                    value={settings.screenLayoutHeight}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        void persist({ screenLayoutHeight: parsed });
                      }
                    }}
                    aria-label="Screen layout height"
                    className={`${INPUT_PILL_CLASS} w-[140px] font-bold`}
                  />
                }
              />
            </>
          ) : null}

          {section === 'security' ? (
            <>
              <Row
                title="Idle timeout"
                desc="How long the app may sit idle before automatically locking."
                control={
                  <select
                    value={String(auth.idleTimeoutMinutes)}
                    onChange={(event) =>
                      void handleIdleTimeoutChange(event.target.value)
                    }
                    aria-label="Idle timeout"
                    className={`${INPUT_PILL_CLASS} min-w-[180px] font-bold`}
                  >
                    {IDLE_TIMEOUT_OPTIONS.map((minutes) => (
                      <option key={minutes} value={String(minutes)}>
                        {minutes} minute{minutes === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                }
              />
              <div className="border-outline/60 border-b px-1 py-5">
                <ManageAuthenticator />
              </div>
              <div className="flex justify-end pt-6">
                <Button
                  variant="outline"
                  icon={<Lock size={16} aria-hidden />}
                  onClick={() => void handleLockNow()}
                >
                  Lock now
                </Button>
              </div>
            </>
          ) : null}

          {section === 'about' ? (
            <>
              <Row
                title="App version"
                desc="Network Canvas Interviewer"
                control={<span className="mono">{APP_VERSION}</span>}
              />
              <Row
                title="Platform"
                desc="Host application this device is running"
                control={<span className="mono">{hostAppName}</span>}
              />
              <Row
                title="Installation ID"
                desc="Unique per-device identifier"
                control={<span className="mono text-xs">{installationId}</span>}
              />
            </>
          ) : null}
        </div>
      </div>
    </HomeModal>
  );
}
