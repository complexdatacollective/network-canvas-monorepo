import {
  FlaskConical,
  Info,
  LineChart,
  Languages,
  Route,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload as UploadIcon,
} from 'lucide-react';
import { createElement, useCallback, useEffect, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import { Tabs, TabsPanel } from '@codaco/fresco-ui/Tabs';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { SyntheticDataConstraintError } from '@codaco/protocol-utilities';
import { GenerationFailureDescription } from '~/components/GenerationFailureDescription';
import { HomeModal } from '~/components/HomeModal';
import {
  ManageAuthenticator,
  ResetDeviceRow,
} from '~/components/ManageAuthenticator';
import SecurityBehaviorControls, {
  type Behavior,
} from '~/components/SecurityBehaviorControls';
import { SettingsRow } from '~/components/SettingsRow';
import { useSetupWizard } from '~/components/SetupWizardDialog';
import { LanguageSettings } from '~/i18n/LanguageSettings';
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

// Decorative unknown-value marker; the adjacent description names the state.
const EMPTY_STORAGE_VALUE = '—';

const messages = defineMessages({
  storageUsage: {
    id: 'interviewer.settingsDialog.storageUsage',
    defaultMessage: 'Storage usage',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  couldNotRefreshSyntheticSessionInfo: {
    id: 'interviewer.settingsDialog.couldNotRefreshSyntheticSessionInfo',
    defaultMessage: 'Could not refresh synthetic session info',
    description: 'User-facing message in Interviewer Settings Dialog.',
  },
  theProtocolListAndSessionCountAbove: {
    id: 'interviewer.settingsDialog.theProtocolListAndSessionCountAbove',
    defaultMessage:
      'The protocol list and session count above may not match what is actually stored on this device. Reopen Settings to refresh them.',
    description: 'User-facing message in Interviewer Settings Dialog.',
  },
  generationFailed: {
    id: 'interviewer.settingsDialog.generationFailed',
    defaultMessage: 'Generation failed',
    description: 'User-facing message in Interviewer Settings Dialog.',
  },
  thisCannotBeUndone: {
    id: 'interviewer.settingsDialog.thisCannotBeUndone',
    defaultMessage: 'This cannot be undone.',
    description: 'User-facing message in Interviewer Settings Dialog.',
  },
  unknown: {
    id: 'interviewer.settingsDialog.unknown',
    defaultMessage: 'Unknown',
    description:
      'Storage estimate shown when the browser cannot report device usage.',
  },
  settings: {
    id: 'interviewer.settingsDialog.settings',
    defaultMessage: 'Settings',
    description: 'Visible copy in Interviewer Settings Dialog.',
  },
  settingsSections: {
    id: 'interviewer.settingsDialog.settingsSections',
    defaultMessage: 'Settings sections',
    description: 'The aria-label label in Interviewer Settings Dialog.',
  },
  appVersion: {
    id: 'interviewer.settingsDialog.appVersion',
    defaultMessage: 'App version',
    description: 'The title label in Interviewer Settings Dialog.',
  },
  networkCanvasInterviewer: {
    id: 'interviewer.settingsDialog.networkCanvasInterviewer',
    defaultMessage: 'Network Canvas Interviewer',
    description: 'The desc label in Interviewer Settings Dialog.',
  },
  storage: {
    id: 'interviewer.settingsDialog.storage',
    defaultMessage: 'Storage',
    description: 'The title label in Interviewer Settings Dialog.',
  },
  offlineStorage: {
    id: 'interviewer.settingsDialog.offlineStorage',
    defaultMessage: 'Offline storage',
    description: 'The title label in Interviewer Settings Dialog.',
  },
  installationID: {
    id: 'interviewer.settingsDialog.installationID',
    defaultMessage: 'Installation ID',
    description: 'The title label in Interviewer Settings Dialog.',
  },
  uniquePerDeviceIdentifier: {
    id: 'interviewer.settingsDialog.uniquePerDeviceIdentifier',
    defaultMessage: 'Unique per-device identifier',
    description: 'The desc label in Interviewer Settings Dialog.',
  },
  showSampleProtocolOnHomeScreen: {
    id: 'interviewer.settingsDialog.showSampleProtocolOnHomeScreen',
    defaultMessage: 'Show sample protocol on home screen',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  reShowsTheOneClickSampleProtocol: {
    id: 'interviewer.settingsDialog.reShowsTheOneClickSampleProtocol',
    defaultMessage:
      'Re-shows the one-click sample protocol card next to the Import card.',
    description: 'The hint label in Interviewer Settings Dialog.',
  },
  allowStageNavigation: {
    id: 'interviewer.settingsDialog.allowStageNavigation',
    defaultMessage: 'Allow stage navigation',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  letParticipantsMoveBetweenStagesByTapping: {
    id: 'interviewer.settingsDialog.letParticipantsMoveBetweenStagesByTapping',
    defaultMessage:
      'Let participants move between stages by tapping the progress bar during an interview, which opens a stages menu.',
    description: 'The hint label in Interviewer Settings Dialog.',
  },
  whenOffParticipantsCanOnlyMoveForwards: {
    id: 'interviewer.settingsDialog.whenOffParticipantsCanOnlyMoveForwards',
    defaultMessage:
      'When off, participants can only move forwards and backwards one stage at a time. Turning this on lets them jump directly to any stage, which is useful for piloting a protocol but is usually left off for real interviews.',
    description: 'Visible copy in Interviewer Settings Dialog.',
  },
  exportGraphML: {
    id: 'interviewer.settingsDialog.exportGraphML',
    defaultMessage: 'Export GraphML',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  includeGraphMLFilesInInterviewExports: {
    id: 'interviewer.settingsDialog.includeGraphMLFilesInInterviewExports',
    defaultMessage: 'Include GraphML files in interview exports.',
    description: 'The hint label in Interviewer Settings Dialog.',
  },
  exportCSV: {
    id: 'interviewer.settingsDialog.exportCSV',
    defaultMessage: 'Export CSV',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  includeCSVFilesAttributesEdgesEgoIn: {
    id: 'interviewer.settingsDialog.includeCSVFilesAttributesEdgesEgoIn',
    defaultMessage:
      'Include CSV files (attributes, edges, ego) in interview exports.',
    description: 'The hint label in Interviewer Settings Dialog.',
  },
  exportNodePositionsAsScreenCoordinatePixels: {
    id: 'interviewer.settingsDialog.exportNodePositionsAsScreenCoordinatePixels',
    defaultMessage: 'Export node positions as screen-coordinate pixels',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  sociogramNodePositionsAreExportedInPixel: {
    id: 'interviewer.settingsDialog.sociogramNodePositionsAreExportedInPixel',
    defaultMessage:
      'Sociogram node positions are exported in pixel coordinates relative to the layout below.',
    description: 'The hint label in Interviewer Settings Dialog.',
  },
  screenLayoutWidth: {
    id: 'interviewer.settingsDialog.screenLayoutWidth',
    defaultMessage: 'Screen layout width',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  pixels: {
    id: 'interviewer.settingsDialog.pixels',
    defaultMessage: 'Pixels',
    description: 'The hint label in Interviewer Settings Dialog.',
  },
  screenLayoutHeight: {
    id: 'interviewer.settingsDialog.screenLayoutHeight',
    defaultMessage: 'Screen layout height',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  enableAnalytics: {
    id: 'interviewer.settingsDialog.enableAnalytics',
    defaultMessage: 'Enable analytics',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  sendAnonymousUsageAndErrorDataTo: {
    id: 'interviewer.settingsDialog.sendAnonymousUsageAndErrorDataTo',
    defaultMessage:
      'Send anonymous usage and error data to help the Network Canvas team improve the app.',
    description: 'The hint label in Interviewer Settings Dialog.',
  },
  whenAnalyticsAreEnabledTheAppSends: {
    id: 'interviewer.settingsDialog.whenAnalyticsAreEnabledTheAppSends',
    defaultMessage:
      'When analytics are enabled, the app sends a small amount of anonymous information about how it is used — for example which interview stages and features are exercised, when protocols are imported, when data is exported, and details of any errors or crashes. This helps us find bugs and decide what to improve.',
    description: 'Visible copy in Interviewer Settings Dialog.',
  },
  noParticipantDataIsEverCollected: {
    id: 'interviewer.settingsDialog.noParticipantDataIsEverCollected',
    defaultMessage: 'No participant data is ever collected.',
    description: 'Visible copy in Interviewer Settings Dialog.',
  },
  networkDataResponsesCaseIDsProtocolContents: {
    id: 'interviewer.settingsDialog.networkDataResponsesCaseIDsProtocolContents',
    defaultMessage:
      'Network data, responses, case IDs, protocol contents, and asset files never leave this device. Analytics also contain no user-identifiable information.',
    description: 'Visible copy in Interviewer Settings Dialog.',
  },
  enableAppSecurity: {
    id: 'interviewer.settingsDialog.enableAppSecurity',
    defaultMessage: 'Enable app security',
    description: 'The title label in Interviewer Settings Dialog.',
  },
  runTheGetStartedWizardToConfigure: {
    id: 'interviewer.settingsDialog.runTheGetStartedWizardToConfigure',
    defaultMessage:
      'Run the Get started wizard to configure a device lock and choose your security preferences.',
    description: 'The desc label in Interviewer Settings Dialog.',
  },
  getStarted: {
    id: 'interviewer.settingsDialog.getStarted',
    defaultMessage: 'Get started',
    description:
      'Action that opens security setup for a device currently used without a lock.',
  },
  useTheLockButtonInTheTop: {
    id: 'interviewer.settingsDialog.useTheLockButtonInTheTop',
    defaultMessage: 'Use the lock button in the top bar to lock immediately.',
    description: 'Visible copy in Interviewer Settings Dialog.',
  },
  generateSyntheticInterviewSessionsToValidateThe: {
    id: 'interviewer.settingsDialog.generateSyntheticInterviewSessionsToValidateThe',
    defaultMessage:
      'Generate synthetic interview sessions to validate the export pipeline. Synthetic sessions appear in the regular Sessions list and export identically to real sessions.',
    description: 'Visible copy in Interviewer Settings Dialog.',
  },
  protocol: {
    id: 'interviewer.settingsDialog.protocol',
    defaultMessage: 'Protocol',
    description:
      'Research protocol selector used when generating synthetic interview sessions.',
  },
  importAProtocolFirst: {
    id: 'interviewer.settingsDialog.importAProtocolFirst',
    defaultMessage: 'Import a protocol first.',
    description: 'User-facing message in Interviewer Settings Dialog.',
  },
  theProtocolUsedToShapeGeneratedSessions: {
    id: 'interviewer.settingsDialog.theProtocolUsedToShapeGeneratedSessions',
    defaultMessage: 'The protocol used to shape generated sessions.',
    description: 'User-facing message in Interviewer Settings Dialog.',
  },
  numberOfSessions: {
    id: 'interviewer.settingsDialog.numberOfSessions',
    defaultMessage: 'Number of sessions',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  simulateParticipantDropOut: {
    id: 'interviewer.settingsDialog.simulateParticipantDropOut',
    defaultMessage: 'Simulate participant drop-out',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  someSessionsWillBeLeftIncompleteTo: {
    id: 'interviewer.settingsDialog.someSessionsWillBeLeftIncompleteTo',
    defaultMessage:
      'Some sessions will be left incomplete to mirror real-world data.',
    description: 'The hint label in Interviewer Settings Dialog.',
  },
  respectSkipLogicAndFiltering: {
    id: 'interviewer.settingsDialog.respectSkipLogicAndFiltering',
    defaultMessage: 'Respect skip logic and filtering',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  applyProtocolSkipLogicAndStageFilters: {
    id: 'interviewer.settingsDialog.applyProtocolSkipLogicAndStageFilters',
    defaultMessage:
      'Apply protocol skip logic and stage filters during generation.',
    description: 'The hint label in Interviewer Settings Dialog.',
  },
  generating: {
    id: 'interviewer.settingsDialog.generating',
    defaultMessage: 'Generating…',
    description: 'User-facing message in Interviewer Settings Dialog.',
  },
  generate: {
    id: 'interviewer.settingsDialog.generate',
    defaultMessage: 'Generate',
    description:
      'Action that creates the requested number of synthetic interview sessions.',
  },
  generationProgress: {
    id: 'interviewer.settingsDialog.generationProgress',
    defaultMessage: 'Generation progress',
    description: 'The label label in Interviewer Settings Dialog.',
  },
  currentTotalInterviewsGenerated: {
    id: 'interviewer.settingsDialog.currentTotalInterviewsGenerated',
    defaultMessage:
      '{current, number} / {total, plural, one {# interview generated} other {# interviews generated}}',
    description:
      'Progress below the synthetic data generation button. current is the number already generated, and total is the requested number; the noun agrees with the requested total.',
  },
  deleteSyntheticData: {
    id: 'interviewer.settingsDialog.deleteSyntheticData',
    defaultMessage: 'Delete synthetic data',
    description: 'The title label in Interviewer Settings Dialog.',
  },
  deleteAll: {
    id: 'interviewer.settingsDialog.deleteAll',
    defaultMessage: 'Delete All',
    description:
      'Action that deletes all generated synthetic sessions, preserving real interview sessions.',
  },
  persisted: {
    id: 'interviewer.settingsDialog.persisted',
    defaultMessage: 'Persisted',
    description:
      'Storage badge when the browser has granted persistent device storage.',
  },
  about: {
    id: 'interviewer.settingsDialog.about',
    defaultMessage: 'About',
    description: 'Administration text in Interviewer SettingsDialog.',
  },
  language: {
    id: 'interviewer.settingsDialog.language',
    defaultMessage: 'Language',
    description:
      'Navigation tab for the device administration language preference.',
  },
  interview: {
    id: 'interviewer.settingsDialog.interview',
    defaultMessage: 'Interview',
    description:
      'Navigation tab for interview behavior preferences, separate from participant answers.',
  },
  dataExport: {
    id: 'interviewer.settingsDialog.dataExport',
    defaultMessage: 'Data export',
    description: 'Administration text in Interviewer SettingsDialog.',
  },
  privacy: {
    id: 'interviewer.settingsDialog.privacy',
    defaultMessage: 'Privacy',
    description: 'Administration text in Interviewer SettingsDialog.',
  },
  security: {
    id: 'interviewer.settingsDialog.security',
    defaultMessage: 'Security',
    description:
      'Navigation tab for device authentication, lock behavior and data-reset controls.',
  },
  syntheticData: {
    id: 'interviewer.settingsDialog.syntheticData',
    defaultMessage: 'Synthetic data',
    description: 'Administration text in Interviewer SettingsDialog.',
  },
  generated: {
    id: 'interviewer.settingsDialog.generated',
    defaultMessage:
      '{count, plural, one {Generated # synthetic session} other {Generated # synthetic sessions}}',
    description:
      'Success toast after generating synthetic interviews; count is the number created.',
  },
  deleteSynthetic: {
    id: 'interviewer.settingsDialog.deleteSynthetic',
    defaultMessage:
      '{count, plural, one {Delete # synthetic session?} other {Delete # synthetic sessions?}}',
    description:
      'Confirmation heading before permanently deleting generated interviews.',
  },
  deleted: {
    id: 'interviewer.settingsDialog.deleted',
    defaultMessage:
      '{count, plural, one {Deleted # synthetic session} other {Deleted # synthetic sessions}}',
    description: 'Administration text in Interviewer SettingsDialog.',
  },
  syntheticCount: {
    id: 'interviewer.settingsDialog.syntheticCount',
    defaultMessage:
      '{count, plural, one {There is currently # synthetic session on this device.} other {There are currently # synthetic sessions on this device.}}',
    description: 'Administration text in Interviewer SettingsDialog.',
  },
  storageUsed: {
    id: 'interviewer.settingsDialog.storageUsed',
    defaultMessage:
      '{hasPercent, select, true {{used} of {total} ({percent})} other {{used} of {total}}}',
    description: 'Administration text in Interviewer SettingsDialog.',
  },
  storageProtected: {
    id: 'interviewer.settingsDialog.storageProtected',
    defaultMessage:
      '{hasUsage, select, true {Offline storage: protected from eviction · {used} used} other {Offline storage: protected from eviction}}',
    description: 'Administration text in Interviewer SettingsDialog.',
  },
  storageBestEffort: {
    id: 'interviewer.settingsDialog.storageBestEffort',
    defaultMessage:
      'Offline storage: best-effort — it may be cleared under storage pressure',
    description: 'Administration text in Interviewer SettingsDialog.',
  },
  bestEffort: {
    id: 'interviewer.settingsDialog.bestEffort',
    defaultMessage: 'Best-effort',
    description:
      'Storage badge when the browser may evict app data under storage pressure.',
  },
  deleteFailedHelp: {
    id: 'interviewer.settingsDialog.deleteFailedHelp',
    defaultMessage: 'Synthetic data could not be deleted. Please try again.',
    description:
      'Retry guidance retained in the synthetic data deletion confirmation after device storage fails.',
  },
  generationFailedHelp: {
    id: 'interviewer.settingsDialog.generationFailedHelp',
    defaultMessage: 'Synthetic data could not be generated. Please try again.',
    description: 'Administration text in Interviewer SettingsDialog.',
  },
});

type SettingsDialogProps = {
  open: boolean;
  onClose: () => void;
  // Invoked after synthetic sessions are generated or deleted so the host can
  // refresh views that read sessions (StatusRow, the data table).
  onDataChange?: () => void;
};

type Section =
  | 'language'
  | 'about'
  | 'interview'
  | 'data'
  | 'privacy'
  | 'security'
  | 'synthetic';

function StorageProgress({ value }: { value: number }) {
  const intl = useAppIntl();
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <ProgressBar
      orientation="horizontal"
      percentProgress={clamped * 100}
      label={intl.formatMessage(messages.storageUsage)}
      className="text-sea-green h-2"
    />
  );
}

const NAV_ITEMS: {
  id: Section;
  label: MessageDescriptor;
  icon: typeof Info;
}[] = [
  { id: 'about', label: messages.about, icon: Info },
  { id: 'language', label: messages.language, icon: Languages },
  { id: 'interview', label: messages.interview, icon: Route },
  { id: 'data', label: messages.dataExport, icon: UploadIcon },
  { id: 'privacy', label: messages.privacy, icon: LineChart },
  { id: 'security', label: messages.security, icon: Shield },
  { id: 'synthetic', label: messages.syntheticData, icon: FlaskConical },
];

const NARROW_SETTINGS_QUERY = '(max-width: 639px)';

export function SettingsDialog({
  open,
  onClose,
  onDataChange,
}: SettingsDialogProps) {
  const intl = useAppIntl();
  const auth = useAuth();
  const analytics = useAnalytics();
  const toast = useToast();
  const addToastRef = useRef(toast.add);
  useEffect(() => {
    addToastRef.current = toast.add;
  }, [toast.add]);
  const { confirm } = useDialog();
  const { openSetupWizard } = useSetupWizard({ preserveExistingData: true });
  const [narrow, setNarrow] = useState(
    () => globalThis.matchMedia?.(NARROW_SETTINGS_QUERY).matches ?? false,
  );
  useEffect(() => {
    const media = globalThis.matchMedia?.(NARROW_SETTINGS_QUERY);
    if (!media) return undefined;
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
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

  // Monotonic guard: the open-effect and the synthetic-tab effect can both call
  // reloadSynthetic concurrently, so an earlier (e.g. empty, pre-import-commit)
  // listProtocols() could otherwise resolve last and clobber a newer result.
  // Only the latest invocation is allowed to write state.
  const reloadSyntheticSeq = useRef(0);

  const reloadSynthetic = useCallback(async () => {
    const seq = ++reloadSyntheticSeq.current;
    const [ps, n] = await Promise.all([
      listProtocols(),
      countSyntheticSessions(),
    ]);
    if (seq !== reloadSyntheticSeq.current) return;
    setProtocols(ps);
    setSyntheticCount(n);
    // Default to the first protocol when none is selected yet.
    setSelectedProtocolHash((current) => {
      if (current && ps.some((p) => p.hash === current)) return current;
      return ps[0]?.hash ?? '';
    });
  }, []);

  const reloadSyntheticWithFeedback = useCallback(async () => {
    try {
      await reloadSynthetic();
    } catch {
      addToastRef.current({
        title: createElement(AppMessage, {
          message: messages.couldNotRefreshSyntheticSessionInfo,
        }),
        description: createElement(AppMessage, {
          message: messages.theProtocolListAndSessionCountAbove,
        }),
        variant: 'destructive',
        timeout: 0,
      });
    }
  }, [reloadSynthetic]);

  useEffect(() => {
    if (!open) return;
    void reload();
    void reloadSyntheticWithFeedback();
  }, [open, reload, reloadSyntheticWithFeedback]);

  // Re-query protocols whenever the Synthetic tab is (re)selected, so a protocol
  // imported moments before Settings opened — its DB write lands ~0.6-2.1s after
  // the deck shows its pending name — becomes selectable without reopening.
  useEffect(() => {
    if (!open || section !== 'synthetic') return;
    void reloadSyntheticWithFeedback();
  }, [open, section, reloadSyntheticWithFeedback]);

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
        title: createElement(AppMessage, {
          message: messages.generated,
          values: { count: created },
        }),
        variant: 'success',
      });
    } catch (error) {
      // A refused generation (unsatisfiable validation rules) carries a
      // structured `conflicts` array that renders as a readable list; any
      // other failure falls back to its flat message. Either way, this needs
      // a researcher to read and act on it, so it doesn't auto-dismiss.
      if (error instanceof SyntheticDataConstraintError) {
        toast.add({
          title: createElement(AppMessage, {
            message: messages.generationFailed,
          }),
          description: <GenerationFailureDescription error={error} />,
          variant: 'destructive',
          timeout: 0,
        });
      } else {
        console.error('Synthetic data generation failed', error);
        toast.add({
          title: createElement(AppMessage, {
            message: messages.generationFailed,
          }),
          description: <AppMessage message={messages.generationFailedHelp} />,
          variant: 'destructive',
          timeout: 0,
        });
      }
    } finally {
      setIsGenerating(false);
      await reloadSyntheticWithFeedback();
      onDataChange?.();
    }
  }, [
    selectedProtocolHash,
    count,
    simulateDropOut,
    respectSkipLogicAndFiltering,
    toast,
    reloadSyntheticWithFeedback,
    onDataChange,
  ]);

  const handleDeleteSynthetic = useCallback(async () => {
    if (syntheticCount === 0) return;
    await confirm({
      title: createElement(AppMessage, {
        message: messages.deleteSynthetic,
        values: {
          count: syntheticCount,
        },
      }),
      description: createElement(AppMessage, {
        message: messages.thisCannotBeUndone,
      }),
      confirmLabel: createElement(AppMessage, {
        message: commonMessages.delete,
      }),
      describeError: () => <AppMessage message={messages.deleteFailedHelp} />,
      intent: 'destructive',
      onConfirm: async () => {
        setIsDeleting(true);
        // deleteSyntheticSessions()'s own rejection is deliberately left
        // uncaught here: useDialog's confirm() already gives a failed
        // onConfirm its own handling — DialogProvider.handleConfirm catches
        // it, keeps this confirm dialog open, and shows the error inline so
        // the researcher can retry (see fresco-ui's "Async Confirm — Error
        // Handling" story). Catching it here too would swallow that
        // rejection, which would make handleConfirm see a *resolved*
        // promise and close the dialog as if the delete had succeeded —
        // exactly the "looks fine, actually didn't happen" failure mode this
        // fix is about, just moved one level up.
        try {
          const deleted = await deleteSyntheticSessions();
          toast.add({
            title: createElement(AppMessage, {
              message: messages.deleted,
              values: { count: deleted },
            }),
            variant: 'success',
          });
        } finally {
          setIsDeleting(false);
          await reloadSyntheticWithFeedback();
          onDataChange?.();
        }
      },
    });
  }, [
    confirm,
    onDataChange,
    reloadSyntheticWithFeedback,
    syntheticCount,
    toast,
  ]);

  const storagePercent = storage.percent !== null ? storage.percent / 100 : 0;
  const storageHasValues = storage.usage !== null && storage.quota !== null;
  const storageLabel = storageHasValues
    ? intl.formatMessage(messages.storageUsed, {
        used: formatBytes(storage.usage, intl),
        total: formatBytes(storage.quota, intl),
        hasPercent: String(storage.percent !== null),
        percent: intl.formatNumber((storage.percent ?? 0) / 100, {
          style: 'percent',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      })
    : intl.formatMessage(messages.unknown);
  const durabilityLabel =
    storagePersisted === null
      ? null
      : storagePersisted
        ? intl.formatMessage(messages.storageProtected, {
            hasUsage: String(storage.usage !== null),
            used: formatBytes(storage.usage, intl),
          })
        : intl.formatMessage(messages.storageBestEffort);

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
  const hasNoDeviceLock =
    auth.kind === 'unconfigured' ||
    (auth.kind === 'unlocked' && auth.mode === 'none');

  const handleStartSetup = () => {
    onClose();
    void openSetupWizard();
  };

  return (
    <HomeModal
      open={open}
      onClose={onClose}
      maxWidth={1100}
      scroll={false}
      title={
        <Heading level="h3" margin="none">
          {intl.formatMessage(messages.settings)}
        </Heading>
      }
    >
      <Tabs
        aria-label={intl.formatMessage(messages.settingsSections)}
        layout={narrow ? 'top' : 'side'}
        value={section}
        onValueChange={(next) => {
          const item = NAV_ITEMS.find((i) => i.id === next);
          if (item) setSection(item.id);
        }}
        tabs={NAV_ITEMS.map((item) => ({
          value: item.id,
          label: createElement(AppMessage, { message: item.label }),
          icon: item.icon,
        }))}
        className="min-h-0 flex-1"
      >
        <ScrollArea
          viewportClassName="@container pr-4"
          className="min-w-0 flex-1"
        >
          <TabsPanel value="about">
            {settings ? (
              <>
                <SettingsRow
                  title={intl.formatMessage(messages.appVersion)}
                  desc={intl.formatMessage(messages.networkCanvasInterviewer)}
                  control={
                    <span className="font-monospace text-text/60 text-xs tracking-[0.02em]">
                      {APP_VERSION}
                    </span>
                  }
                />
                <SettingsRow
                  title={intl.formatMessage(messages.storage)}
                  desc={storageLabel}
                  control={
                    storageHasValues ? (
                      // Fluid when the row is stacked (full width), fixed 220px
                      // once the SettingsRow container is wide enough to go
                      // two-column — same 26rem threshold as SettingsRow itself.
                      <div className="w-full @min-[26rem]:w-[220px]">
                        <StorageProgress value={storagePercent} />
                      </div>
                    ) : (
                      <span
                        aria-hidden
                        className="font-monospace text-text/60 text-xs tracking-[0.02em]"
                      >
                        {EMPTY_STORAGE_VALUE}
                      </span>
                    )
                  }
                />
                {durabilityLabel ? (
                  <SettingsRow
                    title={intl.formatMessage(messages.offlineStorage)}
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
                        {storagePersisted
                          ? intl.formatMessage(messages.persisted)
                          : intl.formatMessage(messages.bestEffort)}
                      </span>
                    }
                  />
                ) : null}
                <SettingsRow
                  title={intl.formatMessage(messages.installationID)}
                  desc={intl.formatMessage(messages.uniquePerDeviceIdentifier)}
                  control={
                    <span className="font-monospace text-text/60 text-xs tracking-[0.02em]">
                      {installationId}
                    </span>
                  }
                />
                <UnconnectedField
                  name="showSampleProtocol"
                  label={intl.formatMessage(
                    messages.showSampleProtocolOnHomeScreen,
                  )}
                  hint={intl.formatMessage(
                    messages.reShowsTheOneClickSampleProtocol,
                  )}
                  inline
                  component={ToggleField}
                  value={!settings.sampleProtocolDismissed}
                  onChange={(next: boolean | undefined) =>
                    void persist({ sampleProtocolDismissed: next !== true })
                  }
                />
              </>
            ) : null}
          </TabsPanel>

          <TabsPanel value="language">
            <LanguageSettings />
          </TabsPanel>

          <TabsPanel value="interview">
            {settings ? (
              <>
                <UnconnectedField
                  name="allowStageNavigation"
                  label={intl.formatMessage(messages.allowStageNavigation)}
                  hint={intl.formatMessage(
                    messages.letParticipantsMoveBetweenStagesByTapping,
                  )}
                  inline
                  component={ToggleField}
                  value={settings.allowStageNavigation}
                  onChange={(next: boolean | undefined) =>
                    void persist({ allowStageNavigation: next === true })
                  }
                />
                <Paragraph intent="smallText" emphasis="muted">
                  {intl.formatMessage(
                    messages.whenOffParticipantsCanOnlyMoveForwards,
                  )}
                </Paragraph>
              </>
            ) : null}
          </TabsPanel>

          <TabsPanel value="data">
            {settings ? (
              <>
                <UnconnectedField
                  name="exportGraphML"
                  label={intl.formatMessage(messages.exportGraphML)}
                  hint={intl.formatMessage(
                    messages.includeGraphMLFilesInInterviewExports,
                  )}
                  inline
                  component={ToggleField}
                  value={settings.exportGraphML}
                  onChange={(next: boolean | undefined) =>
                    void persist({ exportGraphML: next === true })
                  }
                />
                <UnconnectedField
                  name="exportCSV"
                  label={intl.formatMessage(messages.exportCSV)}
                  hint={intl.formatMessage(
                    messages.includeCSVFilesAttributesEdgesEgoIn,
                  )}
                  inline
                  component={ToggleField}
                  value={settings.exportCSV}
                  onChange={(next: boolean | undefined) =>
                    void persist({ exportCSV: next === true })
                  }
                />
                <UnconnectedField
                  name="useScreenLayoutCoordinates"
                  label={intl.formatMessage(
                    messages.exportNodePositionsAsScreenCoordinatePixels,
                  )}
                  hint={intl.formatMessage(
                    messages.sociogramNodePositionsAreExportedInPixel,
                  )}
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
                  label={intl.formatMessage(messages.screenLayoutWidth)}
                  hint={intl.formatMessage(messages.pixels)}
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
                  label={intl.formatMessage(messages.screenLayoutHeight)}
                  hint={intl.formatMessage(messages.pixels)}
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
          </TabsPanel>

          <TabsPanel value="privacy">
            <>
              <UnconnectedField
                name="analyticsEnabled"
                label={intl.formatMessage(messages.enableAnalytics)}
                hint={intl.formatMessage(
                  messages.sendAnonymousUsageAndErrorDataTo,
                )}
                inline
                component={ToggleField}
                value={analytics.enabled}
                onChange={(next: boolean | undefined) =>
                  void analytics.setEnabled(next === true)
                }
              />
              <Paragraph intent="smallText" emphasis="muted">
                {intl.formatMessage(
                  messages.whenAnalyticsAreEnabledTheAppSends,
                )}
              </Paragraph>
              <Alert variant="info">
                <AlertTitle>
                  {intl.formatMessage(
                    messages.noParticipantDataIsEverCollected,
                  )}
                </AlertTitle>
                <AlertDescription>
                  {intl.formatMessage(
                    messages.networkDataResponsesCaseIDsProtocolContents,
                  )}
                </AlertDescription>
              </Alert>
            </>
          </TabsPanel>

          <TabsPanel value="security">
            {settings ? (
              <>
                <ManageAuthenticator />
                {hasNoDeviceLock ? (
                  <SettingsRow
                    title={intl.formatMessage(messages.enableAppSecurity)}
                    desc={intl.formatMessage(
                      messages.runTheGetStartedWizardToConfigure,
                    )}
                    control={
                      <Button
                        onClick={handleStartSetup}
                        icon={
                          <ShieldCheck className="size-4" aria-hidden="true" />
                        }
                      >
                        {intl.formatMessage(messages.getStarted)}
                      </Button>
                    }
                  />
                ) : null}
                {auth.kind === 'unlocked' && auth.mode !== 'none' ? (
                  <>
                    <Alert variant="info">
                      {intl.formatMessage(messages.useTheLockButtonInTheTop)}
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
          </TabsPanel>

          <TabsPanel value="synthetic">
            <>
              <Paragraph intent="smallText" emphasis="muted">
                {intl.formatMessage(
                  messages.generateSyntheticInterviewSessionsToValidateThe,
                )}
              </Paragraph>

              <UnconnectedField
                name="syntheticProtocol"
                label={intl.formatMessage(messages.protocol)}
                hint={
                  noProtocols
                    ? intl.formatMessage(messages.importAProtocolFirst)
                    : intl.formatMessage(
                        messages.theProtocolUsedToShapeGeneratedSessions,
                      )
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
                label={intl.formatMessage(messages.numberOfSessions)}
                data-testid="synthetic-count"
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
                label={intl.formatMessage(messages.simulateParticipantDropOut)}
                hint={intl.formatMessage(
                  messages.someSessionsWillBeLeftIncompleteTo,
                )}
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
                label={intl.formatMessage(
                  messages.respectSkipLogicAndFiltering,
                )}
                hint={intl.formatMessage(
                  messages.applyProtocolSkipLogicAndStageFilters,
                )}
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
                  data-testid="synthetic-generate"
                >
                  {isGenerating
                    ? intl.formatMessage(messages.generating)
                    : intl.formatMessage(messages.generate)}
                </Button>
              </div>

              {isGenerating ? (
                <div className="my-6">
                  <ProgressBar
                    orientation="horizontal"
                    percentProgress={percentProgress}
                    label={intl.formatMessage(messages.generationProgress)}
                    className="text-sea-green h-2"
                  />
                  <div className="text-text/60 mt-2 text-sm">
                    {intl.formatMessage(
                      messages.currentTotalInterviewsGenerated,
                      { current: progress.current, total: progress.total },
                    )}
                  </div>
                </div>
              ) : null}

              <SettingsRow
                title={intl.formatMessage(messages.deleteSyntheticData)}
                desc={intl.formatMessage(messages.syntheticCount, {
                  count: syntheticCount,
                })}
                control={
                  <Button
                    color="destructive"
                    onClick={() => void handleDeleteSynthetic()}
                    disabled={syntheticCount === 0 || isDeleting}
                    icon={<Trash2 className="size-4" aria-hidden />}
                  >
                    {intl.formatMessage(messages.deleteAll)}
                  </Button>
                }
              />
            </>
          </TabsPanel>
        </ScrollArea>
      </Tabs>
    </HomeModal>
  );
}
