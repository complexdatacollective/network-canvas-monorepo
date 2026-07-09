import { Check, Eye, Loader2, Redo, Settings, Undo, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { submit } from 'redux-form';

import type { ToolbarSegment } from '@codaco/fresco-ui/SegmentedToolbar';
import SplitButton from '@codaco/fresco-ui/SplitButton';
import { useIssuesToolbarSegment } from '~/components/Issues';
import { useAppDispatch } from '~/ducks/hooks';
import { useScopedUndoRedo } from '~/hooks/useScopedUndoRedo';
import { getProtocolName } from '~/selectors/protocol';

import { formName } from '../StageEditor/configuration';
import ActionToolbar from './ActionToolbar';
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb';
import NavShell from './NavShell';

const previewButtonClassName =
  'bg-slate-blue! text-white! hover:enabled:bg-slate-blue! hover:enabled:text-white!';

type StageEditorNavProps = {
  stageName: string;
  onCancel: () => void;
  onPreview: () => void;
  previewLabel: string;
  previewOptionsContent?: ReactNode;
  isStageInvalid: boolean;
  isOpeningPreview: boolean;
  hasUnsavedChanges: boolean;
};

const StageEditorNav = ({
  stageName,
  onCancel,
  onPreview,
  previewLabel,
  previewOptionsContent,
  isStageInvalid,
  isOpeningPreview,
  hasUnsavedChanges,
}: StageEditorNavProps) => {
  const dispatch = useAppDispatch();
  const protocolName = useSelector(getProtocolName);
  const { canUndo, canRedo, undo, redo } = useScopedUndoRedo();
  const { segment: issuesSegment, openIssues } = useIssuesToolbarSegment();
  const [previewOptionsOpen, setPreviewOptionsOpen] = useState(false);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: protocolName ?? 'Untitled protocol', onClick: onCancel },
    { label: stageName },
  ];

  const toolbarItems = useMemo<ToolbarSegment[]>(() => {
    const items: ToolbarSegment[] = [
      ...(issuesSegment ? [issuesSegment] : []),
      {
        type: 'button',
        id: 'cancel',
        label: 'Cancel',
        icon: <X />,
        showLabel: true,
        onClick: onCancel,
      },
      { type: 'separator', id: 'cancel-history-separator' },
      {
        type: 'button',
        id: 'undo',
        label: 'Undo',
        icon: <Undo />,
        disabled: !canUndo,
        onClick: undo,
      },
      {
        type: 'button',
        id: 'redo',
        label: 'Redo',
        icon: <Redo />,
        disabled: !canRedo,
        onClick: redo,
      },
    ];

    if (hasUnsavedChanges) {
      items.push({ type: 'separator', id: 'history-save-separator' });
      items.push({
        type: 'button',
        id: 'finished-editing',
        label: 'Finished Editing',
        icon: <Check />,
        showLabel: true,
        className: 'bg-sea-green text-white',
        onClick: () => {
          openIssues();
          dispatch(submit(formName));
        },
      });
    }

    items.push({ type: 'separator', id: 'preview-separator' });
    items.push({
      type: 'component',
      id: 'preview',
      component: function PreviewSplitButton({ size }) {
        return (
          <SplitButton
            className={previewButtonClassName}
            disabled={isOpeningPreview || isStageInvalid}
            icon={
              isOpeningPreview ? <Loader2 className="animate-spin" /> : <Eye />
            }
            onClick={onPreview}
            onOpenChange={setPreviewOptionsOpen}
            open={previewOptionsOpen}
            popover={{
              content: previewOptionsContent,
              side: 'top',
              align: 'end',
            }}
            segment={{
              'aria-label': 'Preview settings',
              'className': previewButtonClassName,
              'disabled': !previewOptionsContent,
              'icon': <Settings />,
            }}
            size={size}
            variant="text"
          >
            {isOpeningPreview ? previewLabel : 'Preview'}
          </SplitButton>
        );
      },
    });

    return items;
  }, [
    canRedo,
    canUndo,
    dispatch,
    hasUnsavedChanges,
    isOpeningPreview,
    isStageInvalid,
    issuesSegment,
    onCancel,
    onPreview,
    openIssues,
    previewLabel,
    previewOptionsContent,
    previewOptionsOpen,
    redo,
    undo,
  ]);

  return (
    <>
      <NavShell leading={<Breadcrumb items={breadcrumbItems} />} />
      <ActionToolbar aria-label="Stage editor actions" items={toolbarItems} />
    </>
  );
};

export default StageEditorNav;
