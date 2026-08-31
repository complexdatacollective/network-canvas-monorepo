import { type ReactNode, useCallback, useState } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';

import {
  SectionScopeContext,
  useStageEditorForm,
} from '../form/stageEditorContext.ts';
import {
  useSetStageValue,
  useStageHasAnyValue,
} from '../form/stageFormHooks.ts';
import { useOutlineSection } from '../form/useOutlineSection.ts';

/**
 * An optional capability the researcher switches on and off.
 *
 * Switching it off throws its values away — that is what "this stage does not
 * do this" means to the protocol schema, which has no way to say "configured
 * but disabled". Because the loss is real, it is confirmed first, in the
 * capability's own words.
 */
export type SectionCapability = Readonly<{
  /**
   * The draft paths this capability owns. Any of them holding a value means
   * the capability is already on, so a stage that arrives configured opens
   * with the section expanded.
   */
  fields: readonly string[];
  confirmClear: Readonly<{
    title: string;
    description: string;
    confirmLabel: string;
  }>;
}>;

export type BuilderSectionProps = Readonly<{
  title: string;
  description?: ReactNode;
  /**
   * The section is shown but cannot be edited — something it depends on has
   * not been chosen yet. Distinct from a capability being switched off, which
   * is the researcher's decision rather than the stage's state.
   */
  disabled?: boolean;
  capability?: SectionCapability;
  children: ReactNode;
}>;

const NO_FIELDS: readonly string[] = Object.freeze([]);

/**
 * One semantic section of a stage editor.
 *
 * Sections know what they are for, not where their values live: everything
 * they need reaches them through the editor's own context, so the same
 * section composes into any stage type and into any host.
 *
 * Registering with the outline is the reason this wraps Fresco's `Section`
 * rather than sections using it directly — the outline is built from the
 * sections and fields actually mounted, so it can never list a section the
 * editor is not showing.
 */
export default function BuilderSection({
  title,
  description,
  disabled = false,
  capability,
  children,
}: BuilderSectionProps) {
  const { readOnly } = useStageEditorForm();
  const { confirm } = useDialog();
  const setStageValue = useSetStageValue();
  const configured = useStageHasAnyValue(capability?.fields ?? NO_FIELDS);
  const [switchedOn, setSwitchedOn] = useState(configured);
  // Holding a value is itself proof the capability is on, so an undo that
  // restores what a switch-off cleared reopens the section — which is exactly
  // what Fresco's Section does with the same fact — without this mirror
  // drifting out of step with it.
  const enabled = switchedOn || configured;
  const isDisabled = disabled || readOnly;
  // A read-only session is deliberately absent here. Nothing can be edited in
  // one, but every section still has real progress worth reporting, and
  // saying "switched off" against all of them would tell a spectator the
  // opposite of what is true.
  const { sectionId } = useOutlineSection(
    title,
    capability !== undefined && !enabled
      ? 'switchedOff'
      : disabled
        ? 'unavailable'
        : 'available',
  );

  const requestOpenChange = useCallback(
    async (open: boolean) => {
      if (open || !configured) {
        setSwitchedOn(open);
        return true;
      }

      const confirmed = await confirm({
        title: capability?.confirmClear.title ?? '',
        description: capability?.confirmClear.description ?? '',
        confirmLabel: capability?.confirmClear.confirmLabel ?? '',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => undefined,
      });
      if (confirmed !== true) return false;

      // Every path the capability owns is cleared here rather than left to the
      // panel's unmount. A field already parked by a collapsed group of
      // advanced options does not unmount again when the capability closes
      // around it, so its value would survive — and go on making the
      // capability look configured, and be written back on save.
      for (const path of capability?.fields ?? NO_FIELDS) {
        setStageValue(path, undefined);
      }
      setSwitchedOn(false);
      return true;
    },
    [capability, configured, confirm, setStageValue],
  );

  const body = (
    <SectionScopeContext value={sectionId}>{children}</SectionScopeContext>
  );

  if (capability === undefined) {
    return (
      <Section
        id={sectionId}
        title={title}
        description={description}
        disabled={isDisabled}
      >
        {body}
      </Section>
    );
  }

  return (
    <Section
      id={sectionId}
      title={title}
      description={description}
      disabled={isDisabled}
      toggleable
      defaultOpen={configured}
      onOpenChange={requestOpenChange}
    >
      {body}
    </Section>
  );
}
