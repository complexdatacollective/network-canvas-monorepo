import { createElement, useCallback } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';
import useExternalDataDownload from '~/components/AssetBrowser/useExternalDataDownload';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
import { useAppDispatch } from '~/ducks/hooks';
import { deleteAsset } from '~/ducks/modules/protocol/assetManifest';

import Assets from './Assets';
import NewAsset from './NewAsset';
const messages = defineMessages({
  cannotDeleteResource: {
    id: 'architect.assetBrowser.assetBrowser.cannotDeleteResource',
    defaultMessage: 'Cannot delete resource',
    description: 'The title text in components / AssetBrowser / AssetBrowser.',
  },
  cannotDeleteThisResourceBecauseIt: {
    id: 'architect.assetBrowser.assetBrowser.cannotDeleteThisResourceBecauseIt',
    defaultMessage:
      'Cannot delete this resource because it is used within your interview. Remove any uses of the resource, and try again.',
    description:
      'The description text in components / AssetBrowser / AssetBrowser.',
  },
  oK: {
    id: 'architect.assetBrowser.assetBrowser.oK',
    defaultMessage: 'OK',
    description: 'The label text in components / AssetBrowser / AssetBrowser.',
  },
  deleteResource: {
    id: 'architect.assetBrowser.assetBrowser.deleteResource',
    defaultMessage: 'Delete Resource?',
    description: 'The title text in components / AssetBrowser / AssetBrowser.',
  },
  areYouSureYouWantTo: {
    id: 'architect.assetBrowser.assetBrowser.areYouSureYouWantTo',
    defaultMessage:
      'Are you sure you want to delete this resource? You can restore it with Undo while this protocol remains open.',
    description:
      'The description text in components / AssetBrowser / AssetBrowser.',
  },
  deleteResourcea742f: {
    id: 'architect.assetBrowser.assetBrowser.deleteResourcea742f',
    defaultMessage: 'Delete Resource',
    description:
      'The confirmLabel text in components / AssetBrowser / AssetBrowser.',
  },
  importResource: {
    id: 'architect.assetBrowser.assetBrowser.importResource',
    defaultMessage: 'Import resource',
    description: 'The title text in components / AssetBrowser / AssetBrowser.',
  },
  addANewResourceToThis: {
    id: 'architect.assetBrowser.assetBrowser.addANewResourceToThis',
    defaultMessage: 'Add a new resource to this protocol.',
    description:
      'The description text in components / AssetBrowser / AssetBrowser.',
  },
  resourceLibrary: {
    id: 'architect.assetBrowser.assetBrowser.resourceLibrary',
    defaultMessage: 'Resource library',
    description: 'The title text in components / AssetBrowser / AssetBrowser.',
  },
  browseAndManageResourcesStoredIn: {
    id: 'architect.assetBrowser.assetBrowser.browseAndManageResourcesStoredIn',
    defaultMessage: 'Browse and manage resources stored in this protocol.',
    description:
      'The description text in components / AssetBrowser / AssetBrowser.',
  },
});

// Props that the component accepts from outside
type AssetBrowserOwnProps = {
  type?: string | null;
  selected?: string | null;
  onSelect?: (assetId: string) => void;
  disableDelete?: boolean;
};

const AssetBrowser = ({
  type = null,
  selected = null,
  onSelect,
  disableDelete = false,
}: AssetBrowserOwnProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { confirm, openDialog } = useDialog();

  const handleCreate = useCallback(
    (assetIds: string[]) => {
      if (assetIds.length !== 1) {
        return;
      } // if multiple files were uploaded
      if (!assetIds[0]) {
        return;
      } // if a single invalid file was uploaded
      onSelect?.(assetIds[0]);
    },
    [onSelect],
  );

  const [preview, handleShowPreview] = useExternalDataPreview();
  const handleDownload = useExternalDataDownload();
  const handleDelete = useCallback(
    (assetId: string, isUsed = false) => {
      if (isUsed) {
        void openDialog({
          type: 'acknowledge',
          intent: 'info',
          title: createElement(AppMessage, {
            message: messages.cannotDeleteResource,
          }),
          description: createElement(AppMessage, {
            message: messages.cannotDeleteThisResourceBecauseIt,
          }),
          actions: {
            primary: {
              label: createElement(AppMessage, { message: messages.oK }),
              value: true,
            },
          },
        });
        return;
      }

      void confirm({
        title: createElement(AppMessage, { message: messages.deleteResource }),
        description: createElement(AppMessage, {
          message: messages.areYouSureYouWantTo,
        }),
        confirmLabel: createElement(AppMessage, {
          message: messages.deleteResourcea742f,
        }),
        cancelLabel: createElement(AppMessage, {
          message: commonMessages.cancel,
        }),
        intent: 'destructive',
        onConfirm: () => {
          dispatch(deleteAsset(assetId));
        },
      });
    },
    [confirm, dispatch, openDialog],
  );

  return (
    <>
      <Section
        title={intl.formatMessage(messages.importResource)}
        description={intl.formatMessage(messages.addANewResourceToThis)}
      >
        <NewAsset onCreate={handleCreate} type={type} />
      </Section>
      <Section
        title={intl.formatMessage(messages.resourceLibrary)}
        description={intl.formatMessage(
          messages.browseAndManageResourcesStoredIn,
        )}
      >
        <Assets
          onSelect={onSelect}
          onPreview={handleShowPreview}
          onDownload={handleDownload}
          onDelete={handleDelete}
          disableDelete={disableDelete}
          selected={selected}
          type={type}
        />
      </Section>
      {preview}
    </>
  );
};

export default AssetBrowser;
