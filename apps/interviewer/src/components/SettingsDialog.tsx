import {
  CloudCheck,
  CloudDownload,
  CloudOff,
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
import { Button } from '@codaco/fresco-ui/Button';
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
import { offlineMessages } from '~/components/offlineMessages';
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
import {
  isCurrentProtocol,
  type ProtocolWithCounts,
  type StoredSettings,
} from '~/lib/db/types';
import { getInstallationId } from '~/lib/installationId';
import { useAppOffline } from '~/lib/pwa/appOffline';
import { useOfflineDownload } from '~/lib/pwa/offlineDownload';
import {
  estimateStorage,
  formatBytes,
  isStoragePersisted,
  type StorageEstimate,
} from '~/lib/storage';

// Decorative unknown-value marker; the adjacent description names the state.
const EMPTY_STORAGE_VALUE = '—';

const messages = defineMessages({
  storageUsage: {
    id: 'interviewer.settingsDialog.storageUsage',
    defaultMessage: 'Storage usage',
    description:
      'Accessible name of the storage usage progress bar in Settings, About section, read only by screen readers.',
  },
  couldNotRefreshSyntheticSessionInfo: {
    id: 'interviewer.settingsDialog.couldNotRefreshSyntheticSessionInfo',
    defaultMessage: 'Could not refresh synthetic session info',
    description:
      'Title of an error toast shown when Settings cannot reload the protocol list and synthetic session count from device storage.',
  },
  theProtocolListAndSessionCountAbove: {
    id: 'interviewer.settingsDialog.theProtocolListAndSessionCountAbove',
    defaultMessage:
      'The protocol list and session count above may not match what is actually stored on this device. Reopen Settings to refresh them.',
    description:
      'Body of the error toast whose title says synthetic session info could not be refreshed; warns that the protocol list and session count in the Synthetic data section may be out of date.',
  },
  generationFailed: {
    id: 'interviewer.settingsDialog.generationFailed',
    defaultMessage: 'Generation failed',
    description:
      'Title of an error toast shown when generating synthetic interview sessions fails.',
  },
  thisCannotBeUndone: {
    id: 'interviewer.settingsDialog.thisCannotBeUndone',
    defaultMessage: 'This cannot be undone.',
    description:
      'Warning line in the confirmation dialog for deleting all synthetic sessions; says the deletion is permanent.',
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
    description:
      'Title of the Settings dialog, opened from the gear button in the top bar of the home screen.',
  },
  settingsSections: {
    id: 'interviewer.settingsDialog.settingsSections',
    defaultMessage: 'Settings sections',
    description:
      'Accessible name of the tab list that switches between Settings sections (About, Language, Interview and so on), read only by screen readers.',
  },
  appVersion: {
    id: 'interviewer.settingsDialog.appVersion',
    defaultMessage: 'App version',
    description:
      'Row title in Settings, About section, above the installed Interviewer version number.',
  },
  networkCanvasInterviewer: {
    id: 'interviewer.settingsDialog.networkCanvasInterviewer',
    defaultMessage: 'Network Canvas Interviewer',
    description:
      'Row description under the App version title in Settings, About section; the name of this app.',
  },
  storage: {
    id: 'interviewer.settingsDialog.storage',
    defaultMessage: 'Storage',
    description:
      'Row title in Settings, About section, for how much of the device storage quota the app uses.',
  },
  offlineStorage: {
    id: 'interviewer.settingsDialog.offlineStorage',
    defaultMessage: 'Offline storage',
    description:
      "Row title in Settings, About section, for whether the browser protects the app's stored data from being cleared automatically.",
  },
  installationID: {
    id: 'interviewer.settingsDialog.installationID',
    defaultMessage: 'Installation ID',
    description:
      'Row title in Settings, About section, above the identifier of this installation of the app on this device.',
  },
  uniquePerDeviceIdentifier: {
    id: 'interviewer.settingsDialog.uniquePerDeviceIdentifier',
    defaultMessage: 'Unique per-device identifier',
    description:
      'Row description under the Installation ID title; says the identifier is different on each device.',
  },
  showSampleProtocolOnHomeScreen: {
    id: 'interviewer.settingsDialog.showSampleProtocolOnHomeScreen',
    defaultMessage: 'Show sample protocol on home screen',
    description:
      'Toggle label in Settings, About section; controls whether the sample protocol card appears on the home screen.',
  },
  reShowsTheOneClickSampleProtocol: {
    id: 'interviewer.settingsDialog.reShowsTheOneClickSampleProtocol',
    defaultMessage:
      'Re-shows the one-click sample protocol card next to the Import card.',
    description:
      'Hint under the sample protocol toggle; turning it on brings back the sample protocol card next to the Import card on the home screen.',
  },
  allowStageNavigation: {
    id: 'interviewer.settingsDialog.allowStageNavigation',
    defaultMessage: 'Allow stage navigation',
    description:
      'Toggle label in Settings, Interview section; controls whether participants can jump between interview stages from the progress bar.',
  },
  letParticipantsMoveBetweenStagesByTapping: {
    id: 'interviewer.settingsDialog.letParticipantsMoveBetweenStagesByTapping',
    defaultMessage:
      'Let participants move between stages by tapping the progress bar during an interview, which opens a stages menu.',
    description:
      'Hint under the Allow stage navigation toggle; explains that tapping the progress bar during an interview opens a menu of stages.',
  },
  whenOffParticipantsCanOnlyMoveForwards: {
    id: 'interviewer.settingsDialog.whenOffParticipantsCanOnlyMoveForwards',
    defaultMessage:
      'When off, participants can only move forwards and backwards one stage at a time. Turning this on lets them jump directly to any stage, which is useful for piloting a protocol but is usually left off for real interviews.',
    description:
      'Explanatory paragraph in Settings, Interview section, about the Allow stage navigation toggle: what happens when it is off and why a researcher might turn it on.',
  },
  exportGraphML: {
    id: 'interviewer.settingsDialog.exportGraphML',
    defaultMessage: 'Export GraphML',
    description:
      'Toggle label in Settings, Data export section; GraphML is a network file format. Controls whether exports include GraphML files.',
  },
  includeGraphMLFilesInInterviewExports: {
    id: 'interviewer.settingsDialog.includeGraphMLFilesInInterviewExports',
    defaultMessage: 'Include GraphML files in interview exports.',
    description:
      'Hint under the Export GraphML toggle; says exported interview archives will contain GraphML (network file format) files.',
  },
  exportCSV: {
    id: 'interviewer.settingsDialog.exportCSV',
    defaultMessage: 'Export CSV',
    description:
      'Toggle label in Settings, Data export section; CSV is a spreadsheet file format. Controls whether exports include CSV files.',
  },
  includeCSVFilesAttributesEdgesEgoIn: {
    id: 'interviewer.settingsDialog.includeCSVFilesAttributesEdgesEgoIn',
    defaultMessage:
      'Include CSV files (attributes, edges, ego) in interview exports.',
    description:
      'Hint under the Export CSV toggle; says exported interview archives will contain CSV (spreadsheet) files for node attributes, edges and ego data.',
  },
  exportNodePositionsAsScreenCoordinatePixels: {
    id: 'interviewer.settingsDialog.exportNodePositionsAsScreenCoordinatePixels',
    defaultMessage: 'Export node positions as screen-coordinate pixels',
    description:
      'Toggle label in Settings, Data export section; controls whether sociogram node positions are exported as pixel coordinates instead of normalised values.',
  },
  sociogramNodePositionsAreExportedInPixel: {
    id: 'interviewer.settingsDialog.sociogramNodePositionsAreExportedInPixel',
    defaultMessage:
      'Sociogram node positions are exported in pixel coordinates relative to the layout below.',
    description:
      'Hint under the screen-coordinate toggle; says positions of nodes in sociogram stages are exported in pixels relative to the screen layout size set in the two fields below.',
  },
  screenLayoutWidth: {
    id: 'interviewer.settingsDialog.screenLayoutWidth',
    defaultMessage: 'Screen layout width',
    description:
      'Field label for a number input in Settings, Data export section: the screen layout width, in pixels, used to scale exported sociogram positions.',
  },
  pixels: {
    id: 'interviewer.settingsDialog.pixels',
    defaultMessage: 'Pixels',
    description:
      'Hint under the screen layout width and height number inputs; names the unit (screen pixels).',
  },
  screenLayoutHeight: {
    id: 'interviewer.settingsDialog.screenLayoutHeight',
    defaultMessage: 'Screen layout height',
    description:
      'Field label for a number input in Settings, Data export section: the screen layout height, in pixels, used to scale exported sociogram positions.',
  },
  enableAnalytics: {
    id: 'interviewer.settingsDialog.enableAnalytics',
    defaultMessage: 'Enable analytics',
    description:
      'Toggle label in Settings, Privacy section; controls whether anonymous usage and error data is sent.',
  },
  sendAnonymousUsageAndErrorDataTo: {
    id: 'interviewer.settingsDialog.sendAnonymousUsageAndErrorDataTo',
    defaultMessage:
      'Send anonymous usage and error data to help the Network Canvas team improve the app.',
    description:
      'Hint under the Enable analytics toggle; says anonymous usage and error data is sent to help the Network Canvas team improve the app.',
  },
  whenAnalyticsAreEnabledTheAppSends: {
    id: 'interviewer.settingsDialog.whenAnalyticsAreEnabledTheAppSends',
    defaultMessage:
      'When analytics are enabled, the app sends a small amount of anonymous information about how it is used — for example which interview stages and features are exercised, when protocols are imported, when data is exported, and details of any errors or crashes. This helps us find bugs and decide what to improve.',
    description:
      'Paragraph in Settings, Privacy section explaining what anonymous information is sent when analytics are on and why.',
  },
  noParticipantDataIsEverCollected: {
    id: 'interviewer.settingsDialog.noParticipantDataIsEverCollected',
    defaultMessage: 'No participant data is ever collected.',
    description:
      'Title of an information alert in Settings, Privacy section; a reassurance that analytics never include participant data.',
  },
  networkDataResponsesCaseIDsProtocolContents: {
    id: 'interviewer.settingsDialog.networkDataResponsesCaseIDsProtocolContents',
    defaultMessage:
      'Network data, responses, case IDs, protocol contents, and asset files never leave this device. Analytics also contain no user-identifiable information.',
    description:
      'Body of the information alert in Settings, Privacy section; lists the data (network data, responses, case IDs, protocol contents, assets) that never leaves the device.',
  },
  enableAppSecurity: {
    id: 'interviewer.settingsDialog.enableAppSecurity',
    defaultMessage: 'Enable app security',
    description:
      'Row title in Settings, Security section, shown only when no device lock is set up; offers to set up a PIN, passphrase or biometric lock.',
  },
  runTheGetStartedWizardToConfigure: {
    id: 'interviewer.settingsDialog.runTheGetStartedWizardToConfigure',
    defaultMessage:
      'Run the Get started wizard to configure a device lock and choose your security preferences.',
    description:
      'Row description under Enable app security; tells the researcher the Get started button runs a setup wizard for the device lock and security preferences.',
  },
  getStarted: {
    id: 'interviewer.settingsDialog.getStarted',
    defaultMessage: 'Get started',
    description:
      'Action that opens security setup for a device currently used without a lock.',
  },
  lockButtonHint: {
    id: 'interviewer.settingsDialog.useTheLockButtonInTheTop',
    defaultMessage: 'Use the lock button in the top bar to lock immediately.',
    description:
      'Information alert in Settings, Security section, shown when a device lock is set; points to the lock button in the top bar for locking immediately.',
  },
  generateSyntheticInterviewSessionsToValidateThe: {
    id: 'interviewer.settingsDialog.generateSyntheticInterviewSessionsToValidateThe',
    defaultMessage:
      'Generate synthetic interview sessions to validate the export pipeline. Synthetic sessions appear in the regular Sessions list and export identically to real sessions.',
    description:
      'Introductory paragraph of Settings, Synthetic data section; explains that generated fake interview sessions are for testing the export process and mix in with real sessions.',
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
    description:
      'Hint under the disabled protocol selector in Settings, Synthetic data section, shown when no protocol has been imported yet.',
  },
  theProtocolUsedToShapeGeneratedSessions: {
    id: 'interviewer.settingsDialog.theProtocolUsedToShapeGeneratedSessions',
    defaultMessage: 'The protocol used to shape generated sessions.',
    description:
      'Hint under the protocol selector in Settings, Synthetic data section; says the chosen protocol determines the structure of the generated sessions.',
  },
  numberOfSessions: {
    id: 'interviewer.settingsDialog.numberOfSessions',
    defaultMessage: 'Number of sessions',
    description:
      'Field label for a number input in Settings, Synthetic data section: how many synthetic interview sessions to generate.',
  },
  simulateParticipantDropOut: {
    id: 'interviewer.settingsDialog.simulateParticipantDropOut',
    defaultMessage: 'Simulate participant drop-out',
    description:
      'Toggle label in Settings, Synthetic data section; controls whether some generated sessions are left unfinished, as if participants stopped early.',
  },
  someSessionsWillBeLeftIncompleteTo: {
    id: 'interviewer.settingsDialog.someSessionsWillBeLeftIncompleteTo',
    defaultMessage:
      'Some sessions will be left incomplete to mirror real-world data.',
    description:
      'Hint under the Simulate participant drop-out toggle; says some generated sessions will be incomplete.',
  },
  respectSkipLogicAndFiltering: {
    id: 'interviewer.settingsDialog.respectSkipLogicAndFiltering',
    defaultMessage: 'Respect skip logic and filtering',
    description:
      "Toggle label in Settings, Synthetic data section; controls whether generated sessions follow the protocol's skip logic and stage filters.",
  },
  applyProtocolSkipLogicAndStageFilters: {
    id: 'interviewer.settingsDialog.applyProtocolSkipLogicAndStageFilters',
    defaultMessage:
      'Apply protocol skip logic and stage filters during generation.',
    description:
      "Hint under the skip logic toggle; says the protocol's skip logic and stage filters are applied while generating.",
  },
  generating: {
    id: 'interviewer.settingsDialog.generating',
    defaultMessage: 'Generating…',
    description:
      'Label of the Generate button in Settings, Synthetic data section while generation is running; an in-progress state, not a command.',
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
    description:
      'Accessible name of the progress bar shown while synthetic sessions are being generated, read only by screen readers.',
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
    description:
      'Row title in Settings, Synthetic data section, for the control that deletes all generated sessions.',
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
    description:
      'Settings navigation tab for the About section: app version, storage and installation details.',
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
    description:
      'Settings navigation tab for the section with options for what exported interview data contains.',
  },
  privacy: {
    id: 'interviewer.settingsDialog.privacy',
    defaultMessage: 'Privacy',
    description:
      'Settings navigation tab for the section about analytics and what data is sent.',
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
    description:
      'Settings navigation tab for the section that generates and deletes fake interview sessions for testing.',
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
    description:
      'Success toast after synthetic sessions are deleted; count is the number deleted.',
  },
  syntheticCount: {
    id: 'interviewer.settingsDialog.syntheticCount',
    defaultMessage:
      '{count, plural, one {There is currently # synthetic session on this device.} other {There are currently # synthetic sessions on this device.}}',
    description:
      'Row description in Settings, Synthetic data section; count is how many synthetic sessions are currently stored on this device.',
  },
  storageUsed: {
    id: 'interviewer.settingsDialog.storageUsed',
    defaultMessage:
      '{hasPercent, select, true {{used} of {total} ({percent})} other {{used} of {total}}}',
    description:
      'Row description under Storage in Settings, About section. used is the amount stored, total is the storage quota, percent is the share used; hasPercent is true or other, and selects whether the percentage is shown.',
  },
  storageProtected: {
    id: 'interviewer.settingsDialog.storageProtected',
    defaultMessage:
      '{hasUsage, select, true {Offline storage: protected from eviction · {used} used} other {Offline storage: protected from eviction}}',
    description:
      'Row description under Offline storage in Settings, About section, when the browser protects stored data from automatic removal. used is the amount stored; hasUsage selects whether it is shown.',
  },
  storageBestEffort: {
    id: 'interviewer.settingsDialog.storageBestEffort',
    defaultMessage:
      'Offline storage: best-effort — it may be cleared under storage pressure',
    description:
      'Row description under Offline storage in Settings, About section, when the browser may clear stored data if the device runs low on space.',
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
    description:
      'Body of the error toast shown when generating synthetic sessions fails for an unexpected reason; asks the researcher to try again.',
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

// Localised nodes for the synthetic-data delete confirmation, built at module
// scope so the confirm callbacks that hand them over stay plain callbacks
// rather than element factories re-created on every render.
const describeDeleteSyntheticFailure = () => (
  <AppMessage message={messages.deleteFailedHelp} />
);

const deletedSyntheticToastTitle = (count: number) =>
  createElement(AppMessage, { message: messages.deleted, values: { count } });

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
  const offline = useAppOffline();
  const download = useOfflineDownload();
  const downloadingOffline = offline === 'not-ready' && download.downloading;
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
    // Synthetic interviews are generated for schema 9 protocols only.
    const current = ps.filter(isCurrentProtocol);
    setProtocols(current);
    setSyntheticCount(n);
    // Default to the first protocol when none is selected yet.
    setSelectedProtocolHash((selected) => {
      if (selected && current.some((p) => p.hash === selected)) return selected;
      return current[0]?.hash ?? '';
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

  // Opening the dialog is what triggers a read of IndexedDB and the browser's
  // storage estimate. Nothing here is derivable during render: the values live
  // outside React and only arrive asynchronously, so the effect is the right
  // tool and the state it writes is the response landing.
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const [s, e, persisted] = await Promise.all([
        getSettings(),
        estimateStorage(),
        isStoragePersisted(),
      ]);
      setSettings(s);
      setStorage(e);
      setStoragePersisted(persisted);
      setInstallationId(getInstallationId());
    };
    void load();
    void reloadSyntheticWithFeedback();
  }, [open, reloadSyntheticWithFeedback]);

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
      // Dynamically imported so the generator (and the faker data it
      // bundles) stays out of the initial load; the chunk is precached.
      const { generateSyntheticSessions } =
        await import('~/lib/synthetic/generate');
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
        analytics.captureException(error, { feature: 'synthetic-data' });
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
    // oxlint-disable-next-line react/memo-dependencies -- every listed value is read; the rule cannot follow a try/finally and reports each dependency of one as unused
    reloadSyntheticWithFeedback,
    onDataChange,
    analytics,
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
      describeError: describeDeleteSyntheticFailure,
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
            title: deletedSyntheticToastTitle(deleted),
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
    // oxlint-disable-next-line react/memo-dependencies -- every listed value is read; the rule cannot follow a try/finally and reports each dependency of one as unused
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
          viewportClassName="@container pe-4"
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
                {downloadingOffline ? (
                  <SettingsRow
                    title={intl.formatMessage(offlineMessages.settingTitle)}
                    desc={intl.formatMessage(offlineMessages.downloadingHelp)}
                    control={
                      <span
                        data-testid="offline-setting"
                        className="text-info inline-flex items-center gap-1.5 text-xs"
                      >
                        <CloudDownload className="size-3.5" aria-hidden />
                        {intl.formatMessage(offlineMessages.downloading, {
                          hasProgress: String(download.progress !== null),
                          percent: intl.formatNumber(download.progress ?? 0, {
                            style: 'percent',
                          }),
                        })}
                      </span>
                    }
                  />
                ) : offline === 'ready' || offline === 'not-ready' ? (
                  <SettingsRow
                    title={intl.formatMessage(offlineMessages.settingTitle)}
                    desc={intl.formatMessage(
                      offline === 'ready'
                        ? offlineMessages.readyHelp
                        : offlineMessages.notReadyHelp,
                    )}
                    control={
                      <span
                        data-testid="offline-setting"
                        className={`inline-flex items-center gap-1.5 text-xs ${
                          offline === 'ready' ? 'text-text/60' : 'text-warning'
                        }`}
                      >
                        {offline === 'ready' ? (
                          <CloudCheck className="size-3.5" aria-hidden />
                        ) : (
                          <CloudOff className="size-3.5" aria-hidden />
                        )}
                        {intl.formatMessage(
                          offline === 'ready'
                            ? offlineMessages.ready
                            : offlineMessages.notReady,
                        )}
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
                      {intl.formatMessage(messages.lockButtonHint)}
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
