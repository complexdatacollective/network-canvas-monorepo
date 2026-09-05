import { type ComponentType, useMemo } from 'react';

/** One row of a list a section owns, as the stage document holds it. */
export type RowValues = Record<string, unknown>;

/** What the row dialog hands the fields a family renders inside it. */
export type RowEditorProps = Readonly<{
  /** The row being edited, whole. */
  item: RowValues;
  /** Its index in the committed list; absent for a row being added. */
  editIndex?: number;
  /** DOM id of the dialog's own form, for a control rendered outside it. */
  form: string;
}>;

export type RowEditorComponent = ComponentType<RowEditorProps>;

/** What a collapsed row hands the preview a family renders for it. */
export type RowPreviewProps = Readonly<{ item: RowValues }>;

export type RowPreviewComponent = ComponentType<RowPreviewProps>;

/** The untyped renderer contract `DialogArrayField` mounts. */
type Renderer = ComponentType<Record<string, unknown>>;

/**
 * Adapts a family's typed row editor and preview to the renderers the shared
 * list field mounts.
 *
 * The list field spreads a row's own properties as props, because it knows
 * nothing about what any row contains — which makes the renderer contract an
 * open record, and would make every family's component either an open record
 * too or a cast at each of its call sites. Adapting once, here, keeps the
 * families' components saying what they actually take.
 *
 * Memoised because the list field mounts these directly: a new component
 * identity on every render would remount the row, and the open dialog with it,
 * on every keystroke.
 */
export function useRowRenderers(
  Editor: RowEditorComponent,
  Preview: RowPreviewComponent,
): Readonly<{ editorFieldsComponent: Renderer; previewComponent: Renderer }> {
  return useMemo(
    () => ({
      editorFieldsComponent: function RowEditorFields(
        props: Record<string, unknown>,
      ) {
        const editIndex = props.editIndex;
        return (
          <Editor
            item={rowOf(props.item)}
            form={typeof props.form === 'string' ? props.form : ''}
            {...(typeof editIndex === 'number' ? { editIndex } : {})}
          />
        );
      },
      previewComponent: function RowPreview(props: Record<string, unknown>) {
        // `sortable` is the list's own presentation flag rather than part of
        // the row, so it is dropped before the row is handed on.
        const { sortable: _sortable, ...row } = props;
        return <Preview item={row} />;
      },
    }),
    [Editor, Preview],
  );
}

function rowOf(value: unknown): RowValues {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const row: RowValues = {};
  for (const key of Object.keys(value)) row[key] = Reflect.get(value, key);
  return row;
}
