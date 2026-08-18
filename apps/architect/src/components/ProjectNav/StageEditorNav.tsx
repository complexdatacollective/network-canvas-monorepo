import { Check, Eye, Loader2, Redo, Settings, Undo, X } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useSelector } from 'react-redux';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type {
  ComponentSegmentRenderProps,
  ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';
import SplitButton from '@codaco/fresco-ui/SplitButton';
import { useIssuesToolbarSegment } from '~/components/Issues';
import { STAGE_FORM_ID } from '~/components/StageEditor/StageForm';
import { useStageDraftHistory } from '~/components/StageEditor/useStageDraftHistory';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
import { getProtocolName } from '~/selectors/protocol';

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

type PreviewSplitButtonContextValue = Pick<
  StageEditorNavProps,
  | 'onPreview'
  | 'previewLabel'
  | 'previewOptionsContent'
  | 'isStageInvalid'
  | 'isOpeningPreview'
> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const PreviewSplitButtonContext =
  createContext<PreviewSplitButtonContextValue | null>(null);

function PreviewSplitButtonSegment({ size }: ComponentSegmentRenderProps) {
  const preview = useContext(PreviewSplitButtonContext);

  if (!preview) {
    throw new Error(
      'PreviewSplitButtonSegment must be rendered within PreviewSplitButtonContext.',
    );
  }

  return (
    <SplitButton
      className={previewButtonClassName}
      disabled={preview.isOpeningPreview || preview.isStageInvalid}
      icon={
        preview.isOpeningPreview ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Eye />
        )
      }
      onClick={preview.onPreview}
      onOpenChange={preview.onOpenChange}
      open={preview.open}
      popover={{
        content: preview.previewOptionsContent,
        side: 'top',
        align: 'end',
      }}
      segment={{
        'aria-label': 'Preview settings',
        'className': previewButtonClassName,
        'disabled': !preview.previewOptionsContent,
        'icon': <Settings />,
      }}
      size={size}
      variant="text"
    >
      {preview.isOpeningPreview ? preview.previewLabel : 'Preview'}
    </SplitButton>
  );
}

// `useIssuesToolbarSegment` owns the popover's open state, so the submit
// segment has to be handed the same instance's opener rather than calling the
// hook again (which would give it a second, unconnected popover state).
const OpenIssuesContext = createContext<(() => void) | null>(null);

/**
 * "Finished Editing" submits the stage form. The gating is the browser's:
 * `useForm` validates every registered field and only calls `onSubmit` when
 * they all pass — identical to the explicit `submit()` dispatch this replaces.
 * Opening the issues panel here covers a repeat attempt, where `submitFailed`
 * and the error set are unchanged so the auto-open effect does not re-fire.
 */
function FinishedEditingSegment({ size }: ComponentSegmentRenderProps) {
  const openIssues = useContext(OpenIssuesContext);
  // A tab demoted while it was in the stage editor keeps that editor (see
  // ProtocolRouteGuard) so the draft is not thrown away, but it must not be
  // able to commit: this is the one action that claims to make work durable,
  // and the library write behind it would be dropped.
  // ProtocolLockBanner sits directly above and names the ways forward.
  const canCommit = useProtocolAccessMode() === 'editable';

  if (!openIssues) {
    throw new Error(
      'FinishedEditingSegment must be rendered within OpenIssuesContext.',
    );
  }

  return (
    <SubmitButton
      form={STAGE_FORM_ID}
      size={size}
      variant="default"
      icon={<Check />}
      className="bg-sea-green rounded-full text-white"
      // Spread rather than `disabled={!canCommit}`: SubmitButton sets its own
      // `disabled={isSubmitting}` BEFORE spreading props, so passing the prop
      // unconditionally would hand `false` back during an in-flight submit and
      // re-open the double-submit that guard exists to stop.
      {...(canCommit ? {} : { disabled: true })}
      onClick={openIssues}
    >
      Finished Editing
    </SubmitButton>
  );
}

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
  const { segment: issuesSegment, openIssues } = useIssuesToolbarSegment();
  const [previewOptionsOpen, setPreviewOptionsOpen] = useState(false);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: protocolName ?? 'Untitled protocol', onClick: onCancel },
    { label: stageName },
  ];

  const previewSplitButtonContextValue =
    useMemo<PreviewSplitButtonContextValue>(
      () => ({
        onPreview,
        previewLabel,
        previewOptionsContent,
        isStageInvalid,
        isOpeningPreview,
        open: previewOptionsOpen,
        onOpenChange: setPreviewOptionsOpen,
      }),
      [
        isOpeningPreview,
        isStageInvalid,
        onPreview,
        previewLabel,
        previewOptionsContent,
        previewOptionsOpen,
      ],
    );

  const toolbarItems = useMemo<ToolbarSegment[]>(() => {
    const items: ToolbarSegment[] = [
      ...(issuesSegment ? [issuesSegment] : []),
      ...(issuesSegment
        ? [{ type: 'separator' as const, id: 'issues-history-separator' }]
        : []),
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
      { type: 'separator', id: 'history-actions-separator' },
      {
        type: 'button',
        id: 'cancel',
        label: 'Cancel',
        icon: <X />,
        showLabel: true,
        onClick: onCancel,
      },
    ];

    if (hasUnsavedChanges) {
      items.push({
        type: 'component',
        id: 'finished-editing',
        component: FinishedEditingSegment,
      });
    }

    items.push({ type: 'separator', id: 'preview-separator' });
    items.push({
      type: 'component',
      id: 'preview',
      component: PreviewSplitButtonSegment,
    });

    return items;
  }, [
    canRedo,
    canUndo,
    hasUnsavedChanges,
    issuesSegment,
    onCancel,
    redo,
    undo,
  ]);

  return (
    <>
      <NavShell leading={<Breadcrumb items={breadcrumbItems} />} />
      <OpenIssuesContext.Provider value={openIssues}>
        <PreviewSplitButtonContext.Provider
          value={previewSplitButtonContextValue}
        >
          <ActionToolbar
            aria-label="Stage editor actions"
            items={toolbarItems}
          />
        </PreviewSplitButtonContext.Provider>
      </OpenIssuesContext.Provider>
    </>
  );
};

export default StageEditorNav;
