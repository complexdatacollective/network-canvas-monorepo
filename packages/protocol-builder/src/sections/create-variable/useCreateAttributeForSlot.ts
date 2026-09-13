import { useCallback, useRef, type ReactNode } from 'react';

import type { VariableOption, VariableType } from '@codaco/protocol-validation';

import { sectionIdForCodebookSubject } from '../../codebook/editing.ts';
import { useCreateCodebookVariable } from '../../codebook/useCodebookVariableEdits.ts';
import type { CreateOptionOutcome } from '../../fields/VariablePickerField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { useSubjectVariableNames } from '../canvas/codebookChoices.ts';
import { needsCodebookEditorToCreate } from '../collectableTypes.ts';
import { useCreateVariableEditor } from './useCreateVariableEditor.tsx';

export type CreateAttributeForSlotOptions = Readonly<{
  /** The type the attribute is created on. Absent while none is chosen. */
  subject: CodebookSubject | null | undefined;
  /**
   * The attribute type this slot needs. It is the only type offered, because
   * the slot cannot bind anything else — a pedigree's participant marker is a
   * boolean whatever the researcher would rather it were.
   */
  variableType: VariableType;
  /**
   * The canonical value set the interface owns, seeded and locked.
   *
   * The interview and the genetics engine branch on these exact values, so a
   * researcher may not edit them — and the schema refuses an attribute bound
   * to one of these slots whose options differ.
   */
  lockedOptions?: readonly VariableOption[];
  /** Title of the editor's dialog, already formatted. */
  title: string;
  /**
   * Rules the SLOT requires of an attribute created here, written with it.
   *
   * A quick-add box is the one place a participant's typing becomes a network
   * member, so the attribute behind it has to hold a value from the moment
   * that member exists — Architect seeds the same rule where it creates one
   * (`sections/NodeConfiguration/NodeConfiguration.tsx`). Neither create shape
   * renders the rules, so this travels as an unrendered part of what is
   * written, and the validation section beside the picker is where the
   * researcher sees it and can take it off. The escalation path hands it to
   * the editor's draft, where a kind of answer changed before the researcher
   * presses Create drops whatever the new kind does not accept, exactly as it
   * does for a rule they wrote themselves (`rulesSurvivingTypeChange`).
   */
  seedValidation?: Readonly<Record<string, unknown>>;
  onCreated(variableId: string): void;
}>;

/**
 * What a picker takes to offer this create, and the editor it may escalate to.
 *
 * The props are spread onto the picker rather than read off it one by one so
 * that a slot which cannot create right now — no type chosen, a read-only
 * stage — hands over nothing at all: the picker's own rule is that a create
 * row exists exactly where `onCreateOption` does, and a row that opened onto a
 * refusal would offer an act whose whole content is that it cannot be done.
 */
export type CreateAttributeForSlot = Readonly<{
  createProps: Readonly<{
    onCreateOption?: (variableName: string) => Promise<CreateOptionOutcome>;
    namesInUse?: readonly string[];
  }>;
  /** The escalation dialog, rendered by whoever owns the picker. */
  editor: ReactNode;
}>;

/**
 * Inventing the attribute a slot is asking for, from the name typed into that
 * slot's picker.
 *
 * Architect has two shapes of this and so does the package, because the kinds
 * of answer differ in what a name can finish. Most are finished by one: a
 * position, a flag, a box someone types into is the attribute the moment it is
 * named, and the create is one codebook write with no dialog in it. A list of
 * answers and a scale are not — the list IS its values, the scale IS the two
 * labels saying which end is which — so those escalate to the codebook's own
 * editor, seeded with the typed name and with whatever values the interface
 * owns.
 *
 * Which of the two a slot gets is asked of the type rather than passed in, so
 * a kind of answer that starts or stops needing more than a name moves every
 * slot that binds it at once. `needsCodebookEditorToCreate` is that question,
 * and it is the same one the form-fields row asks about the kind a researcher
 * has just chosen for an attribute they are inventing.
 */
export function useCreateAttributeForSlot({
  subject,
  variableType,
  lockedOptions,
  title,
  seedValidation,
  onCreated,
}: CreateAttributeForSlotOptions): CreateAttributeForSlot {
  const { readOnly } = useStageEditorForm();
  const chosenSubject = subject ?? undefined;
  const namesInUse = useSubjectVariableNames(chosenSubject);
  const createVariable = useCreateCodebookVariable(chosenSubject);
  const editorPath = useCreateVariableEditor({
    subject: subject ?? null,
    variableTypes: [variableType],
    ...(lockedOptions === undefined ? {} : { lockedOptions }),
    title,
    ...(seedValidation === undefined ? {} : { seedValidation }),
    onCreated,
  });

  /**
   * What the slot is pointed at RIGHT NOW, and whether this researcher may
   * still write to the form, for the moment a write comes back.
   *
   * A direct create is one round trip to the host, and both halves can move
   * while it is in flight — by this researcher, by a collaborator. A stage
   * repointed at another type would have the slot naming an attribute of a
   * type it has stopped collecting; a stage that has gone read-only in the
   * meantime would have the slot's form written to programmatically after it
   * stopped accepting edits. The escalation path asks the same two questions
   * of its own open editor (`useCreateVariableEditor`'s `writable`).
   */
  const liveTarget = useRef({ subject: chosenSubject, writable: !readOnly });
  liveTarget.current = { subject: chosenSubject, writable: !readOnly };

  const escalates =
    lockedOptions !== undefined || needsCodebookEditorToCreate(variableType);

  const createDirectly = useCallback(
    async (variableName: string): Promise<CreateOptionOutcome> => {
      const asked = liveTarget.current.subject;
      if (asked === undefined) return { status: 'refused' };
      const outcome = await createVariable({
        name: variableName,
        type: variableType,
        ...(seedValidation === undefined ? {} : { validation: seedValidation }),
      });
      if (outcome.status === 'refused') {
        return outcome.message === undefined
          ? { status: 'refused' }
          : { status: 'refused', message: outcome.message };
      }
      const now = liveTarget.current;
      // The codebook holds it either way; what is left is whether this slot is
      // still the one that asked for it, and whether it may still be written.
      if (
        now.subject === undefined ||
        !now.writable ||
        sectionIdForCodebookSubject(now.subject) !==
          sectionIdForCodebookSubject(asked)
      ) {
        return { status: 'unassigned' };
      }
      onCreated(outcome.variableId);
      return { status: 'created' };
    },
    [createVariable, onCreated, seedValidation, variableType],
  );

  const offered = escalates
    ? editorPath.launchable
    : !readOnly && chosenSubject !== undefined;

  return {
    createProps: offered
      ? {
          onCreateOption: escalates ? editorPath.createOption : createDirectly,
          namesInUse,
        }
      : {},
    editor: editorPath.editor,
  };
}
