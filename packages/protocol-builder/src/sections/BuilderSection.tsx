import { isEqual } from 'es-toolkit/compat';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';

import {
  SectionScopeContext,
  useStageEditorForm,
} from '../form/stageEditorContext.ts';
import {
  useDiscardStageValues,
  useFormRestoreVersion,
  useStageHasAnyValue,
} from '../form/stageFormHooks.ts';
import { useOutlineSection } from '../form/useOutlineSection.ts';

/**
 * An optional capability the researcher switches on and off.
 *
 * Switching it off throws its values away — that is what "this stage does not
 * do this" means to the protocol schema, which has no way to say "configured
 * but disabled". Because the loss is real, it is confirmed first, in the
 * capability's own words; and because it is a decision rather than a way of
 * hiding something, it reaches the draft as an edit that travels with the
 * session's other batches and comes back with its undo.
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
  /**
   * Something the capability's values only mean anything against. Compared by
   * value, so a caller may build it inline.
   *
   * When it changes, the capability is switched off and everything it owns is
   * cleared — without asking, because the values did not become wrong through
   * anything the researcher did to this section: a roster stage's card details
   * name columns of a data file, and a different file has different columns.
   * Leaving them would put a stage half-describing the old file into the
   * protocol, which the schema accepts and the interview renders as an empty
   * card.
   *
   * Switching the capability OFF as well as clearing it is what stops the
   * section standing open over a capability that now holds nothing: the switch
   * and the outline would both say it is configured, and the researcher would
   * have to close it themselves to find out it is not.
   */
  resetOn?: unknown;
  children: ReactNode;
}>;

const NO_FIELDS: readonly string[] = Object.freeze([]);

/**
 * Keeps the researcher's switch in step with a draft that was replaced beneath
 * it.
 *
 * The switch records a decision the researcher made, and nothing about the
 * form's own editing should disturb it — emptying the last field inside an
 * open capability is not switching it off. An authoritative arrival is the one
 * exception: a replacement, an undo, a rollback after a lost lease can take
 * every value a capability owns away, or bring a whole capability in, and a
 * decision made about the draft that is gone no longer describes anything. The
 * section's own panel is already reset from the same signal (Fresco's
 * `Section` reapplies `defaultOpen` on a restore), so without this the outline
 * would go on calling a capability available while the panel it lives in has
 * closed itself over nothing.
 *
 * Only a capability whose OWN content changed across the arrival is touched:
 * an arrival elsewhere in the stage says nothing about this capability, and
 * must not undo a switch the researcher has just thrown.
 *
 * Adjusted during render rather than in an effect so the outline never commits
 * a frame describing the draft that has just been replaced.
 */
function useSwitchFollowsTheDraft(
  configured: boolean,
  setSwitchedOn: (value: boolean) => void,
): void {
  const restoreVersion = useFormRestoreVersion();
  const previous = useRef({ restoreVersion, configured });

  if (
    previous.current.restoreVersion !== restoreVersion &&
    previous.current.configured !== configured
  ) {
    setSwitchedOn(configured);
  }
  previous.current = { restoreVersion, configured };
}

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
  resetOn,
  children,
}: BuilderSectionProps) {
  const { readOnly } = useStageEditorForm();
  const { confirm } = useDialog();
  const discardStageValues = useDiscardStageValues();
  const configured = useStageHasAnyValue(capability?.fields ?? NO_FIELDS);
  const [switchedOn, setSwitchedOn] = useState(configured);
  useSwitchFollowsTheDraft(configured, setSwitchedOn);
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
    // The prerequisite is asked about first. A section waiting on a choice the
    // researcher has not made cannot be switched on at all, so saying it is
    // switched off would explain the wrong thing — and would explain it
    // differently depending only on whether the section already held content.
    disabled
      ? 'unavailable'
      : capability !== undefined && !enabled
        ? 'switchedOff'
        : 'available',
  );

  const requestOpenChange = useCallback(
    async (open: boolean) => {
      if (open) {
        setSwitchedOn(true);
        return true;
      }

      // Asked only when there is something to lose, but cleared either way.
      // A field can hold a value that is present without being an answer —
      // whitespace, an empty list, a container of blanks — and if it is parked
      // behind a collapsed group the panel's own discard never reaches it, so
      // it would be replayed into a capability the editor says is off.
      if (configured) {
        const confirmed = await confirm({
          title: capability?.confirmClear.title ?? '',
          description: capability?.confirmClear.description ?? '',
          confirmLabel: capability?.confirmClear.confirmLabel ?? '',
          cancelLabel: 'Cancel',
          intent: 'warning',
          onConfirm: () => undefined,
        });
        if (confirmed !== true) return false;
      }

      // Every path the capability owns is thrown away here rather than left to
      // the panel's unmount. A field already parked by a collapsed group of
      // advanced options does not unmount again when the capability closes
      // around it, so its value would survive — and go on making the
      // capability look configured, and be written back on save.
      //
      // One call for all of them, so the whole capability leaves the draft as a
      // single edit: one entry in the session's history, so an undo brings the
      // capability back whole rather than a path at a time.
      discardStageValues(capability?.fields ?? NO_FIELDS);
      setSwitchedOn(false);
      return true;
    },
    [capability, configured, confirm, discardStageValues],
  );

  // Only on a CHANGE, and a change of VALUE. The first render is a stage being
  // opened on what it was saved with, and resetting there would empty a
  // section the researcher has not touched. Compared structurally for the same
  // reason: what a section resets on is usually an object — a subject, a chosen
  // resource — and a caller that builds it inline hands a new one on every
  // render, so comparing references would empty the section on any re-render
  // at all.
  //
  // The panel is remounted rather than closed, because its open state is its
  // own: a caller can seed it through `defaultOpen` but has no way to close it.
  // By the time the new key renders, the clear above has already made
  // `defaultOpen` false.
  const [resetGeneration, setResetGeneration] = useState(0);
  const previousResetOn = useRef(resetOn);
  useEffect(() => {
    const before = previousResetOn.current;
    previousResetOn.current = resetOn;
    if (isEqual(before, resetOn)) return;
    discardStageValues(capability?.fields ?? NO_FIELDS);
    setSwitchedOn(false);
    setResetGeneration((generation) => generation + 1);
  }, [capability, discardStageValues, resetOn]);

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
      key={resetGeneration}
      id={sectionId}
      title={title}
      description={description}
      disabled={isDisabled}
      toggleable
      /**
       * `Section` reads this when it mounts, and again whenever the form is
       * restored from an authoritative draft. Both times the question is the
       * same one the outline answers — is this capability on — so it is
       * answered with the same value. Reading `configured` alone would close a
       * capability the researcher had switched on and not yet filled in,
       * every time anything else in the stage moved.
       */
      defaultOpen={enabled}
      onOpenChange={requestOpenChange}
    >
      {body}
    </Section>
  );
}
