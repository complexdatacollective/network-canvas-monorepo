import { useCallback } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import useExternalDataDownload from '~/components/AssetBrowser/useExternalDataDownload';
import useExternalDataPreview from '~/components/AssetBrowser/useExternalDataPreview';
import { Section } from '~/components/EditorLayout';
import { useAppDispatch } from '~/ducks/hooks';
import { deleteAsset } from '~/ducks/modules/protocol/assetManifest';

import Assets from './Assets';
import NewAsset from './NewAsset';

// Props that the component accepts from outside
type AssetBrowserOwnProps = {
  type?: string | null;
  selected?: string | null;
  onSelect?: (assetId: string) => void;
  disableDelete?: boolean;
  sectionLayout: 'horizontal' | 'vertical';
};

const AssetBrowser = ({
  type = null,
  selected = null,
  onSelect,
  disableDelete = false,
  sectionLayout,
}: AssetBrowserOwnProps) => {
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
          title: 'Cannot delete resource',
          description:
            'Cannot delete this resource because it is used within your interview. Remove any uses of the resource, and try again.',
          actions: { primary: { label: 'OK', value: true } },
        });
        return;
      }

      void confirm({
        title: 'Delete Resource?',
        description:
          'Are you sure you want to delete this resource? This action cannot be undone.',
        confirmLabel: 'Delete Resource',
        cancelLabel: 'Cancel',
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
        title="Import a New Resource"
        layout={sectionLayout}
        required={false}
      >
        <NewAsset onCreate={handleCreate} type={type} />
      </Section>
      <Section title="Resource Library" layout={sectionLayout} required={false}>
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
