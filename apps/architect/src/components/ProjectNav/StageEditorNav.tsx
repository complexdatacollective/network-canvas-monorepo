import { Check, Eye, Loader2, Redo, Settings, Undo, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { submit } from 'redux-form';

import type { ToolbarSegment } from '@codaco/fresco-ui/SegmentedToolbar';
import { useIssuesToolbarSegment } from '~/components/Issues';
import { useAppDispatch } from '~/ducks/hooks';
import { useScopedUndoRedo } from '~/hooks/useScopedUndoRedo';
import { getProtocolName } from '~/selectors/protocol';

import { formName } from '../StageEditor/configuration';
import ActionToolbar from './ActionToolbar';
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb';
import NavShell from './NavShell';

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
      { type: 'separator', id: 'history-preview-separator' },
    ];

    if (hasUnsavedChanges) {
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

    items.push({
      type: 'button',
      id: 'preview',
      label: isOpeningPreview ? previewLabel : 'Preview',
      icon: isOpeningPreview ? <Loader2 className="animate-spin" /> : <Eye />,
      showLabel: true,
      className: 'bg-slate-blue text-white',
      disabled: isOpeningPreview || isStageInvalid,
      onClick: onPreview,
    });

    if (previewOptionsContent) {
      items.push({
        type: 'popover',
        id: 'preview-options',
        label: 'Preview options',
        icon: <Settings />,
        open: previewOptionsOpen,
        onOpenChange: setPreviewOptionsOpen,
        side: 'top',
        children: previewOptionsContent,
      });
    }

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
