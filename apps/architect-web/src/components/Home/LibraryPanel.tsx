import { Download, Loader2, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import Badge from '~/components/Badge';
import {
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from '~/components/NewComponents/Tabs';
import { useAppDispatch } from '~/ducks/hooks';
import { openDialog } from '~/ducks/modules/dialogs';
import { deleteLibraryProtocol } from '~/ducks/modules/userActions/userActions';
import { useProtocolLibrary } from '~/hooks/useProtocolLibrary';
import fileIcon from '~/images/file-icon.svg';
import { IconButton } from '~/lib/legacy-ui/components/Button';
import { type StoredProtocolRow } from '~/utils/assetDB';
import { downloadProtocolAsNetcanvas } from '~/utils/bundleProtocol';
import { cx } from '~/utils/cva';

type Tab = 'recent' | 'templates';

const withStop = (handler: () => void) => (event: React.MouseEvent) => {
  event.stopPropagation();
  handler();
};

type PanelRowProps = {
  name: string;
  description?: string;
  downloading?: boolean;
  onOpen: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
};

const PanelRow = ({
  name,
  description,
  downloading = false,
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

      {(onDownload || onDelete) && (
        <span
          className={cx(
            'flex shrink-0 items-center gap-(--space-xs) transition-opacity',
            downloading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
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

// Fixed-height scroll area shared by both tab panels.
const PANEL_CLASSES =
  'h-52 overflow-y-auto px-(--space-sm) pt-(--space-sm) pb-(--space-xl)';

const LibraryPanel = ({
  onOpenProtocol,
  onOpenSample,
  onOpenDevProtocol,
}: LibraryPanelProps) => {
  const dispatch = useAppDispatch();
  const protocols = useProtocolLibrary();
  const [tab, setTab] = useState<Tab>('recent');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = useCallback(async (protocol: StoredProtocolRow) => {
    setDownloadingId(protocol.id);
    try {
      await downloadProtocolAsNetcanvas(
        protocol.protocol,
        protocol.name,
        protocol.id,
      );
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const handleDelete = useCallback(
    async (protocol: StoredProtocolRow) => {
      const confirmed = await dispatch(
        openDialog({
          type: 'Confirm',
          title: 'Delete protocol?',
          message: `"${protocol.name}" and its assets will be permanently removed from this device. This cannot be undone.`,
          confirmLabel: 'Delete',
          cancelLabel: 'Cancel',
          canCancel: true,
        }),
      ).unwrap();

      if (confirmed) {
        await dispatch(deleteLibraryProtocol(protocol.id));
      }
    },
    [dispatch],
  );

  const templateCount = import.meta.env.DEV ? 2 : 1;
  const count =
    tab === 'recent'
      ? `${protocols.length} ${protocols.length === 1 ? 'protocol' : 'protocols'}`
      : `${templateCount} ${templateCount === 1 ? 'template' : 'templates'}`;

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (value === 'recent' || value === 'templates') {
          setTab(value);
        }
      }}
      className="bg-surface-1 text-surface-1-foreground w-full max-w-xl overflow-hidden rounded shadow-md"
    >
      <div className="flex items-center px-(--space-lg) py-(--space-md)">
        <TabsList>
          <TabsTab value="recent">Recent</TabsTab>
          <TabsTab value="templates">Templates</TabsTab>
        </TabsList>
        <Badge color="platinum" className="ml-auto shadow-none">
          {count}
        </Badge>
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
              description={protocol.description}
              downloading={downloadingId === protocol.id}
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
          description="This is a demonstration protocol designed to illustrate the features of the Network Canvas Interviewer app."
          onOpen={onOpenSample}
        />
        {import.meta.env.DEV && (
          <PanelRow
            name="Development Protocol"
            description="Includes examples of every stage type."
            onOpen={onOpenDevProtocol}
          />
        )}
      </TabsPanel>
    </Tabs>
  );
};

export default LibraryPanel;
