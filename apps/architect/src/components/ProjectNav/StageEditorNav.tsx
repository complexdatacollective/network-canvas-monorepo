import { Check, Eye, Loader2, Settings, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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
import { useStageDraft } from '~/components/StageEditor/stageDraftBeacon';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
import { getProtocolName } from '~/selectors/protocol';

import { useActionToolbar } from './ActionToolbar';
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb';
import NavShell from './NavShell';
const chromeMessages = defineMessages({
  untitledProtocol: {
    id: 'architect.chrome.projectNav.stageEditorNav.untitledProtocol',
    defaultMessage: 'Untitled protocol',
    description: 'The label text in components / ProjectNav / StageEditorNav.',
  },
});
const messages = defineMessages({
  finishedEditing: {
    id: 'architect.projectNav.stageEditorNav.finishedEditing',
    defaultMessage: 'Finished Editing',
    description: 'Visible text in components / ProjectNav / StageEditorNav.',
  },
  stageEditorActions: {
    id: 'architect.projectNav.stageEditorNav.stageEditorActions',
    defaultMessage: 'Stage editor actions',
    description:
      "The 'aria-label' text in components / ProjectNav / StageEditorNav.",
  },
  editingActions: {
    id: 'architect.projectNav.stageEditorNav.editingActions',
    defaultMessage: 'Editing actions',
    description:
      'The aria-label text in components / ProjectNav / StageEditorNav.',
  },
  previewActions: {
    id: 'architect.projectNav.stageEditorNav.previewActions',
    defaultMessage: 'Preview actions',
    description:
      'The aria-label text in components / ProjectNav / StageEditorNav.',
  },
  preview: {
    id: 'architect.projectNav.stageEditorNav.preview',
    defaultMessage: 'Preview',
    description: 'Visible text in components / ProjectNav / StageEditorNav.',
  },
  previewSettings: {
    id: 'architect.projectNav.stageEditorNav.previewSettings',
    defaultMessage: 'Preview settings',
    description:
      'The aria-label text in components / ProjectNav / StageEditorNav.',
  },
});

const previewButtonClassName =
  'bg-slate-blue! text-white! ui-enabled:hover:bg-slate-blue! ui-enabled:hover:text-white!';

type StageEditorNavProps = {
  stageName: string;
  onCancel: () => void;
};

/**
 * The stage editor's own header: where the researcher is, and the way back.
 *
 * Rendered above the editor rather than in its action slot, because it is a
 * sticky bar at the top of the page and the slot sits at the foot of the form.
 * The toolbar below is the other half of this chrome, and it does sit in the
 * slot — it has to be inside the stage form to submit it.
 */
const StageEditorNav = ({ stageName, onCancel }: StageEditorNavProps) => {
  const intl = useAppIntl();
  const protocolName = useSelector(getProtocolName);

  const breadcrumbItems: BreadcrumbItem[] = [
    {
      label:
        protocolName ?? intl.formatMessage(chromeMessages.untitledProtocol),
      onClick: onCancel,
    },
    { label: stageName },
  ];

  return <NavShell leading={<Breadcrumb items={breadcrumbItems} />} />;
};

/**
 * "Finished Editing" submits the stage form. The gating is the browser's:
 * `useForm` validates every registered field and only calls `onSubmit` when
 * they all pass. Opening the issues panel here covers a repeat attempt, where
 * the error set is unchanged so the auto-open effect does not re-fire.
 */
type FinishedEditingControlProps = {
  formId: string;
  openIssues: () => void;
  isSubmitting: boolean;
  canCommit: boolean;
  ref?: ToolbarButtonProps['ref'];
};

const FinishedEditingControl = defineToolbarChild(
  function FinishedEditingControl({
    formId,
    openIssues,
    isSubmitting,
    canCommit,
    ref,
  }: FinishedEditingControlProps) {
    const intl = useAppIntl();
    return (
      <ToolbarButton
        ref={ref}
        form={formId}
        type="submit"
        variant="default"
        color="primary"
        icon={isSubmitting ? <Loader2 className="animate-spin" /> : <Check />}
        className="bg-sea-green rounded-full text-white"
        disabled={!canCommit || isSubmitting}
        aria-busy={isSubmitting}
        onClick={openIssues}
      >
        {intl.formatMessage(messages.finishedEditing)}
      </ToolbarButton>
    );
  },
);

export type StageEditorToolbarProps = Readonly<{
  /** The DOM id of the stage form this toolbar's save control submits. */
  formId: string;
  /** Whether the editor opened on a stage this tab may not write. */
  readOnly: boolean;
  onCancel: () => void;
  onPreview: () => void;
  previewLabel: string;
  previewOptionsContent?: ReactNode;
  isStageInvalid: boolean;
  isOpeningPreview: boolean;
}>;

/**
 * The stage editor's actions, published to the protocol toolbar.
 *
 * Rendered inside the editor's action slot, which is inside the stage form: the
 * save control is a `<button form={formId} type="submit">` and the issues
 * panel lists that form's own field errors, so neither can be assembled from
 * outside it.
 */
export const StageEditorToolbar = ({
  formId,
  readOnly,
  onCancel,
  onPreview,
  previewLabel,
  previewOptionsContent,
  isStageInvalid,
  isOpeningPreview,
}: StageEditorToolbarProps) => {
  const intl = useAppIntl();
  const { control: issuesControl, openIssues } = useIssuesToolbarControl();
  const [previewOptionsOpen, setPreviewOptionsOpen] = useState(false);
  const isSubmitting = useFormStore((state) => state.isSubmitting);
  const hasUnsavedChanges = useStageDraft((beacon) => beacon.dirty);
  // A tab demoted while it was in the stage editor keeps that editor (see
  // ProtocolRouteGuard) so the draft is not thrown away, but it must not be
  // able to commit: this is the one action that claims to make work durable,
  // and the library write behind it would be dropped. `readOnly` is the same
  // answer given by the host at the moment the stage was opened, which is what
  // a tab that was already demoted then gets.
  // ProtocolLockBanner sits directly above and names the ways forward.
  const accessMode = useProtocolAccessMode();
  const canCommit = !readOnly && accessMode === 'editable';

  const toolbarProps = useMemo(
    () => ({
      'aria-label': intl.formatMessage(messages.stageEditorActions),
      'children': [
        issuesControl,
        issuesControl ? <ToolbarSeparator key="issues-separator" /> : null,
        <ToolbarGroup
          key="stage-editing"
          aria-label={intl.formatMessage(messages.editingActions)}
        >
          <ToolbarButton icon={<X />} onClick={onCancel}>
            {intl.formatMessage(commonMessages.cancel)}
          </ToolbarButton>
          {hasUnsavedChanges ? (
            <FinishedEditingControl
              key="finished-editing"
              formId={formId}
              openIssues={openIssues}
              isSubmitting={isSubmitting}
              canCommit={canCommit}
            />
          ) : null}
        </ToolbarGroup>,
        <ToolbarSeparator key="stage-preview-separator" />,
        <ToolbarGroup
          key="stage-preview"
          aria-label={intl.formatMessage(messages.previewActions)}
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
            {isOpeningPreview
              ? previewLabel
              : intl.formatMessage(messages.preview)}
          </ToolbarButton>
          <ToolbarPopover
            open={previewOptionsOpen}
            onOpenChange={setPreviewOptionsOpen}
            contentProps={{ side: 'top', align: 'end' }}
            trigger={
              <ToolbarIconButton
                aria-label={intl.formatMessage(messages.previewSettings)}
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
      formId,
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
      intl,
    ],
  );

  useActionToolbar(toolbarProps);

  return null;
};

export default StageEditorNav;
