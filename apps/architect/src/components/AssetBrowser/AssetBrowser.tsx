import { createElement, useCallback, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';
import { warnAboutDuplicateRows } from '~/components/AssetBrowser/duplicateRowsWarning';
import useExternalDataDownload from '~/components/AssetBrowser/useExternalDataDownload';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
import { getAccepts } from '~/components/Form/AutoFileDrop';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  deleteAsset,
  importAssetAsync,
} from '~/ducks/modules/protocol/assetManifest';
import { getAssetManifest } from '~/selectors/protocol';

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
  couldNotAddTheFile: {
    id: 'architect.assetBrowser.assetBrowser.couldNotAddTheFile',
    defaultMessage: 'Could not add the file',
    description: 'The title text in components / AssetBrowser / AssetBrowser.',
  },
  chooseTheMissingFile: {
    id: 'architect.assetBrowser.assetBrowser.chooseTheMissingFile',
    defaultMessage: 'Choose the missing file for this resource',
    description:
      'The aria-label text in components / AssetBrowser / AssetBrowser.',
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
  const assetManifest = useAppSelector(getAssetManifest);

  // Supplying a file for a resource the archive did not contain. The picker is
  // one hidden input reused by every card, holding the id it was opened for:
  // the alternative is an input per card, most of which can never be used.
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [replacingAssetId, setReplacingAssetId] = useState<string | null>(null);
  const replacingAsset = replacingAssetId
    ? assetManifest[replacingAssetId]
    : undefined;

  const handleReplace = useCallback((assetId: string) => {
    setReplacingAssetId(assetId);
    // The input's `accept` is derived from the asset being replaced, so it has
    // to be rendered with that id before the picker opens.
    queueMicrotask(() => replaceInputRef.current?.click());
  }, []);

  const handleReplaceFileChosen = useCallback(
    async (file: File | undefined) => {
      const assetId = replacingAssetId;
      const asset = assetId ? assetManifest[assetId] : undefined;
      setReplacingAssetId(null);
      if (!file || !assetId || !asset || asset.type === 'apikey') {
        return;
      }

      try {
        // Keeps the manifest key, so every stage already pointing at this
        // resource keeps working, and keeps the researcher's own name for it
        // rather than adopting the replacement file's.
        const repaired = await dispatch(
          importAssetAsync({
            file,
            name: asset.name,
            replaceAssetId: assetId,
            expectedType: asset.type,
          }),
        ).unwrap();

        // The same warning the drop zone gives, for the same reason: Fresco
        // drops duplicate rows when it runs the roster. Repairing one is the
        // case where staying silent costs most, because the resource being
        // repaired is already in use by the interview.
        warnAboutDuplicateRows(openDialog, {
          fileName: file.name,
          duplicateCount: repaired.duplicateCount,
        });
      } catch (error) {
        const description =
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message: unknown }).message)
            : intl.formatMessage(messages.cannotDeleteThisResourceBecauseIt);
        void openDialog({
          type: 'acknowledge',
          intent: 'destructive',
          title: createElement(AppMessage, {
            message: messages.couldNotAddTheFile,
          }),
          description,
          actions: {
            primary: {
              label: createElement(AppMessage, { message: messages.oK }),
              value: true,
            },
          },
        });
      }
    },
    [assetManifest, dispatch, intl, openDialog, replacingAssetId],
  );

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
          onReplace={handleReplace}
          disableDelete={disableDelete}
          selected={selected}
          type={type}
        />
      </Section>
      <input
        ref={replaceInputRef}
        type="file"
        hidden
        aria-label={intl.formatMessage(messages.chooseTheMissingFile)}
        accept={
          replacingAsset && replacingAsset.type !== 'apikey'
            ? getAccepts(replacingAsset.type).join(',')
            : undefined
        }
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same file twice still fires a change.
          event.target.value = '';
          void handleReplaceFileChosen(file);
        }}
      />
      {preview}
    </>
  );
};

export default AssetBrowser;
