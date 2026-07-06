import {
  FlaskConical,
  Info,
  LineChart,
  Route,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload as UploadIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { HomeModal } from '~/components/HomeModal';
import {
  ManageAuthenticator,
  ResetDeviceRow,
} from '~/components/ManageAuthenticator';
import SecurityBehaviorControls, {
  type Behavior,
} from '~/components/SecurityBehaviorControls';
import { SettingsRow } from '~/components/SettingsRow';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import { APP_VERSION } from '~/lib/appVersion';
import { useAuth } from '~/lib/auth/AuthContext';
import {
  countSyntheticSessions,
  deleteSyntheticSessions,
  getSettings,
  listProtocols,
  updateSettings,
} from '~/lib/db/api';
import type { ProtocolWithCounts, StoredSettings } from '~/lib/db/types';
import { getInstallationId } from '~/lib/installationId';
import {
  estimateStorage,
  formatBytes,
  isStoragePersisted,
  type StorageEstimate,
} from '~/lib/storage';
import { generateSyntheticSessions } from '~/lib/synthetic/generate';

type SettingsDialogProps = {
  open: boolean;
  onClose: () => void;
  // Invoked after synthetic sessions are generated or deleted so the host can
  // refresh views that read sessions (StatusRow, the data table).
  onDataChange?: () => void;
};

type Section =
  | 'about'
  | 'interview'
  | 'data'
  | 'privacy'
  | 'security'
  | 'synthetic';

const NAV_BUTTON_BASE =
  'flex w-full items-center gap-3 px-4 py-3 border-0 rounded-[var(--radius-pill)] font-heading font-extrabold text-sm text-left cursor-pointer';

function StorageProgress({ value }: { value: number }) {
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

const NAV_ITEMS: { id: Section; label: string; icon: typeof Info }[] = [
  { id: 'about', label: 'About', icon: Info },
  { id: 'interview', label: 'Interview', icon: Route },
  { id: 'data', label: 'Data export', icon: UploadIcon },
  { id: 'privacy', label: 'Privacy', icon: LineChart },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'synthetic', label: 'Synthetic data', icon: FlaskConical },
];

export function SettingsDialog({
  open,
  onClose,
  onDataChange,
}: SettingsDialogProps) {
  const auth = useAuth();
  const analytics = useAnalytics();
  const toast = useToast();
  const { confirm } = useDialog();
  const [section, setSection] = useState<Section>('about');
  const [settings, setSettings] = useState<StoredSettings | null>(null);
  const [storage, setStorage] = useState<StorageEstimate>({
    usage: null,
    quota: null,
    percent: null,
  });
  const [installationId, setInstallationId] = useState('');
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(
    null,
  );

  // Synthetic data section state.
  const [protocols, setProtocols] = useState<ProtocolWithCounts[]>([]);
  const [selectedProtocolHash, setSelectedProtocolHash] = useState('');
  const [syntheticCount, setSyntheticCount] = useState(0);
  const [count, setCount] = useState(10);
  const [simulateDropOut, setSimulateDropOut] = useState(true);
  const [respectSkipLogicAndFiltering, setRespectSkipLogicAndFiltering] =
    useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  const reload = useCallback(async () => {
    const [s, e, persisted] = await Promise.all([
      getSettings(),
      estimateStorage(),
      isStoragePersisted(),
    ]);
    setSettings(s);
    setStorage(e);
    setStoragePersisted(persisted);
    setInstallationId(getInstallationId());
  }, []);

  const reloadSynthetic = useCallback(async () => {
    const [ps, n] = await Promise.all([
      listProtocols(),
      countSyntheticSessions(),
    ]);
    setProtocols(ps);
    setSyntheticCount(n);
    // Default to the first protocol when none is selected yet.
    setSelectedProtocolHash((current) => {
      if (current && ps.some((p) => p.hash === current)) return current;
      return ps[0]?.hash ?? '';
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    void reload();
    void reloadSynthetic();
  }, [open, reload, reloadSynthetic]);

  const persist = useCallback(
    async (patch: Partial<Omit<StoredSettings, 'id'>>) => {
      const next = await updateSettings(patch);
      setSettings(next);
    },
    [],
  );

  const handleBehaviorChange = useCallback(
    (next: Behavior) => {
      if (!settings) return;
      if (next.idleTimeoutMinutes !== auth.idleTimeoutMinutes) {
        void auth.setIdleTimeoutMinutes(next.idleTimeoutMinutes);
      }
      const patch: Partial<Omit<StoredSettings, 'id'>> = {};
      if (next.requireUnlockOnEnter !== settings.requireUnlockOnEnter) {
        patch.requireUnlockOnEnter = next.requireUnlockOnEnter;
      }
      if (next.requireUnlockOnExit !== settings.requireUnlockOnExit) {
        patch.requireUnlockOnExit = next.requireUnlockOnExit;
      }
      if (next.requireUnlockOnExport !== settings.requireUnlockOnExport) {
        patch.requireUnlockOnExport = next.requireUnlockOnExport;
      }
      if (Object.keys(patch).length > 0) {
        void persist(patch);
      }
    },
    [auth, persist, settings],
  );

  const handleGenerate = useCallback(async () => {
    if (!selectedProtocolHash) return;
    setIsGenerating(true);
    setProgress({ current: 0, total: count });
    try {
      const created = await generateSyntheticSessions({
        protocolHash: selectedProtocolHash,
        count,
        simulateDropOut,
        respectSkipLogicAndFiltering,
        onProgress: (current, total) => setProgress({ current, total }),
      });
      toast.add({
        title: `Generated ${created} synthetic session${created === 1 ? '' : 's'}`,
        variant: 'success',
      });
      await reloadSynthetic();
      onDataChange?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.add({
        title: 'Generation failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [
    selectedProtocolHash,
    count,
    simulateDropOut,
    respectSkipLogicAndFiltering,
    toast,
    reloadSynthetic,
    onDataChange,
  ]);

  const handleDeleteSynthetic = useCallback(async () => {
    if (syntheticCount === 0) return;
    await confirm({
      title: `Delete ${syntheticCount} synthetic session${syntheticCount === 1 ? '' : 's'}?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      intent: 'destructive',
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          const deleted = await deleteSyntheticSessions();
          toast.add({
            title: `Deleted ${deleted} synthetic session${deleted === 1 ? '' : 's'}`,
            variant: 'success',
          });
          await reloadSynthetic();
          onDataChange?.();
        } finally {
          setIsDeleting(false);
        }
      },
    });
  }, [confirm, onDataChange, reloadSynthetic, syntheticCount, toast]);

  const storagePercent = storage.percent !== null ? storage.percent / 100 : 0;
  const storageHasValues = storage.usage !== null && storage.quota !== null;
  const storageLabel = storageHasValues
    ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}${
        storage.percent !== null ? ` (${storage.percent.toFixed(1)}%)` : ''
      }`
    : 'Unknown';
  // `persisted` = the browser has promised not to evict this origin's data;
  // `best-effort` = it may be cleared under storage pressure.
  const durabilityLabel =
    storagePersisted === null
      ? null
      : storagePersisted
        ? `Offline storage: protected from eviction${
            storage.usage !== null
              ? ` · ${formatBytes(storage.usage)} used`
              : ''
          }`
        : 'Offline storage: best-effort — the browser may clear it under storage pressure';

  const protocolOptions = protocols.map((p) => ({
    value: p.hash,
    label: p.name,
  }));
  const noProtocols = protocols.length === 0;
  const percentProgress =
    progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  const behavior: Behavior = {
    idleTimeoutMinutes: auth.idleTimeoutMinutes,
    requireUnlockOnEnter: settings?.requireUnlockOnEnter ?? true,
    requireUnlockOnExit: settings?.requireUnlockOnExit ?? false,
    requireUnlockOnExport: settings?.requireUnlockOnExport ?? false,
  };

  return (
    <HomeModal
      open={open}
      onClose={onClose}
      maxWidth={1000}
      scroll={false}
      title={
        <Heading level="h3" margin="none">
          Settings
        </Heading>
      }
    >
      <div className="grid min-h-0 flex-1 grid-cols-[210px_1fr] gap-7">
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

        <ScrollArea viewportClassName="pr-4">
          {section === 'about' && settings ? (
            <>
              <SettingsRow
                title="App version"
                desc="Network Canvas Interviewer"
                control={
                  <span className="font-monospace text-text/60 text-xs tracking-[0.02em]">
                    {APP_VERSION}
                  </span>
                }
              />
              <SettingsRow
                title="Storage"
                desc={storageLabel}
                control={
                  storageHasValues ? (
                    <div className="w-[220px]">
                      <StorageProgress value={storagePercent} />
                    </div>
                  ) : (
                    <span className="font-monospace text-text/60 text-xs tracking-[0.02em]">
                      —
                    </span>
                  )
                }
              />
              {durabilityLabel ? (
                <SettingsRow
                  title="Offline storage"
                  desc={durabilityLabel}
                  control={
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs ${
                        storagePersisted ? 'text-text/60' : 'text-warning'
                      }`}
                    >
                      {storagePersisted ? (
                        <ShieldCheck className="size-3.5" aria-hidden />
                      ) : (
                        <ShieldAlert className="size-3.5" aria-hidden />
                      )}
                      {storagePersisted ? 'Persisted' : 'Best-effort'}
                    </span>
                  }
                />
              ) : null}
              <SettingsRow
                title="Installation ID"
                desc="Unique per-device identifier"
                control={
                  <span className="font-monospace text-text/60 text-xs tracking-[0.02em]">
                    {installationId}
                  </span>
                }
              />
              <UnconnectedField
                name="showSampleProtocol"
                label="Show sample protocol on home screen"
                hint="Re-shows the one-click sample protocol card next to the Import card."
                inline
                component={ToggleField}
                value={!settings.sampleProtocolDismissed}
                onChange={(next: boolean | undefined) =>
                  void persist({ sampleProtocolDismissed: next !== true })
                }
              />
            </>
          ) : null}

          {section === 'interview' && settings ? (
            <>
              <UnconnectedField
                name="allowStageNavigation"
                label="Allow stage navigation"
                hint="Let participants move between stages by tapping the progress bar during an interview, which opens a stages menu."
                inline
                component={ToggleField}
                value={settings.allowStageNavigation}
                onChange={(next: boolean | undefined) =>
                  void persist({ allowStageNavigation: next === true })
                }
              />
              <Paragraph intent="smallText" emphasis="muted">
                When off, participants can only move forwards and backwards one
                stage at a time. Turning this on lets them jump directly to any
                stage, which is useful for piloting a protocol but is usually
                left off for real interviews.
              </Paragraph>
            </>
          ) : null}

          {section === 'data' && settings ? (
            <>
              <UnconnectedField
                name="exportGraphML"
                label="Export GraphML"
                hint="Include GraphML files in interview exports."
                inline
                component={ToggleField}
                value={settings.exportGraphML}
                onChange={(next: boolean | undefined) =>
                  void persist({ exportGraphML: next === true })
                }
              />
              <UnconnectedField
                name="exportCSV"
                label="Export CSV"
                hint="Include CSV files (attributes, edges, ego) in interview exports."
                inline
                component={ToggleField}
                value={settings.exportCSV}
                onChange={(next: boolean | undefined) =>
                  void persist({ exportCSV: next === true })
                }
              />
              <UnconnectedField
                name="useScreenLayoutCoordinates"
                label="Export node positions as screen-coordinate pixels"
                hint="Sociogram node positions are exported in pixel coordinates relative to the layout below."
                inline
                component={ToggleField}
                value={settings.useScreenLayoutCoordinates}
                onChange={(next: boolean | undefined) =>
                  void persist({ useScreenLayoutCoordinates: next === true })
                }
              />
              <UnconnectedField
                inline
                name="screenLayoutWidth"
                label="Screen layout width"
                hint="Pixels"
                component={InputField}
                type="number"
                min={1}
                value={String(settings.screenLayoutWidth)}
                onChange={(next: string | undefined) => {
                  const parsed = Number.parseInt(next ?? '', 10);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    void persist({ screenLayoutWidth: parsed });
                  }
                }}
              />
              <UnconnectedField
                inline
                name="screenLayoutHeight"
                label="Screen layout height"
                hint="Pixels"
                component={InputField}
                type="number"
                min={1}
                value={String(settings.screenLayoutHeight)}
                onChange={(next: string | undefined) => {
                  const parsed = Number.parseInt(next ?? '', 10);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    void persist({ screenLayoutHeight: parsed });
                  }
                }}
              />
            </>
          ) : null}

          {section === 'privacy' ? (
            <>
              <UnconnectedField
                name="analyticsEnabled"
                label="Enable analytics"
                hint="Send anonymous usage and error data to help the Network Canvas team improve the app."
                inline
                component={ToggleField}
                value={analytics.enabled}
                onChange={(next: boolean | undefined) =>
                  void analytics.setEnabled(next === true)
                }
              />
              <Paragraph intent="smallText" emphasis="muted">
                When analytics are enabled, the app sends a small amount of
                anonymous information about how it is used — for example which
                interview stages and features are exercised, when protocols are
                imported, when data is exported, and details of any errors or
                crashes. This helps us find bugs and decide what to improve.
              </Paragraph>
              <Alert variant="info">
                <AlertTitle>No participant data is ever collected.</AlertTitle>
                <AlertDescription>
                  Network data, responses, case IDs, protocol contents, and
                  asset files never leave this device. Analytics also contain no
                  user-identifiable information.
                </AlertDescription>
              </Alert>
            </>
          ) : null}

          {section === 'security' && settings ? (
            <>
              <ManageAuthenticator />
              {auth.mode !== 'none' ? (
                <>
                  <Alert variant="info">
                    Use the lock button in the top bar to lock immediately.
                  </Alert>
                  <SecurityBehaviorControls
                    value={behavior}
                    onChange={handleBehaviorChange}
                  />
                </>
              ) : null}
              <ResetDeviceRow />
            </>
          ) : null}

          {section === 'synthetic' ? (
            <>
              <Paragraph intent="smallText" emphasis="muted">
                Generate synthetic interview sessions to validate the export
                pipeline. Synthetic sessions appear in the regular Sessions list
                and export identically to real sessions.
              </Paragraph>

              <UnconnectedField
                name="syntheticProtocol"
                label="Protocol"
                hint={
                  noProtocols
                    ? 'Import a protocol first.'
                    : 'The protocol used to shape generated sessions.'
                }
                component={SelectField}
                options={protocolOptions}
                value={selectedProtocolHash}
                disabled={isGenerating || noProtocols}
                onChange={(v: string | number | undefined) =>
                  setSelectedProtocolHash(typeof v === 'string' ? v : '')
                }
              />
              <UnconnectedField
                name="syntheticCount"
                label="Number of sessions"
                component={InputField}
                type="number"
                min={1}
                max={1000}
                value={String(count)}
                disabled={isGenerating}
                onChange={(next: string | undefined) => {
                  const parsed = Number.parseInt(next ?? '', 10);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setCount(Math.min(1000, Math.max(1, parsed)));
                  }
                }}
              />
              <UnconnectedField
                name="simulateDropOut"
                label="Simulate participant drop-out"
                hint="Some sessions will be left incomplete to mirror real-world data."
                inline
                component={ToggleField}
                value={simulateDropOut}
                disabled={isGenerating}
                onChange={(v: boolean | undefined) =>
                  setSimulateDropOut(v === true)
                }
              />
              <UnconnectedField
                name="respectSkipLogicAndFiltering"
                label="Respect skip logic and filtering"
                hint="Apply protocol skip logic and stage filters during generation."
                inline
                component={ToggleField}
                value={respectSkipLogicAndFiltering}
                disabled={isGenerating}
                onChange={(v: boolean | undefined) =>
                  setRespectSkipLogicAndFiltering(v === true)
                }
              />

              <div className="my-6">
                <Button
                  onClick={() => void handleGenerate()}
                  disabled={
                    !selectedProtocolHash || isGenerating || noProtocols
                  }
                  icon={<FlaskConical className="size-4" aria-hidden />}
                >
                  {isGenerating ? 'Generating…' : 'Generate'}
                </Button>
              </div>

              {isGenerating ? (
                <div className="my-6">
                  <ProgressBar
                    orientation="horizontal"
                    percentProgress={percentProgress}
                    label="Generation progress"
                    className="text-sea-green h-2"
                  />
                  <div className="text-text/60 mt-2 text-sm">
                    {progress.current} / {progress.total} interviews generated
                  </div>
                </div>
              ) : null}

              <SettingsRow
                title="Delete synthetic data"
                desc={`There ${syntheticCount === 1 ? 'is' : 'are'} currently ${syntheticCount} synthetic session${syntheticCount === 1 ? '' : 's'} on this device.`}
                control={
                  <Button
                    color="destructive"
                    onClick={() => void handleDeleteSynthetic()}
                    disabled={syntheticCount === 0 || isDeleting}
                    icon={<Trash2 className="size-4" aria-hidden />}
                  >
                    Delete All
                  </Button>
                }
              />
            </>
          ) : null}
        </ScrollArea>
      </div>
    </HomeModal>
  );
}
