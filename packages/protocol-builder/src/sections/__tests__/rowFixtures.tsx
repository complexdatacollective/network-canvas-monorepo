import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';

import type { DialogArrayItemSelector } from '../../form/arrayFields/DialogArrayField.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import type { RowEditorProps, RowPreviewProps } from '../rowRenderers.tsx';

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
export function TestPromptEditor({ item, editIndex, form }: RowEditorProps) {
  return (
    <>
      {/* The three things the row dialog promises a family's fields, put on
          screen so a test can read them back. A row editor that could not see
          which row it was editing, or which form its own controls belong to,
          would be a contract nothing observes. */}
      <dl>
        <dt>Editing row</dt>
        <dd>{editIndex === undefined ? 'a new row' : String(editIndex)}</dd>
        <dt>Row keys</dt>
        <dd>{Object.keys(item).toSorted().join(', ')}</dd>
        <dt>Editor form</dt>
        <dd>{form}</dd>
      </dl>
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
    <span>
      {typeof item.text === 'string' ? item.text : 'Empty prompt'}
      {/* The list's own presentation flag is not part of the row, so a
          preview that can see it is being handed something the stage document
          does not hold. */}
      {Object.hasOwn(item, 'sortable') ? ' [sortable leaked]' : ''}
    </span>
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

/**
 * A family's row editor with a defect in it.
 *
 * The shared list field mounts fields this package did not write, so one of
 * them throwing is a real failure mode rather than a hypothetical — a picker
 * reading a codebook variable that has been deleted, say. What the tests using
 * this are about is what the researcher is left with when it happens.
 */
export function ExplodingRowEditor(): never {
  throw new Error('The row editor could not be rendered.');
}

/**
 * The editor slot each block type keeps its draft in.
 *
 * A stand-in for the per-type slots Architect's content grid uses, and for the
 * same reason: a saved block has ONE `content` key whose meaning depends on
 * its `type` — prose for text, a resource id otherwise. Edited through a
 * single control, changing the type has to destroy the value, and until it
 * does the incoming type's control is showing the outgoing type's value: a
 * resource id sitting in a rich text editor, one save away from becoming what
 * a participant reads.
 */
const CONTENT_SLOTS = Object.freeze({
  text: 'contentText',
  asset: 'contentAsset',
});

const isRow = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A page block that can be prose or a resource, with a slot for each.
 *
 * Only the chosen type's control is mounted; the other's draft is parked in
 * the dialog store, so switching back and forth loses nothing and no value
 * ever reaches a control that cannot mean it.
 */
export function TestMediaItemEditor({ item }: RowEditorProps) {
  // The row's own type until the control has registered, and the control's
  // afterwards: a field's value reaches the store in an effect, so reading
  // only the store would draw the wrong slot for one render.
  const registered = useFormStore((state) => state.fields.get('type')?.value);
  const type = registered ?? item.type;

  return (
    <>
      <DialogFormField name="type" label="Block type" component={InputField} />
      {/* Optional in the schema, so its absence has to be spelled by the key
          not being there rather than by an empty string. */}
      <DialogFormField
        name="description"
        label="Block description"
        component={InputField}
      />
      {type === 'asset' ? (
        <DialogFormField
          name={CONTENT_SLOTS.asset}
          label="Resource"
          component={InputField}
        />
      ) : (
        <DialogFormField
          name={CONTENT_SLOTS.text}
          label="Block text"
          component={InputField}
        />
      )}
    </>
  );
}

export function TestMediaItemPreview({ item }: RowPreviewProps) {
  return (
    <span>
      {typeof item.content === 'string' ? item.content : 'Empty block'}
    </span>
  );
}

/** Expands a saved block's one `content` key into the slot its type names. */
export const expandMediaItem: DialogArrayItemSelector = (
  _context,
  { item },
) => {
  const slot = item.type === 'text' ? CONTENT_SLOTS.text : CONTENT_SLOTS.asset;
  return { ...item, [slot]: item.content };
};

/**
 * Collapses the chosen slot back into `content`, and drops every slot key.
 *
 * By the slot list rather than by the active type, so a draft the researcher
 * typed and then switched away from cannot ride along: both saved block
 * schemas are strict objects, and a surviving slot key does not merely take up
 * space — it makes the protocol invalid.
 */
export function collapseMediaItem(value: unknown): unknown {
  if (!isRow(value)) return value;

  const collapsed: Record<string, unknown> = { ...value };
  const chosen =
    value.type === 'text' ? CONTENT_SLOTS.text : CONTENT_SLOTS.asset;
  for (const slot of Object.values(CONTENT_SLOTS)) delete collapsed[slot];

  const draft = value[chosen];
  if (typeof draft === 'string') collapsed.content = draft;
  return collapsed;
}
