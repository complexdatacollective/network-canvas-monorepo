import Button from '@codaco/fresco-ui/Button';
import type { VariableOption, VariableType } from '@codaco/protocol-validation';

import type { CodebookSubject } from '../../protocol-context.ts';
import { useCreateVariableEditor } from './useCreateVariableEditor.tsx';

export type CreateVariableButtonProps = Readonly<{
  /** The type the attribute is created on. `null` while none is chosen. */
  subject: CodebookSubject | null;
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
  /**
   * Visible text and accessible name of the control, already formatted.
   *
   * Every caller names its own attribute — "a new participant identifier
   * attribute", "a new disease attribute" — from a descriptor declared in its
   * own family's messages file, and formats it there. A string arrives here
   * rather than a descriptor because this control renders it immediately and
   * hands nothing on: there is no later reader for a descriptor to be resolved
   * for, and the extraction guard sees the caller's declaration either way.
   */
  label: string;
  onCreated(variableId: string): void;
}>;

/**
 * Opens the codebook's attribute editor from beside a slot, seeded with
 * nothing, and hands the attribute it creates back to that slot.
 *
 * The editor and the write are `useCreateVariableEditor`'s; this is the
 * control that reaches them from a section. The same editor is reached from
 * inside the attribute picker, on the name a researcher has typed into its
 * search box — which is the same act asked from closer to the question.
 */
export default function CreateVariableButton({
  subject,
  variableType,
  lockedOptions,
  label,
  onCreated,
}: CreateVariableButtonProps) {
  const { launchable, createOption, editor } = useCreateVariableEditor({
    subject,
    variableType,
    ...(lockedOptions === undefined ? {} : { lockedOptions }),
    title: label,
    onCreated,
  });

  return (
    <>
      {launchable && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          // Opened on an empty name: this control asks for an attribute
          // without one having been typed anywhere, and the editor's own name
          // box is where the researcher gives it one.
          onClick={() => void createOption('')}
        >
          {label}
        </Button>
      )}
      {editor}
    </>
  );
}
