import { Download, Info, Loader2, Plus, Trash2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useState } from 'react';

import Badge from '~/components/Badge';
import {
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from '~/components/NewComponents/Tabs';
import Tooltip from '~/components/NewComponents/Tooltip';
import { useAppDispatch } from '~/ducks/hooks';
import { openDialog } from '~/ducks/modules/dialogs';
import { deleteLibraryProtocol } from '~/ducks/modules/userActions/userActions';
import { useProtocolLibrary } from '~/hooks/useProtocolLibrary';
import fileIcon from '~/images/file-icon.svg';
import Button, { IconButton } from '~/lib/legacy-ui/components/Button';
import { clearAllStorage, type StoredProtocolRow } from '~/utils/assetDB';
import { downloadProtocolAsNetcanvas } from '~/utils/bundleProtocol';
import { cx } from '~/utils/cva';

type Tab = 'recent' | 'templates';

const withStop =
  (handler: () => void | Promise<void>) => (event: React.MouseEvent) => {
    event.stopPropagation();
    // Handlers may be async; swallow rejections so they don't become unhandled
    // promise rejections (each handler surfaces its own user-facing errors).
    void Promise.resolve(handler()).catch((error: unknown) => {
      console.error('LibraryPanel action failed', error);
    });
  };

const formatProtocolMeta = (protocol: StoredProtocolRow): string => {
  const stageCount = protocol.protocol.stages.length;
  const stages = `${stageCount} ${stageCount === 1 ? 'stage' : 'stages'}`;
  const updated = DateTime.fromMillis(protocol.updatedAt);
  const secondsAgo = -updated.diffNow('seconds').seconds;
  const edited = secondsAgo < 60 ? '< 1 min ago' : updated.toRelative();
  return edited ? `${stages} · edited ${edited}` : stages;
};

type PanelRowProps = {
  name: string;
  description?: string;
  downloading?: boolean;
  actionLabel?: string;
  onOpen: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
};

const PanelRow = ({
  name,
  description,
  downloading = false,
  actionLabel,
  onOpen,
  onDownload,
  onDelete,
}: PanelRowProps) => {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Ignore keys on the inner action buttons so they don't also open the row.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="group focusable hover:bg-surface-2 flex w-full cursor-pointer items-center gap-(--space-sm) rounded-sm px-(--space-md) py-(--space-sm) text-left transition-colors"
    >
      <img
        src={fileIcon}
        alt=""
        aria-hidden
        className="size-10 shrink-0 object-contain"
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{name}</span>
        {description && (
          <span className="text-muted-foreground block truncate text-sm">
            {description}
          </span>
        )}
      </span>

      {(onDownload || onDelete || actionLabel) && (
        <span
          className={cx(
            'flex shrink-0 items-center gap-(--space-xs) transition-all duration-200 ease-out',
            downloading
              ? 'translate-x-0 opacity-100'
              : 'translate-x-2 opacity-0 group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100',
          )}
        >
          {actionLabel && (
            <Button
              variant="text"
              size="small"
              icon={<Plus />}
              content={actionLabel}
              className="text-action"
              onClick={withStop(onOpen)}
            />
          )}
          {onDownload && (
            <IconButton
              variant="text"
              aria-label={
                downloading ? `Downloading ${name}` : `Download ${name}`
              }
              disabled={downloading}
              onClick={withStop(onDownload)}
              icon={
                downloading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Download />
                )
              }
            />
          )}
          {onDelete && (
            <IconButton
              variant="text"
              aria-label={`Delete ${name}`}
              onClick={withStop(onDelete)}
              icon={<Trash2 />}
            />
          )}
        </span>
      )}
    </div>
  );
};

type LibraryPanelProps = {
  // Open a saved protocol from the library.
  onOpenProtocol: (id: string) => void;
  // Open the bundled sample protocol.
  onOpenSample: () => void;
  // Open the development protocol (shown as a template in dev mode only).
  onOpenDevProtocol: () => void;
};

const PANEL_CLASSES =
  'h-[min(13rem,50dvh)] overflow-y-auto px-(--space-sm) pt-(--space-sm) pb-(--space-xl)';

