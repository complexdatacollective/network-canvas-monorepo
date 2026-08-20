import { Check, Eye, Loader2, Settings, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import {
  defineToolbarChild,
  ToolbarButton,
  ToolbarGroup,
  ToolbarIconButton,
  ToolbarPopover,
  ToolbarSeparator,
  type ToolbarButtonProps,
} from '@codaco/fresco-ui/SegmentedToolbar';
import { useIssuesToolbarControl } from '~/components/Issues';
import { STAGE_FORM_ID } from '~/components/StageEditor/StageForm';
import { useStageDraftHistory } from '~/components/StageEditor/useStageDraftHistory';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
import { getProtocolName } from '~/selectors/protocol';

import { useActionToolbar } from './ActionToolbar';
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb';
import { HistoryToolbarControls } from './historyToolbarItems';
import NavShell from './NavShell';

const previewButtonClassName =
  'bg-slate-blue! text-white! ui-enabled:hover:bg-slate-blue! ui-enabled:hover:text-white!';

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

/**
 * "Finished Editing" submits the stage form. The gating is the browser's:
 * `useForm` validates every registered field and only calls `onSubmit` when
 * they all pass — identical to the explicit `submit()` dispatch this replaces.
 * Opening the issues panel here covers a repeat attempt, where `submitFailed`
 * and the error set are unchanged so the auto-open effect does not re-fire.
 */
type FinishedEditingControlProps = {
  openIssues: () => void;
  isSubmitting: boolean;
  canCommit: boolean;
  ref?: ToolbarButtonProps['ref'];
};

const FinishedEditingControl = defineToolbarChild(
  function FinishedEditingControl({
    openIssues,
    isSubmitting,
    canCommit,
    ref,
  }: FinishedEditingControlProps) {
    return (
      <ToolbarButton
        ref={ref}
        form={STAGE_FORM_ID}
        type="submit"
        variant="default"
        color="primary"
        icon={isSubmitting ? <Loader2 className="animate-spin" /> : <Check />}
        className="bg-sea-green rounded-full text-white"
        disabled={!canCommit || isSubmitting}
        aria-busy={isSubmitting}
        onClick={openIssues}
      >
        Finished Editing
      </ToolbarButton>
    );
  },
);

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
  const protocolName = useSelector(getProtocolName);
  const { canUndo, canRedo, undo, redo } = useStageDraftHistory();
  const { control: issuesControl, openIssues } = useIssuesToolbarControl();
  const [previewOptionsOpen, setPreviewOptionsOpen] = useState(false);
  const isSubmitting = useFormStore((state) => state.isSubmitting);
  // A tab demoted while it was in the stage editor keeps that editor (see
  // ProtocolRouteGuard) so the draft is not thrown away, but it must not be
  // able to commit: this is the one action that claims to make work durable,
  // and the library write behind it would be dropped.
  // ProtocolLockBanner sits directly above and names the ways forward.
  const canCommit = useProtocolAccessMode() === 'editable';

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: protocolName ?? 'Untitled protocol', onClick: onCancel },
    { label: stageName },
  ];

  const showHistoryActions = canUndo || canRedo;

  const toolbarProps = useMemo(
    () => ({
      'aria-label': 'Stage editor actions',
      'leadingActions': showHistoryActions ? (
        <HistoryToolbarControls
          key="history-controls"
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
        />
      ) : undefined,
      'children': [
        issuesControl,
        issuesControl ? <ToolbarSeparator key="issues-separator" /> : null,
        <ToolbarGroup key="stage-editing" aria-label="Editing actions">
          <ToolbarButton icon={<X />} onClick={onCancel}>
            Cancel
          </ToolbarButton>
          {hasUnsavedChanges ? (
            <FinishedEditingControl
              key="finished-editing"
              openIssues={openIssues}
              isSubmitting={isSubmitting}
              canCommit={canCommit}
            />
          ) : null}
        </ToolbarGroup>,
        <ToolbarSeparator key="stage-preview-separator" />,
        <ToolbarGroup
          key="stage-preview"
          aria-label="Preview actions"
          className="gap-[0.16em]"
        >
          <ToolbarButton
            className={`${previewButtonClassName} relative rounded-r-none! focus-visible:z-10`}
            disabled={isOpeningPreview || isStageInvalid}
            icon={
              isOpeningPreview ? <Loader2 className="animate-spin" /> : <Eye />
            }
            onClick={onPreview}
          >
            {isOpeningPreview ? previewLabel : 'Preview'}
          </ToolbarButton>
          <ToolbarPopover
            open={previewOptionsOpen}
            onOpenChange={setPreviewOptionsOpen}
            contentProps={{ side: 'top', align: 'end' }}
            trigger={
              <ToolbarIconButton
                aria-label="Preview settings"
                className={`${previewButtonClassName} relative rounded-l-none! focus-visible:z-10 [&>.lucide]:-translate-x-0.5`}
                disabled={!previewOptionsContent}
                icon={<Settings />}
              />
            }
          >
            {previewOptionsContent}
          </ToolbarPopover>
        </ToolbarGroup>,
      ],
    }),
    [
      canCommit,
      canRedo,
      canUndo,
      hasUnsavedChanges,
      isOpeningPreview,
      isStageInvalid,
      isSubmitting,
      issuesControl,
      onCancel,
      onPreview,
      openIssues,
      previewLabel,
      previewOptionsContent,
      previewOptionsOpen,
      redo,
      showHistoryActions,
      undo,
    ],
  );

  useActionToolbar(toolbarProps);

  return <NavShell leading={<Breadcrumb items={breadcrumbItems} />} />;
};

export default StageEditorNav;
