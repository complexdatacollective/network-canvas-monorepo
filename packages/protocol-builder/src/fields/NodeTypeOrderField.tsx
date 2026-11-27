import { useMemo } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import ArrayField, {
  ArrayFieldDragHandle,
  type ArrayFieldItemProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

type NodeTypeItem = { id: string; label: string };

type NodeTypeOrderFieldProps = CreateFormFieldProps<
  string[],
  'ul',
  {
    /** The node types the stage shows, in the order its subject lists them. */
    types: readonly NodeTypeItem[];
  }
>;

function NodeTypeOrderItem({
  item,
  isSortable,
  dragControls,
  index,
  itemCount,
  onMove,
  disabled,
}: ArrayFieldItemProps<NodeTypeItem>) {
  return (
    <div className="flex w-full items-center gap-2">
      {isSortable && (
        <ArrayFieldDragHandle
          dragControls={dragControls}
          index={index}
          itemCount={itemCount}
          onMove={onMove}
          disabled={disabled}
        />
      )}
      {/* The researcher's name for the type reads in its own direction. */}
      <span dir="auto" className="text-match-parent flex-1">
        {item.label}
      </span>
    </div>
  );
}

/**
 * The order a prompt hands over the node types of a stage that shows several.
 *
 * Every type the stage shows is in the list, and only those: a saved order
 * naming a type the stage no longer shows drops it, and a type it does not
 * name yet follows the others in subject order. With no saved order the list
 * shows the subject order, which is what the interview uses without one.
 */
export default function NodeTypeOrderField({
  value,
  onChange,
  types,
  ...props
}: NodeTypeOrderFieldProps) {
  const items = useMemo(() => {
    const ids = types.map((type) => type.id);
    const ordered = [
      ...(value ?? []).filter((id) => ids.includes(id)),
      ...ids.filter((id) => !(value ?? []).includes(id)),
    ];
    return ordered.flatMap((id) => types.filter((type) => type.id === id));
  }, [types, value]);

  return (
    <ArrayField<NodeTypeItem>
      {...props}
      value={items}
      onChange={(next) => onChange?.((next ?? []).map((item) => item.id))}
      sortable
      maxItems={types.length}
      confirmDelete={false}
      getId={(item) => item.id}
      itemComponent={NodeTypeOrderItem}
    />
  );
}
