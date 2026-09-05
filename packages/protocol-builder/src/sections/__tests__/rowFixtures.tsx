import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import type { RowPreviewProps } from '../rowRenderers.tsx';

/**
 * A stand-in for one family's prompt fields.
 *
 * Deliberately plain: what these tests are about is the list around the row —
 * its identity, its ordering, its rule that a stage must ask something — and a
 * row editor that did anything clever would make a failure ambiguous between
 * the shared machinery and the family's own fields.
 *
 * The controls are ordinary connected fields, because the row dialog mounts a
 * form store of its own. A `ProtocolField` here would register the row's cells
 * with the STAGE's outline, which is exactly what the array primitives exist to
 * avoid: a deleted row's dormant value resurrecting itself on save.
 */
export function TestPromptEditor() {
  return (
    <>
      <Field
        name="text"
        label="Prompt text"
        component={InputField}
        required="Enter the question this prompt asks."
      />
      <Field
        name="negativeLabel"
        label="Negative label"
        component={InputField}
      />
    </>
  );
}

export function TestPromptPreview({ item }: RowPreviewProps) {
  return (
    <span>{typeof item.text === 'string' ? item.text : 'Empty prompt'}</span>
  );
}

/**
 * The same stand-in, for a page's content blocks.
 *
 * The block's own `type` is a field like any other, because what a block CAN
 * be is the interface's business rather than the section's: a real Information
 * editor offers text and media here, and a media block needs a resource
 * picker.
 */
export function TestItemEditor() {
  return (
    <>
      <Field
        name="type"
        label="Block type"
        component={InputField}
        initialValue="text"
      />
      <Field
        name="content"
        label="Block text"
        component={InputField}
        required="Enter the text this block shows."
      />
    </>
  );
}

export function TestItemPreview({ item }: RowPreviewProps) {
  return (
    <span>
      {typeof item.content === 'string' ? item.content : 'Empty block'}
    </span>
  );
}
