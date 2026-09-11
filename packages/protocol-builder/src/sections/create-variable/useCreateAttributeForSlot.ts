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
  onCreated,
}: CreateAttributeForSlotOptions): CreateAttributeForSlot {
  const { readOnly } = useStageEditorForm();
  const chosenSubject = subject ?? undefined;
  const namesInUse = useSubjectVariableNames(chosenSubject);
  const createVariable = useCreateCodebookVariable(chosenSubject);
  const editorPath = useCreateVariableEditor({
    subject: subject ?? null,
    variableType,
    ...(lockedOptions === undefined ? {} : { lockedOptions }),
    title,
    onCreated,
  });

  /**
   * The type the slot is pointed at RIGHT NOW, for the moment a write comes
   * back.
   *
   * A direct create is one round trip to the host, and the stage can be
   * repointed at another type while it is in flight — by this researcher, by a
   * collaborator. Bound anyway, the slot would name an attribute of a type it
   * has stopped collecting. The escalation path asks the same question of its
   * own open editor.
   */
  const liveSubject = useRef(chosenSubject);
  liveSubject.current = chosenSubject;

  const escalates =
    lockedOptions !== undefined || needsCodebookEditorToCreate(variableType);

  const createDirectly = useCallback(
    async (variableName: string): Promise<CreateOptionOutcome> => {
      const asked = liveSubject.current;
      if (asked === undefined) return { status: 'refused' };
      const outcome = await createVariable({
        name: variableName,
        type: variableType,
      });
      if (outcome.status === 'refused') {
        return outcome.message === undefined
          ? { status: 'refused' }
          : { status: 'refused', message: outcome.message };
      }
      const now = liveSubject.current;
      // The codebook holds it either way; what is left is whether this slot is
      // still the one that asked for it.
      if (
        now === undefined ||
        sectionIdForCodebookSubject(now) !== sectionIdForCodebookSubject(asked)
      ) {
        return { status: 'unassigned' };
      }
      onCreated(outcome.variableId);
      return { status: 'created' };
    },
    [createVariable, onCreated, variableType],
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
