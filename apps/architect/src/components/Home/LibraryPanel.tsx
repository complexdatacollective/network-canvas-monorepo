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
import { useCallback, useMemo, useRef, useState } from 'react';

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
type Tab = 'recent' | 'templates';
const RELATIVE_CUTOFF_DAYS = 7;
const formatTimestamp = (millis: number): string => {
  const dt = DateTime.fromMillis(millis);
  const secondsAgo = -dt.diffNow('seconds').seconds;
  if (secondsAgo < 60) {
    return '< 1 min ago';
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
  label: string;
  value: string;
};
const formatProtocolMeta = (protocol: StoredProtocolRow): string => {
  const stageCount = protocol.protocol.stages.length;
  return [
    `${stageCount} ${stageCount === 1 ? 'stage' : 'stages'}`,
    `Added ${formatTimestamp(protocol.createdAt)}`,
    `Edited ${formatTimestamp(protocol.updatedAt)}`,
  ].join(' · ');
};
// Bundled templates aren't library rows: they carry no created/updated
// timestamps, only the counts already baked into their protocol JSON.
const formatTemplateMeta = (protocol: CurrentProtocol): string => {
  const stageCount = protocol.stages.length;
  const nodeTypeCount = Object.keys(protocol.codebook.node ?? {}).length;
  const edgeTypeCount = Object.keys(protocol.codebook.edge ?? {}).length;
  return [
    `${stageCount} ${stageCount === 1 ? 'stage' : 'stages'}`,
    `${nodeTypeCount} node ${nodeTypeCount === 1 ? 'type' : 'types'}`,
    `${edgeTypeCount} edge ${edgeTypeCount === 1 ? 'type' : 'types'}`,
  ].join(' · ');
};
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
                  aria-label={`Actions for ${name}`}
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
                Open
              </DropdownMenuItem>
              {onShowInfo && (
                <DropdownMenuItem
                  icon={<Info />}
                  onClick={runMenuAction(onShowInfo)}
                >
                  See more info
                </DropdownMenuItem>
              )}
              {onDownload && (
                <DropdownMenuItem
                  icon={<Download />}
                  disabled={downloading}
                  onClick={runMenuAction(onDownload)}
                >
                  Download
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  icon={<Trash2 />}
                  onClick={runMenuAction(onDelete)}
                >
                  Delete
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
      aria-label="Protocol gallery"
      spacing="sm"
      className="mb-4"
    >
      <div>
        <Heading level="h4">Looking for more?</Heading>
        <Paragraph intent="smallText">
          More examples of Network Canvas protocols can be found on our{' '}
          <ExternalLink href="https://protocolgallery.networkcanvas.com/">
            protocol gallery
          </ExternalLink>
        </Paragraph>
      </div>
      <IconButton
        variant="text"
        color="dynamic"
        size="sm"
        aria-label="Dismiss"
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
// Once the list is at its floor and the card is at its natural height, a panel
// too short for both has to give somewhere. It scrolls: `Surface` is
// `overflow-clip`, so anything the panel cannot hold would otherwise be cut off
// with no way to reach it — which is how the card disappears on a short window.
const PANEL_CLASSES = 'flex min-h-0 flex-col overflow-x-hidden overflow-y-auto';

const LibraryPanel = ({
  onOpenProtocol,
  onOpenSample,
  onOpenDevProtocol,
  templates,
  onOpenTemplate,
}: LibraryPanelProps) => {
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
          const assetList = skippedAssets.map((asset) => asset.name).join(', ');
          void openDialog({
            type: 'acknowledge',
            intent: 'warning',
            title: 'Some assets could not be included',
            description: `"${protocol.name}" was downloaded, but these assets could not be included and are missing from the file: ${assetList}.`,
            actions: { primary: { label: 'OK', value: true } },
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
          title: 'Download failed',
          description: `"${protocol.name}" could not be downloaded.`,
          actions: { primary: { label: 'OK', value: true } },
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
        title: 'Delete protocol?',
        description: `"${protocol.name}" and its assets will be permanently removed from this device. This cannot be undone.`,
        actions: {
          primary: { label: 'Delete', value: true },
          cancel: { label: 'Cancel', value: false },
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
          title: 'Delete failed',
          description: `"${protocol.name}" could not be deleted.`,
          actions: { primary: { label: 'OK', value: true } },
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
        { label: 'Stages', value: String(protocol.protocol.stages.length) },
        {
          label: 'Node types',
          value: String(Object.keys(codebook.node ?? {}).length),
        },
        {
          label: 'Edge types',
          value: String(Object.keys(codebook.edge ?? {}).length),
        },
        { label: 'Assets', value: String(assetCount) },
        { label: 'Added', value: formatTimestamp(protocol.createdAt) },
        { label: 'Edited', value: formatTimestamp(protocol.updatedAt) },
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
        { label: 'Stages', value: String(protocol.stages.length) },
        {
          label: 'Node types',
          value: String(Object.keys(protocol.codebook.node ?? {}).length),
        },
        {
          label: 'Edge types',
          value: String(Object.keys(protocol.codebook.edge ?? {}).length),
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
      title: 'Protocol Storage',
      children: (
        <>
          <Paragraph>
            Your protocols are saved only on this device. They are never
            uploaded to a server.
          </Paragraph>
          <Paragraph>
            Because your work is stored locally, clearing Architect&apos;s app
            data, or using &quot;Clear all protocols&quot;, will permanently
            remove it. Download the protocol as a <code>.netcanvas</code> file
            to save a copy or move it to another device. See our guide to{' '}
            <ExternalLink href={documentationLinks.savingAndBackingUp}>
              saving and backing up your work
            </ExternalLink>{' '}
            for more.
          </Paragraph>
          <Paragraph>
            Looking for inspiration? Browse example research protocols in the{' '}
            <ExternalLink href={documentationLinks.protocolGallery}>
              Protocol Gallery
            </ExternalLink>
            .
          </Paragraph>
        </>
      ),
      actions: { primary: { label: 'OK', value: true } },
    });
  }, [openDialog]);
  const handleClearAll = useCallback(async () => {
    const confirmed = await openDialog({
      type: 'choice',
      intent: 'destructive',
      title: 'Remove all data?',
      description:
        'Every protocol, asset, and setting stored locally by Architect will be permanently removed. This cannot be undone.',
      actions: {
        primary: { label: 'Remove all', value: true },
        cancel: { label: 'Cancel', value: false },
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
        title: 'Could not remove data',
        description: "Architect's stored data could not be removed.",
        actions: { primary: { label: 'OK', value: true } },
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
        meta: formatProtocolMeta(protocol),
        downloading: downloadingIds.has(protocol.id),
        onOpen: () => onOpenProtocol(protocol.id),
        onDownload: (resolveFocus) =>
          void handleDownload(protocol, resolveFocus),
        onDelete: (resolveFocus) => void handleDelete(protocol, resolveFocus),
        onShowInfo: (resolveFocus) =>
          void handleShowInfo(protocol, resolveFocus),
      })),
    [
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
          'An example introducing the key features and techniques available in Network Canvas.',
        meta: formatTemplateMeta(sampleProtocol),
        onOpen: onOpenSample,
      },
    ];
    if (import.meta.env.DEV) {
      items.push({
        kind: 'row',
        id: 'development-protocol',
        textValue: 'Development Protocol',
        name: 'Development Protocol',
        description: 'Includes examples of every stage type',
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
        meta: formatTemplateMeta(template.protocol),
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
  ]);
  const templateCount = (import.meta.env.DEV ? 2 : 1) + templates.length;
  const templateLabel = `${templateCount} ${templateCount === 1 ? 'template' : 'templates'}`;
  const protocolCount = protocols.length;
  const storageTooltip =
    protocolCount === 1
      ? 'Your 1 protocol is saved only on this device. It is never uploaded to a server.'
      : `Your ${protocolCount} protocols are saved only on this device. They are never uploaded to a server.`;
  const headerEnd =
    activeTab === 'recent' ? (
      <div className="flex min-w-max items-center justify-end gap-2.5">
        <Badge color="platinum">
          {protocolCount} {protocolCount === 1 ? 'protocol' : 'protocols'}
        </Badge>
        <Tooltip>
          <TooltipTrigger
            render={
              <IconButton
                variant="text"
                size="sm"
                aria-label="Where your protocols are stored"
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
                aria-label="Clear all locally saved protocols"
                onClick={() => void handleClearAll()}
                icon={<Trash2 />}
              />
            }
          />
          <TooltipContent side="bottom">
            Clear all locally saved protocols
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
    // 22rem is the height this panel already settles at on a 1280x720 window:
    // its own padding, the tab header, a list a little above its floor, and the
    // whole gallery card. Holding that as a floor is what makes a shorter
    // window scroll the page — `Home`'s `<main>` is already `overflow-y-auto` —
    // instead of taking the difference out of the list, which is all the
    // `min-h-0` chain down to the list could do. Deliberately outranks
    // `max-h-[85dvh]`, which CSS resolves in the floor's favour.
    <Surface spacing="sm" className="publish-colors w-full grow" noContainer>
      <Tabs
        aria-label="Protocol library"
        layout="top"
        value={activeTab}
        onValueChange={(value) => {
          if (value === 'recent' || value === 'templates') {
            setTab(value);
          }
        }}
        tabs={[
          { value: 'recent', label: 'Recent' },
          { value: 'templates', label: 'Templates' },
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
            aria-label="Recent protocols"
            // className="p-0"
            // viewportClassName={COLLECTION_VIEWPORT_CLASSES}
            emptyState={
              <Paragraph className="px-5 py-10 text-center text-sm text-current/70">
                No recent protocols yet.
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
                aria-label="Protocol templates"
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
        footer={<Button onClick={() => setInfoOpen(false)}>Close</Button>}
      >
        {info && (
          <div className="flex flex-col gap-5">
            <Paragraph className="whitespace-pre-wrap">
              {info.description?.trim() || 'This protocol has no description.'}
            </Paragraph>
            <div className="flex flex-col overflow-hidden rounded">
              <Table
                columns={[
                  { Header: 'Property', accessor: 'label' },
                  { Header: 'Value', accessor: 'value' },
                ]}
                data={info.stats}
              />
            </div>
          </div>
        )}
      </Dialog>
    </Surface>
  );
};
export default LibraryPanel;
