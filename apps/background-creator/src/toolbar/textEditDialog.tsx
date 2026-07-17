import type { ReactElement } from 'react';

import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import TextAreaField from '@codaco/fresco-ui/form/fields/TextArea';
import { useEditorStore } from '~/state/editorStore';

import { linesToText, textToLines } from './textLines';

// Shared "edit label" dialogs following the useDialog form pattern (see
// fileActions.tsx): open a form dialog, read the named field off the resolved
// result, apply it through the store, and announce. Only `openDialog` is needed,
// passed in from a component that owns the DialogProvider context.
type Dialogs = Pick<DialogContextType, 'openDialog'>;

function TextContentField({
  initialValue,
}: {
  initialValue: string;
}): ReactElement {
  return (
    <Field
      name="content"
      label="Text"
      hint="Each line becomes its own line of the label."
      component={TextAreaField}
      rows={3}
      initialValue={initialValue}
      autoFocus
    />
  );
}

// Opens the shared "Edit text" dialog for a text element and writes the edited
// content back. No-ops if the id no longer resolves to a text element (e.g. it
// was deleted while the dialog was open).
export async function editTextElementFlow(
  dialogs: Dialogs,
  elementId: string,
): Promise<void> {
  const element = useEditorStore
    .getState()
    .doc.elements.find((el) => el.id === elementId);
  if (!element || element.kind !== 'text') return;

  const result = await dialogs.openDialog({
    type: 'form',
    title: 'Edit text',
    description: 'Update the text shown on the background.',
    submitLabel: 'Save',
    children: <TextContentField initialValue={linesToText(element.lines)} />,
  });
  if (!result) return;

  const content = typeof result.content === 'string' ? result.content : '';
  const store = useEditorStore.getState();
  // `textToLines` always yields ≥ 1 element, satisfying the model's line minimum.
  store.updateElement(elementId, { lines: textToLines(content) });
  store.announce('Text updated');
}

function ZoneLabelField({
  initialValue,
}: {
  initialValue: string;
}): ReactElement {
  return (
    <Field
      name="label"
      label="Label"
      hint="Becomes a value of the assigned variable, so it must be unique across zones."
      component={InputField}
      initialValue={initialValue}
      autoFocus
    />
  );
}

// Opens a small form dialog to rename a zone. Uniqueness is enforced downstream
// (the Properties panel's inline warning and the script-export gate), so this
// applies the edit as entered.
export async function editZoneLabelFlow(
  dialogs: Dialogs,
  zoneId: string,
): Promise<void> {
  const zone = useEditorStore.getState().doc.zones.find((z) => z.id === zoneId);
  if (!zone) return;

  const result = await dialogs.openDialog({
    type: 'form',
    title: 'Edit zone label',
    description:
      'Name the region. This label is written to each node inside the zone.',
    submitLabel: 'Save',
    children: <ZoneLabelField initialValue={zone.label} />,
  });
  if (!result) return;

  const label = typeof result.label === 'string' ? result.label : zone.label;
  const store = useEditorStore.getState();
  store.updateZone(zoneId, { label });
  store.announce('Zone label updated');
}
