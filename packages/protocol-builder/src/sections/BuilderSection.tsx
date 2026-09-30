import { type ReactNode, useCallback, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import {
  useDiscardStageValues,
  useStageHasAnyValue,
} from '../form/stageFormHooks.ts';
import { useOutlineSection } from '../form/useOutlineSection.ts';
import { useOnResearcherChange } from './researcherChange.ts';

/**
 * An optional capability the researcher switches on and off.
 *
 * Switching it off throws its values away — that is what "this stage does not
 * do this" means to the protocol schema, which has no way to say "configured
 * but disabled". Because the loss is real, it is confirmed first, in the
 * capability's own words; and because it is a decision rather than a way of
 * hiding something, it reaches the document rather than only the panel.
 */
export type SectionCapability = Readonly<{
  /**
   * The draft paths this capability owns. Any of them holding a value means
   * the capability is already on, so a stage that arrives configured opens
   * with the section expanded.
   */
  fields: readonly string[];
  /**
   * Descriptors rather than strings, because the section that owns the
   * capability owns its words: a string handed in here is invisible to
   * extraction, absent from the catalogs and untranslatable, so the one place
   * a researcher is warned what they are about to lose would be the one place
   * that stayed English.
   *
   * Formatted with no values, like every named descriptor a shared section
   * takes: one carrying a placeholder renders the pattern on screen, and
   * nothing in the types can refuse it. See `PromptsSection`'s own note and
   * `sections/__tests__/namedDescriptorProps.test.tsx`.
   */
  confirmClear: Readonly<{
    title: MessageDescriptor;
    description: MessageDescriptor;
    confirmLabel: MessageDescriptor;
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
   * The stage path holding the thing this capability's values only mean
   * anything against — a roster's data file, say, at `dataSource`.
   *
   * When the value there changes, the capability is switched off and
   * everything it owns is cleared — without asking, because the values did not
   * become wrong through anything the researcher did to this section: a roster
   * stage's card details name columns of a data file, and a different file has
   * different columns. Leaving them would put a stage half-describing the old
   * file into the protocol, which the schema accepts and the interview renders
   * as an empty card.
   *
   * Switching the capability OFF as well as clearing it is what stops the
   * section standing open over a capability that now holds nothing: the switch
   * and the outline would both say it is configured, and the researcher would
   * have to close it themselves to find out it is not.
   *
   * A PATH rather than the value itself, because the clear cannot travel
   * without it. The value at that path belongs to another section's ordinary
   * field, which waits for the submit that flushes it — so a clear sent alone
   * reaches a live-applying host as "these settings are gone" while the host
   * still holds the file they described, which is a stage nobody authored. The
   * path is what lets this section put the cause in the same batch as the
   * clear; see `useDiscardStageValues`. Naming the path also means the value is
   * read from the form rather than assembled by the caller, so there is no
   * longer any way to hand this a new object on every render.
   *
   * The path a single FIELD owns, whatever shape its value is: a subject is
   * `{entity, type}` and one control writes it whole. Not the container above
   * a group of fields — the form assembles one of those out of whichever of
   * them have registered so far, so its value moves as the section mounts and
   * the reset would fire on a stage nobody has touched.
   *
   * Spelled with keys and no list positions, because the cause reaches the
   * session as a command and a command addresses keys only. A path with an
   * index in it is refused where it is read (`useDiscardStageValues`) rather
   * than quietly dropped: a dropped cause is a clear travelling on its own,
   * which is the outcome this prop exists to prevent.
   */
  resetOn?: string;
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
  resetOn,
  children,
}: BuilderSectionProps) {
  const { readOnly } = useStageEditorForm();
  const intl = useAppIntl();
  const { confirm } = useDialog();
  const discardStageValues = useDiscardStageValues();
  const configured = useStageHasAnyValue(capability?.fields ?? NO_FIELDS);
  const [switchedOn, setSwitchedOn] = useState(configured);
  // Holding a value is itself proof the capability is on, which is what keeps
  // this mirror of Fresco's Section in step with it rather than drifting.
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
          title:
            capability === undefined
              ? ''
              : intl.formatMessage(capability.confirmClear.title),
          description:
            capability === undefined
              ? ''
              : intl.formatMessage(capability.confirmClear.description),
          confirmLabel:
            capability === undefined
              ? ''
              : intl.formatMessage(capability.confirmClear.confirmLabel),
          cancelLabel: intl.formatMessage(commonMessages.cancel),
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
      // One call for all of them, so the whole capability leaves the document
      // at once rather than a path at a time.
      //
      // A refused write — the editor made read-only while the confirmation was
      // open — has thrown nothing away, so the panel stays open over the values
      // it still holds and the switch stays where the researcher left it.
      // Saying so is `applyOwnCommands`'s job, and it has already done it in
      // the form's own error region.
      if (!discardStageValues(capability?.fields ?? NO_FIELDS)) return false;
      setSwitchedOn(false);
      return true;
    },
    [capability, configured, confirm, discardStageValues, intl],
  );

  // Only on the RESEARCHER changing it — `useOnResearcherChange` is what tells
  // that apart from the value moving for some other reason, which arrives
  // carrying the configuration that belongs to it.
  //
  // The clear carries the value that caused it, so the document never holds one
  // without the other. See `resetOn` and `useDiscardStageValues`.
  //
  // The panel is remounted rather than closed, because its open state is its
  // own: a caller can seed it through `defaultOpen` but has no way to close it.
  // By the time the new key renders, the clear above has already made
  // `defaultOpen` false.
  const [resetGeneration, setResetGeneration] = useState(0);
  useOnResearcherChange(resetOn, (value) => {
    if (resetOn === undefined) return;
    // Refused the same way, and for the same reason: a reset that was not taken
    // has thrown nothing away, and closing the capability over values it still
    // holds would describe a stage nobody chose.
    const discarded = discardStageValues(capability?.fields ?? NO_FIELDS, {
      path: resetOn,
      value,
    });
    if (!discarded) return;
    setSwitchedOn(false);
    setResetGeneration((generation) => generation + 1);
  });

  const body = children;

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
