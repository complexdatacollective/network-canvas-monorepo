import {
  CircleArrowUp,
  Download,
  Ellipsis,
  ExternalLink as ExternalLinkIcon,
  FolderOpen,
  Info,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { DateTime } from 'luxon';
import {
  createElement,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import {
  type IntlShape,
  type MessageDescriptor,
  createMessageError,
  defineMessages,
} from '@codaco/app-i18n/messages';
import {
  AppErrorMessage,
  AppMessage,
  useAppIntl,
} from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { Button, IconButton } from '@codaco/fresco-ui/Button';
import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { ListLayout } from '@codaco/fresco-ui/collection/layout/ListLayout';
import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import { Tabs, TabsPanel } from '@codaco/fresco-ui/Tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import Table from '~/components/Assets/Table';
import {
  DownloadRefusalMessage,
  DownloadRefusalTitle,
} from '~/components/DefaultLanguageTextAlert';
import ExternalLink from '~/components/ExternalLink';
import { APP_SCHEMA_VERSION } from '~/config';
import { useAppDispatch } from '~/ducks/hooks';
import { deleteLibraryProtocol } from '~/ducks/modules/userActions/userActions';
import { useProtocolLibrary } from '~/hooks/useProtocolLibrary';
import fileIcon from '~/images/file-icon.svg';
import type { BundledTemplate } from '~/templates';
import { sampleProtocol } from '~/templates/sample-protocol';
import { clearAllStorage, type StoredProtocolRow } from '~/utils/assetDB';
import { getProtocolAssetCount } from '~/utils/assetUtils';
import {
  downloadLegacyProtocolAsNetcanvas,
  downloadProtocolAsNetcanvas,
  DownloadRefusedError,
  UnresolvedAssetsError,
} from '~/utils/bundleProtocol';
import { beginExport } from '~/utils/criticalOperation';
import { documentationLinks } from '~/utils/documentationLinks';
import {
  getBundledLegacyArchitect,
  LEGACY_ARCHITECT_MAJOR,
} from '~/utils/legacyArchitect';
import {
  countLegacyAssets,
  type LegacyStoredProtocolRow,
} from '~/utils/legacyProtocolLibrary';
import { reportError } from '~/utils/reportError';

import { legacyProtocolMessages } from '../legacyProtocolMessages';

// Rich-text tag renderers live at module scope so they keep one identity across
// renders (an inline arrow returning JSX is a component defined during render).
const renderCode = (chunks: ReactNode[]) => <code>{chunks}</code>;

const renderProtocolGallerySiteLink = (chunks: ReactNode[]) => (
  <ExternalLink href="https://protocolgallery.networkcanvas.com/">
    {chunks}
  </ExternalLink>
);

const renderSavingAndBackingUpLink = (chunks: ReactNode[]) => (
  <ExternalLink href={documentationLinks.savingAndBackingUp}>
    {chunks}
  </ExternalLink>
);

const renderProtocolGalleryLink = (chunks: ReactNode[]) => (
  <ExternalLink href={documentationLinks.protocolGallery}>
    {chunks}
  </ExternalLink>
);

const chromeMessages = defineMessages({
  templateCount: {
    id: 'architect.home.libraryPanel.templateCount',
    defaultMessage: '{count, plural, one {# template} other {# templates}}',
    description: 'Number of available protocol templates on the home page.',
  },
  anExampleIntroducingTheKeyFeatures: {
    id: 'architect.chrome.home.libraryPanel.anExampleIntroducingTheKeyFeatures',
    defaultMessage:
      'An example introducing the key features and techniques available in Network Canvas.',
    description:
      'Description of the Sample Protocol in the Templates tab of the start screen; used only if the sample protocol has no description of its own.',
  },
  yourProtocolsAreSavedOnlyOn: {
    id: 'architect.chrome.home.libraryPanel.yourProtocolsAreSavedOnlyOn',
    defaultMessage:
      '{protocolCount, plural, one {Your protocol is saved only on this device. It is never uploaded to a server.} other {Your # protocols are saved only on this device. They are never uploaded to a server.}}',
    description:
      'Tooltip on the info button above the Recent list of the start screen, reassuring the researcher that protocols stay on this device. protocolCount is the number of saved protocols.',
  },
  thisProtocolHasNoDescription: {
    id: 'architect.chrome.home.libraryPanel.thisProtocolHasNoDescription',
    defaultMessage: 'This protocol has no description.',
    description:
      'Shown in the protocol info dialog in place of the description when the protocol has none.',
  },
});
const additionalMessages = defineMessages({
  moreExamplesOfNetworkCanvasProtocols: {
    id: 'architect.additional.home.libraryPanel.moreExamplesOfNetworkCanvasProtocols',
    defaultMessage:
      'More examples of Network Canvas protocols can be found on our <ExternalLink>Protocol Gallery</ExternalLink>.',
    description:
      'Text of the Looking for more card on the start screen. ExternalLink wraps the words Protocol Gallery, which link to the online gallery of example protocols.',
  },
  becauseYourWorkIsStoredLocally: {
    id: 'architect.additional.home.libraryPanel.becauseYourWorkIsStoredLocally',
    defaultMessage:
      'Because your work is stored locally, clearing Architect\'s app data, or using "Clear all protocols", will permanently remove it. Download the protocol as a <code>.netcanvas</code> file to save a copy or move it to another device. See our guide to <ExternalLink>saving and backing up your work</ExternalLink> for more.',
    description:
      'Paragraph in the Protocol Storage dialog warning that protocols saved in the browser are lost if app data is cleared or Clear all protocols is used. code wraps the file extension .netcanvas; ExternalLink wraps the link to the saving and backing up guide.',
  },
  lookingForInspirationBrowseExampleResearch: {
    id: 'architect.additional.home.libraryPanel.lookingForInspirationBrowseExampleResearch',
    defaultMessage:
      'Looking for inspiration? Browse example research protocols in the <ExternalLink>Protocol Gallery</ExternalLink>.',
    description:
      'Paragraph in the Protocol Storage dialog suggesting example protocols. ExternalLink wraps the words Protocol Gallery, which link to the online gallery.',
  },
});
const messages = defineMessages({
  property: {
    id: 'architect.home.libraryPanel.property',
    defaultMessage: 'Property',
    description: 'Column heading for protocol metadata property names.',
  },
  value: {
    id: 'architect.home.libraryPanel.value',
    defaultMessage: 'Value',
    description: 'Column heading for protocol metadata values.',
  },
  protocolCount: {
    id: 'architect.presentation.protocolCount',
    defaultMessage: '{count, plural, one {# protocol} other {# protocols}}',
    description:
      'Complete presentation message. Preserve authored values; the translator controls spacing and punctuation.',
  },
  actionsFor: {
    id: 'architect.home.libraryPanel.actionsFor',
    defaultMessage: 'Actions for {name}',
    description:
      "Accessible name of the three-dot menu button on a row of the protocol list on the start screen; read only by screen readers. name is the protocol's name.",
  },
  open: {
    id: 'architect.home.libraryPanel.open',
    defaultMessage: 'Open',
    description:
      'Menu item on a protocol row of the start screen that opens that protocol for editing.',
  },
  seeMoreInfo: {
    id: 'architect.home.libraryPanel.seeMoreInfo',
    defaultMessage: 'See more info',
    description:
      'Menu item on a protocol row of the start screen that opens a dialog with details of the protocol, such as number of stages, types and dates.',
  },
  download: {
    id: 'architect.home.libraryPanel.download',
    defaultMessage: 'Download',
    description:
      "Menu item on a protocol row of the start screen that saves the protocol to the researcher's computer as a .netcanvas file. Download is the action, not a noun.",
  },
  protocolGallery: {
    id: 'architect.home.libraryPanel.protocolGallery',
    defaultMessage: 'Protocol gallery',
    description:
      'Accessible name of the card on the start screen that links to the online Protocol Gallery of example protocols; read only by screen readers.',
  },
  lookingForMore: {
    id: 'architect.home.libraryPanel.lookingForMore',
    defaultMessage: 'Looking for more?',
    description:
      'Heading of the card on the start screen that points to the online Protocol Gallery of example protocols.',
  },
  dismiss: {
    id: 'architect.home.libraryPanel.dismiss',
    defaultMessage: 'Dismiss',
    description:
      'Accessible name of the close button on the Protocol Gallery card of the start screen; it hides the card. Read only by screen readers.',
  },
  someAssetsCouldNotBeIncluded: {
    id: 'architect.home.libraryPanel.someAssetsCouldNotBeIncluded',
    defaultMessage: 'Some resources could not be read',
    description:
      'Title of the dialog shown when downloading a protocol is stopped because some of its uploaded resource files could not be read.',
  },
  wasDownloadedButThese: {
    id: 'architect.home.libraryPanel.wasDownloadedButThese',
    defaultMessage:
      'These resources could not be read, so "{value1}" was not downloaded: {assetList}. Open the protocol and add the files again in Resources, then download it.',
    description:
      'Body of the dialog shown when downloading a protocol is stopped because some resource files could not be read. value1 is the protocol name; assetList is the list of unreadable resource files.',
  },
  oK: {
    id: 'architect.home.libraryPanel.oK',
    defaultMessage: 'OK',
    description:
      'Button that dismisses an information or error dialog on the start screen.',
  },
  downloadFailed: {
    id: 'architect.home.libraryPanel.downloadFailed',
    defaultMessage: 'Download failed',
    description:
      'Title of the error dialog shown when downloading a protocol as a file fails.',
  },
  couldNotBeDownloaded: {
    id: 'architect.home.libraryPanel.couldNotBeDownloaded',
    defaultMessage: '"{value1}" could not be downloaded.',
    description:
      'Body of the error dialog shown when downloading a protocol fails. value1 is the protocol name.',
  },
  deleteProtocol: {
    id: 'architect.home.libraryPanel.deleteProtocol',
    defaultMessage: 'Delete protocol?',
    description:
      'Title of the dialog that asks the researcher to confirm deleting a protocol from the start screen list.',
  },
  andItsAssetsWill: {
    id: 'architect.home.libraryPanel.andItsAssetsWill',
    defaultMessage:
      '"{value1}" and its assets will be permanently removed from this device. This cannot be undone.',
    description:
      'Body of the confirmation dialog for deleting a protocol from the start screen list. value1 is the protocol name; assets are its uploaded resource files.',
  },
  deleteFailed: {
    id: 'architect.home.libraryPanel.deleteFailed',
    defaultMessage: 'Delete failed',
    description:
      'Title of the error dialog shown when deleting a protocol from the start screen list fails.',
  },
  couldNotBeDeleted: {
    id: 'architect.home.libraryPanel.couldNotBeDeleted',
    defaultMessage: '"{value1}" could not be deleted.',
    description:
      'Body of the error dialog shown when deleting a protocol fails. value1 is the protocol name.',
  },
  stages: {
    id: 'architect.home.libraryPanel.stages',
    defaultMessage: 'Stages',
    description:
      'Row label in the protocol info dialog, followed by the number of stages (interview screens) in the protocol.',
  },
  nodeTypes: {
    id: 'architect.home.libraryPanel.nodeTypes',
    defaultMessage: 'Node types',
    description:
      "Row label in the protocol info dialog, followed by the number of node types in the protocol's codebook.",
  },
  edgeTypes: {
    id: 'architect.home.libraryPanel.edgeTypes',
    defaultMessage: 'Edge types',
    description:
      "Row label in the protocol info dialog, followed by the number of edge types in the protocol's codebook.",
  },
  assets: {
    id: 'architect.home.libraryPanel.assets',
    defaultMessage: 'Assets',
    description:
      'Row label in the protocol info dialog, followed by the number of uploaded resource files (images, video, audio, data files) in the protocol.',
  },
  added: {
    id: 'architect.home.libraryPanel.added',
    defaultMessage: 'Added',
    description:
      'Row label in the protocol info dialog, followed by the date the protocol was created.',
  },
  edited: {
    id: 'architect.home.libraryPanel.edited',
    defaultMessage: 'Edited',
    description:
      'Row label in the protocol info dialog, followed by the date the protocol was last changed.',
  },
  protocolStorage: {
    id: 'architect.home.libraryPanel.protocolStorage',
    defaultMessage: 'Protocol Storage',
    description:
      'Title of the dialog, opened from the info button above the Recent list, that explains where protocols are stored.',
  },
  yourProtocolsAreSavedOnlyOn: {
    id: 'architect.home.libraryPanel.yourProtocolsAreSavedOnlyOn',
    defaultMessage:
      'Your protocols are saved only on this device. They are never uploaded to a server.',
    description:
      'First paragraph of the Protocol Storage dialog: protocols are kept only on this device and never uploaded.',
  },
  removeAllData: {
    id: 'architect.home.libraryPanel.removeAllData',
    defaultMessage: 'Remove all data?',
    description:
      'Title of the dialog that asks the researcher to confirm deleting every saved protocol from this device.',
  },
  clearAllKeepsSchema8Protocols: {
    id: 'architect.home.libraryPanel.clearAllKeepsSchema8Protocols',
    defaultMessage:
      'Every protocol and resource saved in this version of Architect will be permanently removed. This cannot be undone. Schema 8 protocols stay in Architect 8 and are not removed.',
    description:
      'Description in the dialog confirming "Clear all protocols" on the home screen. Only this version of Architect\'s own library is removed; protocols that belong to Architect 8 (schema 8) are kept, because they live in Architect 8\'s separate library on the same device.',
  },
  removeAll: {
    id: 'architect.home.libraryPanel.removeAll',
    defaultMessage: 'Remove all',
    description:
      'Confirm button of the dialog that deletes every saved protocol from this device.',
  },
  couldNotRemoveData: {
    id: 'architect.home.libraryPanel.couldNotRemoveData',
    defaultMessage: 'Could not remove data',
    description:
      'Title of the error dialog shown when deleting all saved protocols fails.',
  },
  architectSStoredDataCouldNotBe: {
    id: 'architect.home.libraryPanel.architectSStoredDataCouldNotBe',
    defaultMessage: "Architect's stored data could not be removed.",
    description:
      'Body of the error dialog shown when deleting all saved protocols fails.',
  },
  includesExamplesOfEveryStageType: {
    id: 'architect.home.libraryPanel.includesExamplesOfEveryStageType',
    defaultMessage: 'Includes examples of every stage type',
    description:
      'Description of the Development Protocol in the Templates tab; shown only in development builds of the app.',
  },
  whereYourProtocolsAreStored: {
    id: 'architect.home.libraryPanel.whereYourProtocolsAreStored',
    defaultMessage: 'Where your protocols are stored',
    description:
      'Accessible name of the info button above the Recent list that opens the Protocol Storage dialog; read only by screen readers.',
  },
  clearAllLocallySavedProtocols: {
    id: 'architect.home.libraryPanel.clearAllLocallySavedProtocols',
    defaultMessage: 'Clear all locally saved protocols',
    description:
      'Accessible name and tooltip of the trash button above the Recent list that starts deleting every saved protocol on this device.',
  },
  protocolLibrary: {
    id: 'architect.home.libraryPanel.protocolLibrary',
    defaultMessage: 'Protocol library',
    description:
      'Accessible name of the tab group on the start screen that switches between Recent protocols and Templates; read only by screen readers.',
  },
  recent: {
    id: 'architect.home.libraryPanel.recent',
    defaultMessage: 'Recent',
    description:
      'Tab label on the start screen for the list of protocols the researcher has recently opened or created.',
  },
  templates: {
    id: 'architect.home.libraryPanel.templates',
    defaultMessage: 'Templates',
    description:
      'Tab label on the start screen for the list of template and sample protocols to start from.',
  },
  recentProtocols: {
    id: 'architect.home.libraryPanel.recentProtocols',
    defaultMessage: 'Recent protocols',
    description:
      'Accessible name of the list of recent protocols on the start screen; read only by screen readers.',
  },
  noRecentProtocolsYet: {
    id: 'architect.home.libraryPanel.noRecentProtocolsYet',
    defaultMessage: 'No recent protocols yet.',
    description:
      'Empty-state message in the Recent tab of the start screen when the researcher has no saved protocols.',
  },
  protocolTemplates: {
    id: 'architect.home.libraryPanel.protocolTemplates',
    defaultMessage: 'Protocol templates',
    description:
      'Accessible name of the list of template protocols on the start screen; read only by screen readers.',
  },
});
const extraMessages = defineMessages({
  justNow: {
    id: 'architect.library.metadata.justNow',
    defaultMessage: '< 1 min ago',
    description:
      'Time shown on a protocol row of the start screen for a change made less than a minute ago. The less-than sign is part of the text.',
  },
  protocolMeta: {
    id: 'architect.library.metadata.protocolMeta',
    defaultMessage:
      '{count, plural, one {# stage} other {# stages}} \u00b7 Added {created} \u00b7 Edited {updated}',
    description:
      'Summary line on a protocol row of the start screen. count is the number of stages; created is the date added; updated is the date last edited.',
  },
  templateMeta: {
    id: 'architect.library.metadata.templateMeta',
    defaultMessage:
      '{stages, plural, one {# stage} other {# stages}} \u00b7 {nodes, plural, one {# node type} other {# node types}} \u00b7 {edges, plural, one {# edge type} other {# edge types}}',
    description:
      'Summary line on a template row of the start screen. stages is the number of stages; nodes is the number of node types; edges is the number of edge types.',
  },
});

type Tab = 'recent' | 'templates';
const RELATIVE_CUTOFF_DAYS = 7;
const formatTimestamp = (millis: number, intl: IntlShape): string => {
  const dt = DateTime.fromMillis(millis).setLocale(intl.locale);
  const secondsAgo = -dt.diffNow('seconds').seconds;
  if (secondsAgo < 60) {
    return intl.formatMessage(extraMessages.justNow);
  }
  const absolute = dt.toLocaleString({
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  if (secondsAgo < RELATIVE_CUTOFF_DAYS * 86400) {
    return dt.toRelative() ?? absolute;
  }
  return absolute;
};
/** What a protocol's info dialog shows, from either library. */
type ProtocolInfoSource = {
  name: string;
  description?: string;
  stageCount: number;
  nodeTypeCount: number;
  edgeTypeCount: number;
  countAssets: () => Promise<number>;
  createdAt: number;
  updatedAt: number;
};
type DownloadRequest = {
  /** The row's key in the list, which marks it as downloading. */
  key: string;
  name: string;
  download: () => Promise<void>;
};
// An Architect 8 document is read without validation, so its codebook is
// whatever that library holds.
const countCodebookTypes = (
  codebook: Record<string, unknown>,
  entity: 'node' | 'edge',
): number => {
  const types = codebook[entity];
  return typeof types === 'object' && types !== null
    ? Object.keys(types).length
    : 0;
};
type MetaStat = {
  label: MessageDescriptor;
  value: number;
  kind?: 'date';
};
const formatProtocolMeta = (
  protocol: StoredProtocolRow | LegacyStoredProtocolRow,
  intl: IntlShape,
): string =>
  intl.formatMessage(extraMessages.protocolMeta, {
    count: protocol.protocol.stages.length,
    created: formatTimestamp(protocol.createdAt, intl),
    updated: formatTimestamp(protocol.updatedAt, intl),
  });
const formatTemplateMeta = (
  protocol: CurrentProtocol,
  intl: IntlShape,
): string =>
  intl.formatMessage(extraMessages.templateMeta, {
    stages: protocol.stages.length,
    nodes: Object.keys(protocol.codebook.node ?? {}).length,
    edges: Object.keys(protocol.codebook.edge ?? {}).length,
  });
/**
 * Where focus belongs once a row action's dialog closes.
 *
 * Resolved lazily, at focus-return, rather than captured as a single element:
 * which control still exists depends on what the action did. Cancelling a
 * delete, or closing the info dialog, leaves the row's Actions button exactly
 * where it was; confirming the delete removes the row and that button with it.
 * The enclosing listbox is the fallback because it outlives every one of its
 * items and is itself focusable, so the researcher lands back in the list they
 * were working in rather than at the top of the page.
 */
type ResolveMenuFocus = () => HTMLElement | null;
type RowMenuAction = {
  label: string;
  onSelect: (resolveFocus: ResolveMenuFocus) => void;
};
type RowFields = {
  name: string;
  description?: string;
  meta?: string;
  /** Short labels shown beside the name, such as a protocol's schema. */
  badges?: string[];
  downloading?: boolean;
  /** Clicking or pressing Enter on the row. */
  onOpen: (resolveFocus: ResolveMenuFocus) => void;
  /**
   * The menu's first item. Left out, it is "Open", doing what the row does;
   * null leaves the menu without one.
   */
  openItem?: RowMenuAction | null;
  upgradeItem?: RowMenuAction;
  onDownload?: (resolveFocus: ResolveMenuFocus) => void;
  onDelete?: (resolveFocus: ResolveMenuFocus) => void;
  onShowInfo?: (resolveFocus: ResolveMenuFocus) => void;
};
type LibraryRowItem = Record<string, unknown> &
  RowFields & {
    kind: 'row';
    id: string;
    textValue: string;
    /** Sorts the Recent list; templates have none. */
    updatedAt?: number;
  };
type LibraryPanelItem = LibraryRowItem;
type PanelRowProps = RowFields & {
  itemProps: ItemProps;
};
// The row itself, then its list, for a dialog the row opened: by the time it
// closes, the row may have been re-rendered away.
const captureRowFocus = (row: Element): ResolveMenuFocus => {
  const element = row instanceof HTMLElement ? row : null;
  const listbox = row.closest<HTMLElement>('[role="listbox"]');
  return () => {
    if (element?.isConnected) return element;
    if (listbox?.isConnected) return listbox;
    return null;
  };
};
const PanelRow = ({
  itemProps,
  name,
  description,
  meta,
  badges,
  downloading = false,
  onOpen,
  openItem,
  upgradeItem,
  onDownload,
  onDelete,
  onShowInfo,
}: PanelRowProps) => {
  const intl = useAppIntl();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const handleClick = (event: React.MouseEvent) => {
    itemProps.onClick?.(event);
    if (event.defaultPrevented) return;
    // The row's menu renders through a portal, so React delivers its clicks
    // here even though they land outside the row in the DOM. Opening the
    // protocol because a menu item was activated would undo whatever the
    // researcher actually chose. The menu items stop propagation too; this is
    // the guard that does not depend on every future one remembering to.
    const target = event.target;
    if (!(target instanceof Node) || !event.currentTarget.contains(target)) {
      return;
    }
    onOpen(captureRowFocus(event.currentTarget));
  };
  const handleKeyDown = (event: React.KeyboardEvent) => {
    itemProps.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    // Ignore keys on the inner action buttons so they don't also open the row.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(captureRowFocus(event.currentTarget));
    }
  };
  // Read while the row is still mounted — after a confirmed delete neither the
  // trigger nor the row is in the document, and `closest` would have nothing to
  // walk up from.
  const captureMenuFocus = (): ResolveMenuFocus => {
    const trigger = triggerRef.current;
    const listbox = trigger?.closest<HTMLElement>('[role="listbox"]') ?? null;
    return () => {
      if (trigger?.isConnected) return trigger;
      if (listbox?.isConnected) return listbox;
      return null;
    };
  };
  const runMenuAction =
    (action: (resolveFocus: ResolveMenuFocus) => void | Promise<void>) =>
    (event: React.MouseEvent) => {
      event.stopPropagation();
      setMenuOpen(false);
      const resolveFocus = captureMenuFocus();
      void Promise.resolve()
        .then(() => action(resolveFocus))
        .catch((error: unknown) => {
          reportError(error);
        });
    };

  const hasMenu = Boolean(onDownload || onDelete || onShowInfo || upgradeItem);
  const firstItem: RowMenuAction | null =
    openItem === undefined
      ? { label: intl.formatMessage(messages.open), onSelect: onOpen }
      : openItem;

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- itemProps carries Collection's option role and roving tabIndex, which the rule cannot see through the spread.
    <div
      {...itemProps}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="group focusable hover:bg-surface-1 data-focused:bg-surface-1 flex w-full shrink-0 cursor-pointer items-center gap-2.5 rounded px-5 py-2.5 text-start transition-colors"
    >
      <div className="flex shrink-0 items-center justify-center">
        <img
          src={fileIcon}
          alt=""
          aria-hidden
          className="size-10 shrink-0 object-contain"
        />
      </div>
      <div className="w-full min-w-0 flex-1 gap-2">
        {/* Already height-bounded by `line-clamp-2`; `dir="auto"` is the RTL
            half — without it the row's LTR base direction reorders an RTL name
            so the clamp's ellipsis lands on the wrong end. */}
        <Heading
          level="label"
          variant="subtitle"
          title={name}
          dir="auto"
          className="line-clamp-2 wrap-anywhere"
          margin="none"
        >
          {name}
        </Heading>
        {badges && badges.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {badges.map((badge) => (
              <Badge key={badge} size="sm" tone="neutral" appearance="outline">
                {badge}
              </Badge>
            ))}
          </span>
        )}
        {meta && <span className="text-sm text-current/70">{meta}</span>}

        {description && (
          <span className="line-clamp-3 text-sm text-current/70">
            {description}
          </span>
        )}
      </div>
      {hasMenu && (
        <div className="flex shrink-0 items-center">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              render={
                // Stays enabled while a download runs. A disabled control
                // cannot hold focus, so disabling it here would drop focus to
                // `<body>` at exactly the moment the menu hands it back — and
                // it would also lock the researcher out of Delete and See more
                // info for the duration. The spinner carries the busy state,
                // and the Download item alone is disabled.
                <IconButton
                  ref={triggerRef}
                  variant="text"
                  color="dynamic"
                  aria-label={intl.formatMessage(messages.actionsFor, {
                    name: name,
                  })}
                  onClick={(event) => event.stopPropagation()}
                  icon={
                    downloading ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Ellipsis />
                    )
                  }
                />
              }
            />
            <DropdownMenuContent side="bottom" align="end">
              {firstItem && (
                <DropdownMenuItem
                  icon={openItem ? <ExternalLinkIcon /> : <FolderOpen />}
                  onClick={runMenuAction(firstItem.onSelect)}
                >
                  {firstItem.label}
                </DropdownMenuItem>
              )}
              {upgradeItem && (
                <DropdownMenuItem
                  icon={<CircleArrowUp />}
                  onClick={runMenuAction(upgradeItem.onSelect)}
                >
                  {upgradeItem.label}
                </DropdownMenuItem>
              )}
              {onShowInfo && (
                <DropdownMenuItem
                  icon={<Info />}
                  onClick={runMenuAction(onShowInfo)}
                >
                  {intl.formatMessage(messages.seeMoreInfo)}
                </DropdownMenuItem>
              )}
              {onDownload && (
                <DropdownMenuItem
                  icon={<Download />}
                  disabled={downloading}
                  onClick={runMenuAction(onDownload)}
                >
                  {intl.formatMessage(messages.download)}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  icon={<Trash2 />}
                  onClick={runMenuAction(onDelete)}
                >
                  {intl.formatMessage(commonMessages.delete)}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
};

const GalleryCard = () => {
  const intl = useAppIntl();
  // Persist the protocol-gallery card's dismissal so it stays hidden across
  // reloads once the user closes it.
  const GALLERY_CARD_DISMISSED_KEY = 'architect:templates-gallery-dismissed';

  const [galleryDismissed, setGalleryDismissed] = useState(
    () => localStorage.getItem(GALLERY_CARD_DISMISSED_KEY) === 'true',
  );
  const dismissGalleryCard = useCallback(() => {
    setGalleryDismissed(true);
    localStorage.setItem(GALLERY_CARD_DISMISSED_KEY, 'true');
  }, []);

  const cardRef = useRef<HTMLDivElement>(null);
  // Dismissing unmounts the card, taking the Dismiss button — and, with it,
  // keyboard focus — out of the document. Hand focus to the tab that owns this
  // panel first, so the researcher stays where they were instead of being
  // dropped onto `<body>`, from which the next Tab restarts at the page header.
  // Found through the panel's own `aria-labelledby`, which is the tab, rather
  // than by querying for a tab by name.
  const handleDismiss = () => {
    const panel = cardRef.current?.closest<HTMLElement>('[role="tabpanel"]');
    const owningTabId = panel?.getAttribute('aria-labelledby');
    const owningTab = owningTabId
      ? panel?.ownerDocument.getElementById(owningTabId)
      : null;
    owningTab?.focus();
    dismissGalleryCard();
  };

  if (galleryDismissed) {
    return null;
  }

  return (
    <Surface
      ref={cardRef}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a labelled card of a link and a dismiss button: not form controls for a <fieldset>, and not worth a landmark.
      role="group"
      aria-label={intl.formatMessage(messages.protocolGallery)}
      spacing="sm"
      className="mb-4"
    >
      <div>
        <Heading level="h4">
          {intl.formatMessage(messages.lookingForMore)}
        </Heading>
        <Paragraph intent="smallText">
          {intl.formatMessage(
            additionalMessages.moreExamplesOfNetworkCanvasProtocols,
            {
              ExternalLink: renderProtocolGallerySiteLink,
            },
          )}
        </Paragraph>
      </div>
      <IconButton
        variant="text"
        color="dynamic"
        size="sm"
        aria-label={intl.formatMessage(messages.dismiss)}
        className="absolute inset-e-2 top-1"
        onClick={handleDismiss}
        icon={<X />}
      />
    </Surface>
  );
};
const getLibraryItemKey = (item: LibraryPanelItem) => item.id;
const getLibraryItemTextValue = (item: LibraryPanelItem) => item.textValue;

const renderLibraryItem = (item: LibraryPanelItem, itemProps: ItemProps) => {
  return (
    <PanelRow
      itemProps={itemProps}
      name={item.name}
      description={item.description}
      meta={item.meta}
      badges={item.badges}
      downloading={item.downloading}
      onOpen={item.onOpen}
      openItem={item.openItem}
      upgradeItem={item.upgradeItem}
      onDownload={item.onDownload}
      onDelete={item.onDelete}
      onShowInfo={item.onShowInfo}
    />
  );
};
type LibraryPanelProps = {
  // Open a saved protocol from the library.
  onOpenProtocol: (id: string) => void;
  // Open a protocol from Architect 8's library: the choice dialog, unless the
  // researcher already chose to keep it in Architect 8.
  onOpenLegacyProtocol: (id: string, finalFocus?: ResolveMenuFocus) => void;
  // Offer to upgrade a protocol from Architect 8's library.
  onUpgradeLegacyProtocol: (id: string, finalFocus?: ResolveMenuFocus) => void;
  // Open a protocol from Architect 8's library in Architect 8.
  onOpenInLegacyArchitect: (id: string) => void;
  // Open the bundled sample protocol.
  onOpenSample: () => void;
  // Open the development protocol (shown as a template in dev mode only).
  onOpenDevProtocol: () => void;
  // Research-grounded starter templates bundled with the app.
  templates: BundledTemplate[];
  // Open one of the bundled research templates.
  onOpenTemplate: (template: BundledTemplate) => void;
};
// A panel too short for both the list and the gallery card below it has to
// give somewhere. It scrolls: `Surface` is `overflow-clip`, so anything the
// panel cannot hold would otherwise be cut off with no way to reach it — which
// is how the card disappears on a short window.
const PANEL_CLASSES = 'flex min-h-0 flex-col overflow-x-hidden overflow-y-auto';

const LibraryPanel = ({
  onOpenProtocol,
  onOpenLegacyProtocol,
  onUpgradeLegacyProtocol,
  onOpenInLegacyArchitect,
  onOpenSample,
  onOpenDevProtocol,
  templates,
  onOpenTemplate,
}: LibraryPanelProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const { protocols, legacyProtocols, isLoaded } = useProtocolLibrary();
  // Architect 8's protocols are listed with this app's own, so every count and
  // the opening tab include them.
  const protocolCount = protocols.length + legacyProtocols.length;
  // Null until the library has loaded. The opening tab is then chosen once:
  // Templates when there is nothing recent to show, Recent otherwise. Deciding
  // only once means removing the last protocol later does not move the
  // researcher off the tab they are on.
  const [tab, setTab] = useState<Tab | null>(null);
  if (tab === null && isLoaded) {
    setTab(protocolCount === 0 ? 'templates' : 'recent');
  }
  const recentLayout = useMemo(
    () => new ListLayout<LibraryPanelItem>({ gap: 0 }),
    [],
  );
  const templateLayout = useMemo(
    () => new ListLayout<LibraryPanelItem>({ gap: 0 }),
    [],
  );
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState<{
    title: string;
    description?: string;
    stats: MetaStat[];
  } | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  // The info dialog is rendered once for the whole panel, so the row that asked
  // for it has to be remembered separately. A resolver rather than an element:
  // by the time the dialog closes the menu item that opened it is long gone,
  // and the dialog's own opener capture would have nothing usable to return to.
  const infoFocusRef = useRef<ResolveMenuFocus | null>(null);
  const activeTab = tab ?? 'recent';
  const handleDownload = useCallback(
    async (
      { key, name, download }: DownloadRequest,
      resolveFocus: ResolveMenuFocus,
    ) => {
      setDownloadingIds((prev) => new Set(prev).add(key));
      // Marked as an export, like the editor's, so leaving for Architect 8 or
      // a service-worker update reload waits for it rather than ending the
      // page under a zip still being generated. The row menu stays usable
      // while it runs, so "Open in Architect 8" can be chosen meanwhile.
      const finishExport = beginExport();
      try {
        await download();
      } catch (error) {
        // Nor one no host would import: its finish stage has no heading or
        // text in its default language, or two labels read the same.
        if (error instanceof DownloadRefusedError) {
          void openDialog({
            type: 'acknowledge',
            intent: 'destructive',
            title: createElement(DownloadRefusalTitle),
            description: createElement(DownloadRefusalMessage, {
              problem: error.problem,
            }),
            actions: {
              primary: {
                label: createElement(AppMessage, { message: messages.oK }),
                value: true,
              },
            },
            finalFocus: resolveFocus,
          });
          return;
        }
        // A protocol whose resources cannot all be read is not written at all:
        // omitting them would produce a file whose stages reference resources
        // the manifest no longer lists, which no version of Architect can
        // open. Named so the researcher knows what to restore.
        if (error instanceof UnresolvedAssetsError) {
          void openDialog({
            type: 'acknowledge',
            intent: 'destructive',
            title: createElement(AppMessage, {
              message: messages.someAssetsCouldNotBeIncluded,
            }),
            description: createElement(AppErrorMessage, {
              error: createMessageError(messages.wasDownloadedButThese, {
                value1: name,
                assetList: { list: error.assetNames },
              }),
            }),
            actions: {
              primary: {
                label: createElement(AppMessage, { message: messages.oK }),
                value: true,
              },
            },
            finalFocus: resolveFocus,
          });
          return;
        }
        // Surface bundling/download failures instead of letting the promise
        // reject unhandled with no feedback. Not awaited so the spinner clears
        // immediately rather than waiting for the user to dismiss the dialog.
        reportError(error);
        void openDialog({
          type: 'acknowledge',
          intent: 'destructive',
          title: createElement(AppMessage, {
            message: messages.downloadFailed,
          }),
          description: createElement(AppMessage, {
            message: messages.couldNotBeDownloaded,
            values: {
              value1: name,
            },
          }),
          actions: {
            primary: {
              label: createElement(AppMessage, { message: messages.oK }),
              value: true,
            },
          },
          finalFocus: resolveFocus,
        });
      } finally {
        finishExport();
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [openDialog],
  );
  const handleDelete = useCallback(
    async (protocol: StoredProtocolRow, resolveFocus: ResolveMenuFocus) => {
      const confirmed = await openDialog({
        type: 'choice',
        intent: 'destructive',
        title: createElement(AppMessage, { message: messages.deleteProtocol }),
        description: createElement(AppMessage, {
          message: messages.andItsAssetsWill,
          values: {
            value1: protocol.name,
          },
        }),
        actions: {
          primary: {
            label: createElement(AppMessage, {
              message: commonMessages.delete,
            }),
            value: true,
          },
          cancel: {
            label: createElement(AppMessage, {
              message: commonMessages.cancel,
            }),
            value: false,
          },
        },
        // Both branches need this, for opposite reasons. The dialog's own
        // remembered opener is the menu item, which has already unmounted by
        // the time focus is returned; and on the confirm branch the Actions
        // trigger goes too, which is why `resolveFocus` falls through to the
        // listbox rather than naming one element.
        finalFocus: resolveFocus,
      });
      if (!confirmed) {
        return;
      }
      try {
        await dispatch(deleteLibraryProtocol(protocol.id)).unwrap();
      } catch (error) {
        reportError(error);
        void openDialog({
          type: 'acknowledge',
          intent: 'destructive',
          title: createElement(AppMessage, { message: messages.deleteFailed }),
          description: createElement(AppMessage, {
            message: messages.couldNotBeDeleted,
            values: {
              value1: protocol.name,
            },
          }),
          actions: {
            primary: {
              label: createElement(AppMessage, { message: messages.oK }),
              value: true,
            },
          },
          finalFocus: resolveFocus,
        });
      }
    },
    [dispatch, openDialog],
  );
  const handleShowInfo = useCallback(
    async (protocol: ProtocolInfoSource, resolveFocus: ResolveMenuFocus) => {
      infoFocusRef.current = resolveFocus;
      const assetCount = await protocol.countAssets();
      const stats: MetaStat[] = [
        {
          label: messages.stages,
          value: protocol.stageCount,
        },
        {
          label: messages.nodeTypes,
          value: protocol.nodeTypeCount,
        },
        {
          label: messages.edgeTypes,
          value: protocol.edgeTypeCount,
        },
        {
          label: messages.assets,
          value: assetCount,
        },
        {
          label: messages.added,
          value: protocol.createdAt,
          kind: 'date',
        },
        {
          label: messages.edited,
          value: protocol.updatedAt,
          kind: 'date',
        },
      ];
      setInfo({
        title: protocol.name,
        description: protocol.description,
        stats,
      });
      setInfoOpen(true);
    },
    [],
  );
  // Templates aren't stored in the library, so build their info from the
  // in-memory protocol object rather than the asset DB. This surfaces the
  // template's full title and (rich) description, which the truncated row can't.
  const handleShowTemplateInfo = useCallback(
    (template: BundledTemplate, resolveFocus: ResolveMenuFocus) => {
      infoFocusRef.current = resolveFocus;
      const { protocol } = template;
      const stats: MetaStat[] = [
        {
          label: messages.stages,
          value: protocol.stages.length,
        },
        {
          label: messages.nodeTypes,
          value: Object.keys(protocol.codebook.node ?? {}).length,
        },
        {
          label: messages.edgeTypes,
          value: Object.keys(protocol.codebook.edge ?? {}).length,
        },
      ];
      setInfo({
        title: protocol.name ?? template.name,
        description: protocol.description ?? template.description,
        stats,
      });
      setInfoOpen(true);
    },
    [],
  );
  const handleShowStorageInfo = useCallback(() => {
    void openDialog({
      type: 'acknowledge',
      intent: 'info',
      title: createElement(AppMessage, { message: messages.protocolStorage }),
      children: (
        <>
          <Paragraph>
            {createElement(AppMessage, {
              message: messages.yourProtocolsAreSavedOnlyOn,
            })}
          </Paragraph>
          <Paragraph>
            {createElement(AppMessage, {
              message: additionalMessages.becauseYourWorkIsStoredLocally,
              values: {
                code: renderCode,
                ExternalLink: renderSavingAndBackingUpLink,
              },
            })}
          </Paragraph>
          <Paragraph>
            {createElement(AppMessage, {
              message:
                additionalMessages.lookingForInspirationBrowseExampleResearch,
              values: {
                ExternalLink: renderProtocolGalleryLink,
              },
            })}
          </Paragraph>
        </>
      ),
      actions: {
        primary: {
          label: createElement(AppMessage, { message: messages.oK }),
          value: true,
        },
      },
    });
  }, [openDialog]);
  const handleClearAll = useCallback(async () => {
    const confirmed = await openDialog({
      type: 'choice',
      intent: 'destructive',
      title: createElement(AppMessage, { message: messages.removeAllData }),
      description: createElement(AppMessage, {
        message: messages.clearAllKeepsSchema8Protocols,
      }),
      actions: {
        primary: {
          label: createElement(AppMessage, { message: messages.removeAll }),
          value: true,
        },
        cancel: {
          label: createElement(AppMessage, { message: commonMessages.cancel }),
          value: false,
        },
      },
    });
    if (!confirmed) {
      return;
    }
    try {
      await clearAllStorage();
    } catch (error) {
      reportError(error);
      void openDialog({
        type: 'acknowledge',
        intent: 'destructive',
        title: createElement(AppMessage, {
          message: messages.couldNotRemoveData,
        }),
        description: createElement(AppMessage, {
          message: messages.architectSStoredDataCouldNotBe,
        }),
        actions: {
          primary: {
            label: createElement(AppMessage, { message: messages.oK }),
            value: true,
          },
        },
      });
    }
  }, [openDialog]);
  const recentItems = useMemo<LibraryPanelItem[]>(() => {
    const ownItems: LibraryPanelItem[] = protocols.map((protocol) => ({
      kind: 'row' as const,
      id: protocol.id,
      textValue: protocol.name,
      name: protocol.name,
      description: protocol.protocol.description,
      meta: formatProtocolMeta(protocol, intl),
      updatedAt: protocol.updatedAt,
      downloading: downloadingIds.has(protocol.id),
      onOpen: () => onOpenProtocol(protocol.id),
      onDownload: (resolveFocus) =>
        void handleDownload(
          {
            key: protocol.id,
            name: protocol.name,
            download: () =>
              downloadProtocolAsNetcanvas(
                protocol.protocol,
                protocol.name,
                protocol.id,
              ),
          },
          resolveFocus,
        ),
      onDelete: (resolveFocus) => void handleDelete(protocol, resolveFocus),
      onShowInfo: (resolveFocus) =>
        void handleShowInfo(
          {
            name: protocol.name,
            description: protocol.protocol.description,
            stageCount: protocol.protocol.stages.length,
            nodeTypeCount: Object.keys(protocol.protocol.codebook.node ?? {})
              .length,
            edgeTypeCount: Object.keys(protocol.protocol.codebook.edge ?? {})
              .length,
            countAssets: () => getProtocolAssetCount(protocol.id),
            createdAt: protocol.createdAt,
            updatedAt: protocol.updatedAt,
          },
          resolveFocus,
        ),
    }));

    // Architect 8's protocols. This app never writes that library, so they
    // have no Delete; opening one offers the choice, and the menu holds both
    // ways out of it directly.
    const legacyArchitect = getBundledLegacyArchitect();
    const legacyItems: LibraryPanelItem[] = legacyProtocols.map((row) => {
      const key = `legacy:${row.id}`;
      const description =
        typeof row.protocol.description === 'string'
          ? row.protocol.description
          : undefined;
      return {
        kind: 'row' as const,
        id: key,
        textValue: row.name,
        name: row.name,
        description,
        meta: formatProtocolMeta(row, intl),
        badges: [
          intl.formatMessage(legacyProtocolMessages.schemaBadge, {
            version: row.schemaVersion,
          }),
        ],
        updatedAt: row.updatedAt,
        downloading: downloadingIds.has(key),
        onOpen: (resolveFocus) => onOpenLegacyProtocol(row.id, resolveFocus),
        openItem: legacyArchitect
          ? {
              label: intl.formatMessage(
                legacyProtocolMessages.openInArchitect,
                {
                  version: LEGACY_ARCHITECT_MAJOR,
                },
              ),
              onSelect: () => onOpenInLegacyArchitect(row.id),
            }
          : null,
        upgradeItem: {
          label: intl.formatMessage(legacyProtocolMessages.upgradeToSchema, {
            version: APP_SCHEMA_VERSION,
          }),
          onSelect: (resolveFocus) =>
            onUpgradeLegacyProtocol(row.id, resolveFocus),
        },
        onDownload: (resolveFocus) =>
          void handleDownload(
            {
              key,
              name: row.name,
              download: () => downloadLegacyProtocolAsNetcanvas(row),
            },
            resolveFocus,
          ),
        onShowInfo: (resolveFocus) =>
          void handleShowInfo(
            {
              name: row.name,
              description,
              stageCount: row.protocol.stages.length,
              nodeTypeCount: countCodebookTypes(row.protocol.codebook, 'node'),
              edgeTypeCount: countCodebookTypes(row.protocol.codebook, 'edge'),
              countAssets: () => countLegacyAssets(row.id),
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            },
            resolveFocus,
          ),
      };
    });

    // One list, most recently edited first, whichever library a row is in.
    return [...ownItems, ...legacyItems].toSorted(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
    );
  }, [
    intl,
    protocols,
    legacyProtocols,
    downloadingIds,
    onOpenProtocol,
    onOpenLegacyProtocol,
    onOpenInLegacyArchitect,
    onUpgradeLegacyProtocol,
    handleDownload,
    handleDelete,
    handleShowInfo,
  ]);
  const templateItems = useMemo<LibraryPanelItem[]>(() => {
    const items: LibraryPanelItem[] = [
      {
        kind: 'row',
        id: 'sample-protocol',
        textValue: 'Sample Protocol',
        name: 'Sample Protocol',
        description:
          sampleProtocol.description ??
          intl.formatMessage(chromeMessages.anExampleIntroducingTheKeyFeatures),
        meta: formatTemplateMeta(sampleProtocol, intl),
        onOpen: onOpenSample,
      },
    ];
    if (import.meta.env.DEV) {
      items.push({
        kind: 'row',
        id: 'development-protocol',
        textValue: 'Development Protocol',
        name: 'Development Protocol',
        description: intl.formatMessage(
          messages.includesExamplesOfEveryStageType,
        ),
        onOpen: onOpenDevProtocol,
      });
    }
    items.push(
      ...templates.map((template) => ({
        kind: 'row' as const,
        id: `template-${template.id}`,
        textValue: template.name,
        name: template.name,
        description: template.description,
        meta: formatTemplateMeta(template.protocol, intl),
        onOpen: () => onOpenTemplate(template),
        onShowInfo: (resolveFocus: ResolveMenuFocus) =>
          handleShowTemplateInfo(template, resolveFocus),
      })),
    );
    return items;
  }, [
    handleShowTemplateInfo,
    onOpenDevProtocol,
    onOpenSample,
    onOpenTemplate,
    templates,
    intl,
  ]);
  const templateCount = (import.meta.env.DEV ? 2 : 1) + templates.length;
  const templateLabel = intl.formatMessage(chromeMessages.templateCount, {
    count: templateCount,
  });
  const storageTooltip = intl.formatMessage(
    chromeMessages.yourProtocolsAreSavedOnlyOn,
    { protocolCount },
  );
  const headerEnd =
    activeTab === 'recent' ? (
      <div className="flex min-w-max items-center justify-end gap-2.5">
        <Badge color="platinum">
          {intl.formatMessage(messages.protocolCount, { count: protocolCount })}
        </Badge>
        <Tooltip>
          <TooltipTrigger
            render={
              <IconButton
                variant="text"
                size="sm"
                aria-label={intl.formatMessage(
                  messages.whereYourProtocolsAreStored,
                )}
                onClick={handleShowStorageInfo}
                icon={<Info />}
              />
            }
          />
          <TooltipContent side="bottom">{storageTooltip}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <IconButton
                variant="text"
                size="sm"
                aria-label={intl.formatMessage(
                  messages.clearAllLocallySavedProtocols,
                )}
                onClick={() => void handleClearAll()}
                icon={<Trash2 />}
              />
            }
          />
          <TooltipContent side="bottom">
            {intl.formatMessage(messages.clearAllLocallySavedProtocols)}
          </TooltipContent>
        </Tooltip>
      </div>
    ) : activeTab === 'templates' ? (
      <div className="flex min-w-max items-center justify-end">
        <Badge color="platinum">{templateLabel}</Badge>
      </div>
    ) : null;
  return (
    // `grow` takes the height `Home`'s column has left rather than stating one:
    // no floor and no `max-h`, so the panel neither forces the page to scroll
    // nor caps itself below the space it was given. What a short window gives
    // up is taken inside, by the tab panels, which scroll (`PANEL_CLASSES`) —
    // `Surface` is `overflow-clip`, so that is what keeps the gallery card
    // reachable instead of cut off.
    <Surface spacing="sm" className="publish-colors w-full grow" noContainer>
      <Tabs
        aria-label={intl.formatMessage(messages.protocolLibrary)}
        layout="top"
        value={activeTab}
        onValueChange={(value) => {
          if (value === 'recent' || value === 'templates') {
            setTab(value);
          }
        }}
        tabs={[
          { value: 'recent', label: intl.formatMessage(messages.recent) },
          { value: 'templates', label: intl.formatMessage(messages.templates) },
        ]}
        headerEnd={headerEnd}
        className="h-full"
      >
        <TabsPanel value="recent" className={PANEL_CLASSES}>
          <Collection
            id="recent-protocols"
            items={recentItems}
            keyExtractor={getLibraryItemKey}
            textValueExtractor={getLibraryItemTextValue}
            layout={recentLayout}
            renderItem={renderLibraryItem}
            selectionMode="none"
            animate={false}
            aria-label={intl.formatMessage(messages.recentProtocols)}
            // className="p-0"
            // viewportClassName={COLLECTION_VIEWPORT_CLASSES}
            emptyState={
              <Paragraph
                intent="smallText"
                emphasis="muted"
                className="px-5 py-10 text-center"
              >
                {intl.formatMessage(messages.noRecentProtocolsYet)}
              </Paragraph>
            }
          >
            {(CollectionElements) => CollectionElements}
          </Collection>
        </TabsPanel>

        <TabsPanel value="templates" className={PANEL_CLASSES}>
          <ScrollArea>
            <div className="px-2">
              <Collection
                id="protocol-templates"
                items={templateItems}
                keyExtractor={getLibraryItemKey}
                textValueExtractor={getLibraryItemTextValue}
                layout={templateLayout}
                renderItem={renderLibraryItem}
                selectionMode="none"
                animate={false}
                aria-label={intl.formatMessage(messages.protocolTemplates)}
                scrollable={false}
              >
                {(CollectionElements) => CollectionElements}
              </Collection>
              <GalleryCard />
            </div>
          </ScrollArea>
        </TabsPanel>
      </Tabs>

      <Dialog
        open={infoOpen}
        closeDialog={() => setInfoOpen(false)}
        title={info?.title ?? ''}
        size="readable"
        finalFocus={() => infoFocusRef.current?.() ?? null}
        footer={
          <Button onClick={() => setInfoOpen(false)}>
            {intl.formatMessage(commonMessages.close)}
          </Button>
        }
      >
        {info && (
          <div className="flex flex-col gap-5">
            <Paragraph className="whitespace-pre-wrap">
              {info.description?.trim() ||
                intl.formatMessage(chromeMessages.thisProtocolHasNoDescription)}
            </Paragraph>
            <div className="flex flex-col overflow-hidden rounded">
              <Table
                columns={[
                  {
                    Header: intl.formatMessage(messages.property),
                    accessor: 'label',
                  },
                  {
                    Header: intl.formatMessage(messages.value),
                    accessor: 'value',
                  },
                ]}
                data={info.stats.map((stat) => ({
                  label: intl.formatMessage(stat.label),
                  value:
                    stat.kind === 'date'
                      ? formatTimestamp(stat.value, intl)
                      : intl.formatNumber(stat.value),
                }))}
              />
            </div>
          </div>
        )}
      </Dialog>
    </Surface>
  );
};
export default LibraryPanel;
