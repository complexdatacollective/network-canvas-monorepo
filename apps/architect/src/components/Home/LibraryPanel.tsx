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
import { useCallback, useMemo, useState } from 'react';

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
import { Tabs, TabsPanel } from '@codaco/fresco-ui/Tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
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
type LibraryRowItem = Record<string, unknown> & {
  kind: 'row';
  id: string;
  textValue: string;
  name: string;
  description?: string;
  meta?: string;
  downloading?: boolean;
  onOpen: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onShowInfo?: () => void;
};
type GalleryCardItem = Record<string, unknown> & {
  kind: 'gallery-card';
  id: string;
  textValue: string;
  onDismiss: () => void;
};
type LibraryPanelItem = LibraryRowItem | GalleryCardItem;
type PanelRowProps = {
  itemProps: ItemProps;
  name: string;
  description?: string;
  meta?: string;
  downloading?: boolean;
  onOpen: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onShowInfo?: () => void;
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
  const handleClick = (event: React.MouseEvent) => {
    itemProps.onClick?.(event);
    if (event.defaultPrevented) return;
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
  const runMenuAction = (action: () => void | Promise<void>) => () => {
    setMenuOpen(false);
    void Promise.resolve(action()).catch((error: unknown) => {
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
      className="group focusable hover:bg-surface-2 data-focused:bg-surface-2 flex w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-sm px-5 py-2.5 text-left transition-colors"
    >
      <img
        src={fileIcon}
        alt=""
        aria-hidden
        className="size-10 shrink-0 object-contain"
      />

      <span className="min-w-0 flex-1">
        <span title={name} className="line-clamp-2 font-semibold wrap-anywhere">
          {name}
        </span>
        {meta ? (
          <span className="text-muted block truncate text-sm">{meta}</span>
        ) : (
          description && (
            <span className="text-muted line-clamp-3 text-sm">
              {description}
            </span>
          )
        )}
      </span>

      {hasMenu && (
        <span className="flex shrink-0 items-center">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              render={
                <IconButton
                  variant="text"
                  aria-label={`Actions for ${name}`}
                  disabled={downloading}
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
        </span>
      )}
    </div>
  );
};
type GalleryCardProps = {
  itemProps: ItemProps;
  onDismiss: () => void;
};
const GalleryCard = ({ itemProps, onDismiss }: GalleryCardProps) => {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    itemProps.onKeyDown?.(event);
  };
  return (
    <div
      {...itemProps}
      onKeyDown={handleKeyDown}
      className="border-outline bg-surface-2 focusable data-focused:bg-surface-3 relative mt-2.5 flex flex-col gap-1 rounded-sm border p-5"
    >
      <IconButton
        variant="text"
        size="sm"
        aria-label="Dismiss"
        className="absolute top-1 right-1"
        onClick={onDismiss}
        icon={<X />}
      />
      <Paragraph className="m-0 pr-7 font-semibold">
        Looking for more?
      </Paragraph>
      <Paragraph className="text-muted m-0 text-sm">
        More examples of Network Canvas protocols can be found on our{' '}
        <ExternalLink href="https://protocolgallery.networkcanvas.com/">
          protocol gallery
        </ExternalLink>
      </Paragraph>
    </div>
  );
};
const getLibraryItemKey = (item: LibraryPanelItem) => item.id;
const getLibraryItemTextValue = (item: LibraryPanelItem) => item.textValue;
const renderLibraryItem = (item: LibraryPanelItem, itemProps: ItemProps) => {
  if (item.kind === 'gallery-card') {
    return <GalleryCard itemProps={itemProps} onDismiss={item.onDismiss} />;
  }
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
const COLLECTION_CLASSES = 'h-[min(28rem,65dvh)] min-h-0';
const COLLECTION_VIEWPORT_CLASSES = 'overflow-x-hidden px-2.5 pb-10';
// Persist the protocol-gallery card's dismissal so it stays hidden across
// reloads once the user closes it.
const GALLERY_CARD_DISMISSED_KEY = 'architect:templates-gallery-dismissed';
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
  const [galleryDismissed, setGalleryDismissed] = useState(
    () => localStorage.getItem(GALLERY_CARD_DISMISSED_KEY) === 'true',
  );
  const dismissGalleryCard = useCallback(() => {
    setGalleryDismissed(true);
    localStorage.setItem(GALLERY_CARD_DISMISSED_KEY, 'true');
  }, []);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [info, setInfo] = useState<{
    title: string;
    description?: string;
    stats: MetaStat[];
  } | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const activeTab = tab;
  const handleDownload = useCallback(
    async (protocol: StoredProtocolRow) => {
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
    async (protocol: StoredProtocolRow) => {
      const confirmed = await openDialog({
        type: 'choice',
        intent: 'destructive',
        title: 'Delete protocol?',
        description: `"${protocol.name}" and its assets will be permanently removed from this device. This cannot be undone.`,
        actions: {
          primary: { label: 'Delete', value: true },
          cancel: { label: 'Cancel', value: false },
        },
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
        });
      }
    },
    [dispatch, openDialog],
  );
  const handleShowInfo = useCallback(async (protocol: StoredProtocolRow) => {
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
  }, []);
  // Templates aren't stored in the library, so build their info from the
  // in-memory protocol object rather than the asset DB. This surfaces the
  // template's full title and (rich) description, which the truncated row can't.
  const handleShowTemplateInfo = useCallback((template: BundledTemplate) => {
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
  }, []);
  const handleShowStorageInfo = useCallback(() => {
    void openDialog({
      type: 'acknowledge',
      intent: 'info',
      title: 'Protocol Storage',
      children: (
        <>
          <Paragraph>
            Your protocols are saved only in this browser, on this device. They
            are never uploaded to a server.
          </Paragraph>
          <Paragraph>
            Because your work lives in this browser&apos;s storage, clearing
            your browsing data, or using &quot;Clear all protocols&quot;, will
            permanently remove it. Download the protocol as a{' '}
            <code>.netcanvas</code> file to save a copy or move it to another
            device. See our guide to{' '}
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
        'Every protocol, asset, and saved setting stored in this browser will be permanently removed. This cannot be undone.',
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
        description: 'The stored data could not be removed from this browser.',
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
        meta: formatProtocolMeta(protocol),
        downloading: downloadingIds.has(protocol.id),
        onOpen: () => onOpenProtocol(protocol.id),
        onDownload: () => handleDownload(protocol),
        onDelete: () => handleDelete(protocol),
        onShowInfo: () => handleShowInfo(protocol),
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
        onOpen: () => onOpenTemplate(template),
        onShowInfo: () => handleShowTemplateInfo(template),
      })),
    );
    if (!galleryDismissed) {
      items.push({
        kind: 'gallery-card',
        id: 'protocol-gallery-card',
        textValue: 'Protocol gallery',
        onDismiss: dismissGalleryCard,
      });
    }
    return items;
  }, [
    dismissGalleryCard,
    galleryDismissed,
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
      ? 'Your 1 protocol is saved only in this browser, on this device. It is never uploaded to a server.'
      : `Your ${protocolCount} protocols are saved only in this browser, on this device. They are never uploaded to a server.`;
  const headerEnd =
    activeTab === 'recent' ? (
      <div className="flex min-w-max items-center justify-end gap-2.5">
        <Badge color="platinum" className="shadow-none">
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
                aria-label="Clear all protocols from this browser"
                onClick={() => void handleClearAll()}
                icon={<Trash2 />}
              />
            }
          />
          <TooltipContent side="bottom">
            Clear all protocols from this browser
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
    <>
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
        className="bg-surface text-surface-contrast publish-colors max-h-[85dvh] w-full overflow-hidden rounded p-5 shadow-md"
      >
        <TabsPanel value="recent" className="flex min-h-0 flex-col">
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
            className={COLLECTION_CLASSES}
            viewportClassName={COLLECTION_VIEWPORT_CLASSES}
            emptyState={
              <Paragraph className="text-muted px-5 py-10 text-center text-sm">
                No recent protocols yet.
              </Paragraph>
            }
          >
            {(CollectionElements) => CollectionElements}
          </Collection>
        </TabsPanel>

        <TabsPanel value="templates" className="flex min-h-0 flex-col">
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
            className={COLLECTION_CLASSES}
            viewportClassName={COLLECTION_VIEWPORT_CLASSES}
          >
            {(CollectionElements) => CollectionElements}
          </Collection>
        </TabsPanel>
      </Tabs>

      <Dialog
        open={infoOpen}
        closeDialog={() => setInfoOpen(false)}
        title={info?.title ?? ''}
        size="readable"
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
    </>
  );
};
export default LibraryPanel;
