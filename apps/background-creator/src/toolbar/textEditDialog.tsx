import type { ReactElement } from 'react';

import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { useEditorStore } from '~/state/editorStore';
import { isZoneElement } from '~/state/labels';

// Shared "edit zone label" dialog following the useDialog form pattern (see
// fileActions.tsx): open a form dialog, read the named field off the resolved
// result, apply it through the store, and announce. Only `openDialog` is needed,
// passed in from a component that owns the DialogProvider context. (Text content
// is edited in place on the canvas, not via a dialog.)
type Dialogs = Pick<DialogContextType, 'openDialog'>;

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

// Opens a small form dialog to rename a zone-marked element's label. Uniqueness
// is enforced downstream (the Properties panel's inline warning and the
// script-export gate), so this applies the edit as entered.
export async function editZoneLabelFlow(
  dialogs: Dialogs,
  elementId: string,
): Promise<void> {
  const element = useEditorStore
    .getState()
    .doc.elements.find((el) => el.id === elementId);
  if (!element || !isZoneElement(element)) return;

  const result = await dialogs.openDialog({
    type: 'form',
    title: 'Edit zone label',
    description:
      'Name the region. This label is written to each node inside the zone.',
    submitLabel: 'Save',
    children: <ZoneLabelField initialValue={element.zoneLabel ?? ''} />,
  });
  if (!result) return;

  const label =
    typeof result.label === 'string' ? result.label : (element.zoneLabel ?? '');
  useEditorStore.getState().updateElement(elementId, { zoneLabel: label });
}
