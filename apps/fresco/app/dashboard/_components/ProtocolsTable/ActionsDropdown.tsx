'use client';

import type { Row } from '@tanstack/react-table';
import { Download, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import { type DataTableFeatures } from '@codaco/fresco-ui/DataTable/features';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';
import { useToast } from '@codaco/fresco-ui/Toast';
import { DeleteProtocolsDialog } from '~/app/dashboard/protocols/_components/DeleteProtocolsDialog';
import { useDownload } from '~/hooks/useDownload';

import type { ProtocolWithInterviews } from './ProtocolsTableClient';

const messages = defineMessages({
  copyFailedToDownloadProtocolFile: {
    id: 'fresco.ProtocolsTable.ActionsDropdown.copyFailedToDownloadProtocolFile',
    defaultMessage: 'Failed to download protocol file',
    description:
      'Error message used when fetching the stored protocol file for the Download menu item fails, for example because the storage server answered with an error.',
  },
  copyDownloadingProtocol: {
    id: 'fresco.ProtocolsTable.ActionsDropdown.copyDownloadingProtocol',
    defaultMessage: 'Downloading protocol...',
    description:
      'Toast shown on the Protocols page while a protocol file is being downloaded after the researcher chose Download in the row menu.',
  },
  copyProtocolDownloaded: {
    id: 'fresco.ProtocolsTable.ActionsDropdown.copyProtocolDownloaded',
    defaultMessage: 'Protocol downloaded!',
    description:
      'Toast shown on the Protocols page after a protocol file has been downloaded from the row menu.',
  },
  openMenu: {
    id: 'fresco.ProtocolsTable.ActionsDropdown.openMenu',
    defaultMessage: 'Open menu',
    description:
      "Accessible name of the icon-only button at the end of each row of the protocols table that opens that protocol's actions menu; read only by screen readers.",
  },
  actions: {
    id: 'fresco.ProtocolsTable.ActionsDropdown.actions',
    defaultMessage: 'Actions',
    description:
      'Heading at the top of the row actions menu in the protocols table; a plural noun naming the group of menu items below it.',
  },
  failedToDownloadProtocol: {
    id: 'fresco.ProtocolsTable.ActionsDropdown.failedToDownloadProtocol',
    defaultMessage: 'Failed to download protocol.',
    description:
      'Error toast shown on the Protocols page when downloading a protocol file from the row menu failed.',
  },
  download: {
    id: 'fresco.ProtocolsTable.ActionsDropdown.download',
    defaultMessage: 'Download',
    description:
      "Menu item in the row actions menu of the protocols table that downloads the original protocol file to the researcher's computer. A verb.",
  },
});

const downloadToastMessages = {
  loading: {
    description: <AppMessage message={messages.copyDownloadingProtocol} />,
  },
  success: {
    description: <AppMessage message={messages.copyProtocolDownloaded} />,
  },
  error: {
    description: <AppMessage message={messages.failedToDownloadProtocol} />,
  },
};

export const ActionsDropdown = ({
  row,
}: {
  row: Row<DataTableFeatures, ProtocolWithInterviews>;
}) => {
  const intl = useAppIntl();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [protocolToDelete, setProtocolToDelete] =
    useState<ProtocolWithInterviews[]>();
  const { promise } = useToast();
  const download = useDownload();

  const handleDelete = (data: ProtocolWithInterviews) => {
    setProtocolToDelete([data]);
    setShowDeleteModal(true);
  };

  const handleDownload = async () => {
    const { originalFileUrl, name } = row.original;
    if (!originalFileUrl) return;

    const response = await fetch(originalFileUrl);
    if (!response.ok) {
      throw new Error(
        intl.formatMessage(messages.copyFailedToDownloadProtocolFile),
      );
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    download(blobUrl, name);
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <>
      <DeleteProtocolsDialog
        open={showDeleteModal}
        setOpen={setShowDeleteModal}
        protocolsToDelete={protocolToDelete ?? []}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <IconButton
              variant="text"
              aria-label={intl.formatMessage(messages.openMenu)}
              icon={<MoreHorizontal />}
              size="sm"
            />
          }
          nativeButton
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {intl.formatMessage(messages.actions)}
            </DropdownMenuLabel>
            {row.original.originalFileUrl && (
              <DropdownMenuItem
                onClick={() =>
                  void promise(handleDownload(), downloadToastMessages)
                }
                icon={<Download />}
              >
                {intl.formatMessage(messages.download)}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => handleDelete(row.original)}
              icon={<Trash2 />}
            >
              {intl.formatMessage(commonMessages.delete)}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
