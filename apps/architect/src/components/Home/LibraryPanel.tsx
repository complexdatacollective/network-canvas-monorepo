import {
  Download,
  Ellipsis,
  FolderOpen,
  Info,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { createElement, useCallback, useMemo, useRef, useState } from 'react';

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
import Button, { IconButton } from '@codaco/fresco-ui/Button';
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
import ExternalLink from '~/components/ExternalLink';
import { useAppDispatch } from '~/ducks/hooks';
import { deleteLibraryProtocol } from '~/ducks/modules/userActions/userActions';
import { useProtocolLibrary } from '~/hooks/useProtocolLibrary';
import fileIcon from '~/images/file-icon.svg';
import type { BundledTemplate } from '~/templates';
import { sampleProtocol } from '~/templates/sample-protocol';
import { clearAllStorage, type StoredProtocolRow } from '~/utils/assetDB';
import { getProtocolAssetCount } from '~/utils/assetUtils';
import { downloadProtocolAsNetcanvas } from '~/utils/bundleProtocol';
import { documentationLinks } from '~/utils/documentationLinks';
import { reportError } from '~/utils/reportError';
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
    description: 'The description text in components / Home / LibraryPanel.',
  },
  yourProtocolsAreSavedOnlyOn: {
    id: 'architect.chrome.home.libraryPanel.yourProtocolsAreSavedOnlyOn',
    defaultMessage:
      '{protocolCount, plural, one {Your protocol is saved only on this device. It is never uploaded to a server.} other {Your # protocols are saved only on this device. They are never uploaded to a server.}}',
    description:
      'Researcher-facing explanatory text in components / Home / LibraryPanel.',
  },
  thisProtocolHasNoDescription: {
    id: 'architect.chrome.home.libraryPanel.thisProtocolHasNoDescription',
    defaultMessage: 'This protocol has no description.',
    description: 'Visible text in components / Home / LibraryPanel.',
  },
});
const additionalMessages = defineMessages({
  moreExamplesOfNetworkCanvasProtocols: {
    id: 'architect.additional.home.libraryPanel.moreExamplesOfNetworkCanvasProtocols',
    defaultMessage:
      'More examples of Network Canvas protocols can be found on our <ExternalLink>Protocol Gallery</ExternalLink>.',
    description: 'Visible text in components / Home / LibraryPanel.',
  },
  becauseYourWorkIsStoredLocally: {
    id: 'architect.additional.home.libraryPanel.becauseYourWorkIsStoredLocally',
    defaultMessage:
      'Because your work is stored locally, clearing Architect\'s app data, or using "Clear all protocols", will permanently remove it. Download the protocol as a <code>.netcanvas</code> file to save a copy or move it to another device. See our guide to <ExternalLink>saving and backing up your work</ExternalLink> for more.',
    description: 'Visible text in components / Home / LibraryPanel.',
  },
  lookingForInspirationBrowseExampleResearch: {
    id: 'architect.additional.home.libraryPanel.lookingForInspirationBrowseExampleResearch',
    defaultMessage:
      'Looking for inspiration? Browse example research protocols in the <ExternalLink>Protocol Gallery</ExternalLink>.',
    description: 'Visible text in components / Home / LibraryPanel.',
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
    description: 'The aria-label text in components / Home / LibraryPanel.',
  },
  open: {
    id: 'architect.home.libraryPanel.open',
    defaultMessage: 'Open',
    description: 'Visible text in components / Home / LibraryPanel.',
  },
  seeMoreInfo: {
    id: 'architect.home.libraryPanel.seeMoreInfo',
    defaultMessage: 'See more info',
    description: 'Visible text in components / Home / LibraryPanel.',
  },
  download: {
    id: 'architect.home.libraryPanel.download',
    defaultMessage: 'Download',
    description: 'Visible text in components / Home / LibraryPanel.',
  },
  protocolGallery: {
    id: 'architect.home.libraryPanel.protocolGallery',
    defaultMessage: 'Protocol gallery',
    description: 'The aria-label text in components / Home / LibraryPanel.',
  },
  lookingForMore: {
    id: 'architect.home.libraryPanel.lookingForMore',
    defaultMessage: 'Looking for more?',
    description: 'Visible text in components / Home / LibraryPanel.',
  },
  dismiss: {
    id: 'architect.home.libraryPanel.dismiss',
    defaultMessage: 'Dismiss',
    description: 'The aria-label text in components / Home / LibraryPanel.',
  },
  someAssetsCouldNotBeIncluded: {
    id: 'architect.home.libraryPanel.someAssetsCouldNotBeIncluded',
    defaultMessage: 'Some assets could not be included',
    description: 'The title text in components / Home / LibraryPanel.',
  },
  wasDownloadedButThese: {
    id: 'architect.home.libraryPanel.wasDownloadedButThese',
    defaultMessage:
      '"{value1}" was downloaded, but these assets could not be included and are missing from the file: {assetList}.',
    description: 'The description text in components / Home / LibraryPanel.',
  },
  oK: {
    id: 'architect.home.libraryPanel.oK',
    defaultMessage: 'OK',
    description: 'The label text in components / Home / LibraryPanel.',
  },
  downloadFailed: {
    id: 'architect.home.libraryPanel.downloadFailed',
    defaultMessage: 'Download failed',
    description: 'The title text in components / Home / LibraryPanel.',
  },
  couldNotBeDownloaded: {
    id: 'architect.home.libraryPanel.couldNotBeDownloaded',
    defaultMessage: '"{value1}" could not be downloaded.',
    description: 'The description text in components / Home / LibraryPanel.',
  },
  deleteProtocol: {
    id: 'architect.home.libraryPanel.deleteProtocol',
    defaultMessage: 'Delete protocol?',
    description: 'The title text in components / Home / LibraryPanel.',
  },
  andItsAssetsWill: {
    id: 'architect.home.libraryPanel.andItsAssetsWill',
    defaultMessage:
      '"{value1}" and its assets will be permanently removed from this device. This cannot be undone.',
    description: 'The description text in components / Home / LibraryPanel.',
  },
  deleteFailed: {
    id: 'architect.home.libraryPanel.deleteFailed',
    defaultMessage: 'Delete failed',
    description: 'The title text in components / Home / LibraryPanel.',
  },
  couldNotBeDeleted: {
    id: 'architect.home.libraryPanel.couldNotBeDeleted',
    defaultMessage: '"{value1}" could not be deleted.',
    description: 'The description text in components / Home / LibraryPanel.',
  },
  stages: {
    id: 'architect.home.libraryPanel.stages',
    defaultMessage: 'Stages',
    description: 'The label text in components / Home / LibraryPanel.',
  },
  nodeTypes: {
    id: 'architect.home.libraryPanel.nodeTypes',
    defaultMessage: 'Node types',
    description: 'The label text in components / Home / LibraryPanel.',
  },
  edgeTypes: {
    id: 'architect.home.libraryPanel.edgeTypes',
    defaultMessage: 'Edge types',
    description: 'The label text in components / Home / LibraryPanel.',
  },
  assets: {
    id: 'architect.home.libraryPanel.assets',
    defaultMessage: 'Assets',
    description: 'The label text in components / Home / LibraryPanel.',
  },
  added: {
    id: 'architect.home.libraryPanel.added',
    defaultMessage: 'Added',
    description: 'The label text in components / Home / LibraryPanel.',
  },
  edited: {
    id: 'architect.home.libraryPanel.edited',
    defaultMessage: 'Edited',
    description: 'The label text in components / Home / LibraryPanel.',
  },
  protocolStorage: {
    id: 'architect.home.libraryPanel.protocolStorage',
    defaultMessage: 'Protocol Storage',
    description: 'The title text in components / Home / LibraryPanel.',
  },
  yourProtocolsAreSavedOnlyOn: {
    id: 'architect.home.libraryPanel.yourProtocolsAreSavedOnlyOn',
    defaultMessage:
      'Your protocols are saved only on this device. They are never uploaded to a server.',
    description: 'Visible text in components / Home / LibraryPanel.',
  },
  removeAllData: {
    id: 'architect.home.libraryPanel.removeAllData',
    defaultMessage: 'Remove all data?',
    description: 'The title text in components / Home / LibraryPanel.',
  },
  everyProtocolAssetAndSettingStored: {
    id: 'architect.home.libraryPanel.everyProtocolAssetAndSettingStored',
    defaultMessage:
      'Every protocol, asset, and setting stored locally by Architect will be permanently removed. This cannot be undone.',
    description: 'The description text in components / Home / LibraryPanel.',
  },
  removeAll: {
    id: 'architect.home.libraryPanel.removeAll',
    defaultMessage: 'Remove all',
    description: 'The label text in components / Home / LibraryPanel.',
  },
  couldNotRemoveData: {
    id: 'architect.home.libraryPanel.couldNotRemoveData',
    defaultMessage: 'Could not remove data',
    description: 'The title text in components / Home / LibraryPanel.',
  },
  architectSStoredDataCouldNotBe: {
    id: 'architect.home.libraryPanel.architectSStoredDataCouldNotBe',
    defaultMessage: "Architect's stored data could not be removed.",
    description: 'The description text in components / Home / LibraryPanel.',
  },
  includesExamplesOfEveryStageType: {
    id: 'architect.home.libraryPanel.includesExamplesOfEveryStageType',
    defaultMessage: 'Includes examples of every stage type',
    description: 'The description text in components / Home / LibraryPanel.',
  },
  whereYourProtocolsAreStored: {
    id: 'architect.home.libraryPanel.whereYourProtocolsAreStored',
    defaultMessage: 'Where your protocols are stored',
    description: 'The aria-label text in components / Home / LibraryPanel.',
  },
  clearAllLocallySavedProtocols: {
    id: 'architect.home.libraryPanel.clearAllLocallySavedProtocols',
    defaultMessage: 'Clear all locally saved protocols',
    description: 'The aria-label text in components / Home / LibraryPanel.',
  },
  protocolLibrary: {
    id: 'architect.home.libraryPanel.protocolLibrary',
    defaultMessage: 'Protocol library',
    description: 'The aria-label text in components / Home / LibraryPanel.',
  },
  recent: {
    id: 'architect.home.libraryPanel.recent',
    defaultMessage: 'Recent',
    description: 'The label text in components / Home / LibraryPanel.',
  },
  templates: {
    id: 'architect.home.libraryPanel.templates',
    defaultMessage: 'Templates',
    description: 'The label text in components / Home / LibraryPanel.',
  },
  recentProtocols: {
    id: 'architect.home.libraryPanel.recentProtocols',
    defaultMessage: 'Recent protocols',
    description: 'The aria-label text in components / Home / LibraryPanel.',
  },
  noRecentProtocolsYet: {
    id: 'architect.home.libraryPanel.noRecentProtocolsYet',
    defaultMessage: 'No recent protocols yet.',
    description: 'Visible text in components / Home / LibraryPanel.',
  },
  protocolTemplates: {
    id: 'architect.home.libraryPanel.protocolTemplates',
    defaultMessage: 'Protocol templates',
    description: 'The aria-label text in components / Home / LibraryPanel.',
  },
});
const extraMessages = defineMessages({
  justNow: {
    id: 'architect.library.metadata.justNow',
    defaultMessage: '< 1 min ago',
    description: 'Researcher-facing Architect control or feedback.',
  },
  protocolMeta: {
    id: 'architect.library.metadata.protocolMeta',
    defaultMessage:
      '{count, plural, one {# stage} other {# stages}} \u00b7 Added {created} \u00b7 Edited {updated}',
    description: 'Researcher-facing Architect control or feedback.',
  },
  templateMeta: {
    id: 'architect.library.metadata.templateMeta',
    defaultMessage:
      '{stages, plural, one {# stage} other {# stages}} \u00b7 {nodes, plural, one {# node type} other {# node types}} \u00b7 {edges, plural, one {# edge type} other {# edge types}}',
    description: 'Researcher-facing Architect control or feedback.',
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
type MetaStat = {
  label: MessageDescriptor;
  value: number;
  kind?: 'date';
};
const formatProtocolMeta = (
  protocol: StoredProtocolRow,
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
type LibraryRowItem = Record<string, unknown> & {
  kind: 'row';
  id: string;
  textValue: string;
  name: string;
  description?: string;
  meta?: string;
  downloading?: boolean;
  onOpen: () => void;
  onDownload?: (resolveFocus: ResolveMenuFocus) => void;
  onDelete?: (resolveFocus: ResolveMenuFocus) => void;
  onShowInfo?: (resolveFocus: ResolveMenuFocus) => void;
};
type LibraryPanelItem = LibraryRowItem;
type PanelRowProps = {
  itemProps: ItemProps;
  name: string;
  description?: string;
  meta?: string;
  downloading?: boolean;
  onOpen: () => void;
  onDownload?: (resolveFocus: ResolveMenuFocus) => void;
  onDelete?: (resolveFocus: ResolveMenuFocus) => void;
  onShowInfo?: (resolveFocus: ResolveMenuFocus) => void;
};
const PanelRow = ({
  itemProps,
  name,
  description,
  meta,
  downloading = false,
  onOpen,
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
    if (!event.currentTarget.contains(event.target as Node)) return;
    onOpen();
  };
  const handleKeyDown = (event: React.KeyboardEvent) => {
    itemProps.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    // Ignore keys on the inner action buttons so they don't also open the row.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
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
          console.error('LibraryPanel action failed', error);
          reportError(error);
        });
    };

  const hasMenu = Boolean(onDownload || onDelete || onShowInfo);

  return (
    <div
      {...itemProps}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="group focusable hover:bg-surface-1 data-focused:bg-surface-1 flex w-full shrink-0 cursor-pointer items-center gap-2.5 rounded px-5 py-2.5 text-left transition-colors"
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
          title={name}
          dir="auto"
          className="line-clamp-2 font-semibold wrap-anywhere"
          margin="none"
        >
          {name}
        </Heading>
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
              <DropdownMenuItem
                icon={<FolderOpen />}
                onClick={runMenuAction(onOpen)}
              >
                {intl.formatMessage(messages.open)}
              </DropdownMenuItem>
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
              ExternalLink: (chunks) => (
                <ExternalLink href="https://protocolgallery.networkcanvas.com/">
                  {chunks}
                </ExternalLink>
              ),
            },
          )}
        </Paragraph>
      </div>
      <IconButton
        variant="text"
        color="dynamic"
        size="sm"
        aria-label={intl.formatMessage(messages.dismiss)}
        className="absolute top-1 right-2"
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
      downloading={item.downloading}
      onOpen={item.onOpen}
      onDownload={item.onDownload}
      onDelete={item.onDelete}
      onShowInfo={item.onShowInfo}
    />
  );
};
type LibraryPanelProps = {
  // Open a saved protocol from the library.
  onOpenProtocol: (id: string) => void;
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
  onOpenSample,
  onOpenDevProtocol,
  templates,
  onOpenTemplate,
}: LibraryPanelProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const { protocols } = useProtocolLibrary();
  const [tab, setTab] = useState<Tab>('recent');
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
  const activeTab = tab;
  const handleDownload = useCallback(
    async (protocol: StoredProtocolRow, resolveFocus: ResolveMenuFocus) => {
      setDownloadingIds((prev) => new Set(prev).add(protocol.id));
      try {
        const skippedAssets = await downloadProtocolAsNetcanvas(
          protocol.protocol,
          protocol.name,
          protocol.id,
        );
        // Export is best-effort: unresolvable assets are omitted rather than
        // aborting the whole download, but the author must be told which ones
        // so a silently incomplete .netcanvas isn't shipped.
        if (skippedAssets.length > 0) {
          void openDialog({
            type: 'acknowledge',
            intent: 'warning',
            title: createElement(AppMessage, {
              message: messages.someAssetsCouldNotBeIncluded,
            }),
            description: createElement(AppErrorMessage, {
              error: createMessageError(messages.wasDownloadedButThese, {
                value1: protocol.name,
                assetList: { list: skippedAssets.map((asset) => asset.name) },
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
        }
      } catch (error) {
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
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(protocol.id);
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
    async (protocol: StoredProtocolRow, resolveFocus: ResolveMenuFocus) => {
      infoFocusRef.current = resolveFocus;
      const { codebook } = protocol.protocol;
      const assetCount = await getProtocolAssetCount(protocol.id);
      const stats: MetaStat[] = [
        {
          label: messages.stages,
          value: protocol.protocol.stages.length,
        },
        {
          label: messages.nodeTypes,
          value: Object.keys(codebook.node ?? {}).length,
        },
        {
          label: messages.edgeTypes,
          value: Object.keys(codebook.edge ?? {}).length,
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
        description: protocol.protocol.description,
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
                code: (chunks) => <code>{chunks}</code>,
                ExternalLink: (chunks) => (
                  <ExternalLink href={documentationLinks.savingAndBackingUp}>
                    {chunks}
                  </ExternalLink>
                ),
              },
            })}
          </Paragraph>
          <Paragraph>
            {createElement(AppMessage, {
              message:
                additionalMessages.lookingForInspirationBrowseExampleResearch,
              values: {
                ExternalLink: (chunks) => (
                  <ExternalLink href={documentationLinks.protocolGallery}>
                    {chunks}
                  </ExternalLink>
                ),
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
        message: messages.everyProtocolAssetAndSettingStored,
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
  const recentItems = useMemo<LibraryPanelItem[]>(
    () =>
      protocols.map((protocol) => ({
        kind: 'row' as const,
        id: protocol.id,
        textValue: protocol.name,
        name: protocol.name,
        description: protocol.protocol.description,
        meta: formatProtocolMeta(protocol, intl),
        downloading: downloadingIds.has(protocol.id),
        onOpen: () => onOpenProtocol(protocol.id),
        onDownload: (resolveFocus) =>
          void handleDownload(protocol, resolveFocus),
        onDelete: (resolveFocus) => void handleDelete(protocol, resolveFocus),
        onShowInfo: (resolveFocus) =>
          void handleShowInfo(protocol, resolveFocus),
      })),
    [
      intl,
      protocols,
      downloadingIds,
      onOpenProtocol,
      handleDownload,
      handleDelete,
      handleShowInfo,
    ],
  );
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
  const protocolCount = protocols.length;
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
        <Badge color="platinum" className="shadow-none">
          {templateLabel}
        </Badge>
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
              <Paragraph className="px-5 py-10 text-center text-sm text-current/70">
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
                viewportClassName="overflow-visible"
                className="overflow-visible"
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