const LibraryPanel = ({
  onOpenProtocol,
  onOpenSample,
  onOpenDevProtocol,
}: LibraryPanelProps) => {
  const dispatch = useAppDispatch();
  const { protocols, isLoaded } = useProtocolLibrary();
  // null until the user picks a tab; the default is chosen once the library has
  // loaded (Templates when there are no recents, Recent otherwise).
  const [tab, setTab] = useState<Tab | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (tab === null && isLoaded) {
      setTab(protocols.length === 0 ? 'templates' : 'recent');
    }
  }, [tab, isLoaded, protocols.length]);

  const loadedDefault: Tab = protocols.length === 0 ? 'templates' : 'recent';
  const activeTab = tab ?? (isLoaded ? loadedDefault : null);

  const handleDownload = useCallback(
    async (protocol: StoredProtocolRow) => {
      setDownloadingIds((prev) => new Set(prev).add(protocol.id));
      try {
        await downloadProtocolAsNetcanvas(
          protocol.protocol,
          protocol.name,
          protocol.id,
        );
      } catch (error) {
        // Surface bundling/download failures instead of letting the promise
        // reject unhandled with no feedback. Not awaited so the spinner clears
        // immediately rather than waiting for the user to dismiss the dialog.
        void dispatch(
          openDialog({
            type: 'Error',
            title: 'Download failed',
            message: `"${protocol.name}" could not be downloaded.`,
            error: error instanceof Error ? error : String(error),
          }),
        );
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(protocol.id);
          return next;
        });
      }
    },
    [dispatch],
  );

  const handleDelete = useCallback(
    async (protocol: StoredProtocolRow) => {
      const confirmed = await dispatch(
        openDialog({
          type: 'Warning',
          title: 'Delete protocol?',
          message: `"${protocol.name}" and its assets will be permanently removed from this device. This cannot be undone.`,
          confirmLabel: 'Delete',
          cancelLabel: 'Cancel',
          canCancel: true,
        }),
      ).unwrap();

      if (!confirmed) {
        return;
      }

      try {
        await dispatch(deleteLibraryProtocol(protocol.id)).unwrap();
      } catch (error) {
        void dispatch(
          openDialog({
            type: 'Error',
            title: 'Delete failed',
            message: `"${protocol.name}" could not be deleted.`,
            error: error instanceof Error ? error : String(error),
          }),
        );
      }
    },
    [dispatch],
  );

  const handleClearAll = useCallback(async () => {
    const confirmed = await dispatch(
      openDialog({
        type: 'Warning',
        title: 'Remove all data?',
        message:
          'Every protocol, asset, and saved setting stored in this browser will be permanently removed. This cannot be undone.',
        confirmLabel: 'Remove all',
        cancelLabel: 'Cancel',
        canCancel: true,
      }),
    ).unwrap();

    if (!confirmed) {
      return;
    }

    try {
      // Wipes storage and reloads the app from a clean slate.
      await clearAllStorage();
    } catch (error) {
      void dispatch(
        openDialog({
          type: 'Error',
          title: 'Could not remove data',
          message: 'The stored data could not be removed from this browser.',
          error: error instanceof Error ? error : String(error),
        }),
      );
    }
  }, [dispatch]);

  const templateCount = import.meta.env.DEV ? 2 : 1;
  const templateLabel = `${templateCount} ${templateCount === 1 ? 'template' : 'templates'}`;
  const protocolCount = protocols.length;
  const storageTooltip =
    protocolCount === 1
      ? 'Your 1 protocol is saved only in this browser, on this device. It is never uploaded to a server.'
      : `Your ${protocolCount} protocols are saved only in this browser, on this device. They are never uploaded to a server.`;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (value === 'recent' || value === 'templates') {
          setTab(value);
        }
      }}
      className="bg-surface-1 text-surface-1-foreground flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded shadow-md"
    >
      <div className="flex shrink-0 items-center px-(--space-lg) py-(--space-md)">
        <TabsList>
          <TabsTab value="recent">Recent</TabsTab>
          <TabsTab value="templates">Templates</TabsTab>
        </TabsList>
        {activeTab === 'recent' ? (
          <div className="ml-auto flex items-center gap-(--space-sm)">
            <Badge color="platinum" className="shadow-none">
              {protocolCount} {protocolCount === 1 ? 'protocol' : 'protocols'}
            </Badge>
            <Tooltip content={storageTooltip} side="bottom">
              <Info
                className="text-muted-foreground size-5"
                aria-label="Where your protocols are stored"
              />
            </Tooltip>
            <Tooltip
              content="Clear all protocols from this browser"
              side="bottom"
            >
              <button
                type="button"
                aria-label="Clear all protocols from this browser"
                onClick={() => void handleClearAll()}
                className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                <Trash2 className="size-5" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <Badge color="platinum" className="ml-auto shadow-none">
            {templateLabel}
          </Badge>
        )}
      </div>

      <TabsPanel value="recent" className={PANEL_CLASSES}>
        {protocols.length === 0 ? (
          <p className="text-muted-foreground px-(--space-md) py-(--space-xl) text-center text-sm">
            No recent protocols yet.
          </p>
        ) : (
          protocols.map((protocol) => (
            <PanelRow
              key={protocol.id}
              name={protocol.name}
              description={formatProtocolMeta(protocol)}
              downloading={downloadingIds.has(protocol.id)}
              onOpen={() => onOpenProtocol(protocol.id)}
              onDownload={() => handleDownload(protocol)}
              onDelete={() => handleDelete(protocol)}
            />
          ))
        )}
      </TabsPanel>

      <TabsPanel value="templates" className={PANEL_CLASSES}>
        <PanelRow
          name="Sample Protocol"
          description="First time? Explore a sample protocol"
          actionLabel="Use this template"
          onOpen={onOpenSample}
        />
        {import.meta.env.DEV && (
          <PanelRow
            name="Development Protocol"
            description="Includes examples of every stage type"
            actionLabel="Use this template"
            onOpen={onOpenDevProtocol}
          />
        )}
      </TabsPanel>
    </Tabs>
  );
};

export default LibraryPanel;
