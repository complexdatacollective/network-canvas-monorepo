import { isArray, noop } from 'es-toolkit/compat';
import { AnimatePresence, Reorder } from 'motion/react';
import type React from 'react';
import { useCallback } from 'react';
import { arrayRemove, type WrappedFieldProps } from 'redux-form';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
// Only the unique props for OrderedList (excluding WrappedFieldProps)
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAppDispatch } from '~/ducks/hooks';

import ListItem from './ListItem';
export type OrderedListProps = {
  item: React.ElementType;
  onClickItem?: (index: number) => void;
  sortable?: boolean;
  editIndex?: number | null;
};
const OrderedList = (props: WrappedFieldProps & OrderedListProps) => {
  const {
    input: { value: values, name, onChange },
    meta: { error, dirty, submitFailed, form },
    item: Item,
    onClickItem = noop,
    sortable = true,
  } = props;
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();
  const getDeleteHandler = useCallback(
    (index: number) => async () => {
      void confirm({
        title: 'Remove this item?',
        description: 'This item will be removed from the list.',
        confirmLabel: 'Remove item',
        cancelLabel: 'Cancel',
        intent: 'destructive',
        onConfirm: () => {
          dispatch(arrayRemove(form, name, index));
        },
      });
    },
    [confirm, dispatch, form, name],
  );
  const handleReorder = (newOrder: unknown[]) => {
    onChange(newOrder);
  };
  if (!values || !Array.isArray(values)) {
    return null;
  }
  return (
    <Reorder.Group
      className="flex w-full flex-col gap-5"
      onReorder={handleReorder}
      values={values}
      axis="y"
    >
      <AnimatePresence>
        {values.map((item, index) => {
          // Every list item must carry a stable, unique id (EditableList
          // assigns one on creation). A missing id breaks the motion
          // Reorder/AnimatePresence keying, so surface it loudly instead of
          // silently deriving a content-hash key that collides on duplicate rows.
          if (!item.id) {
            console.error(
              `OrderedList item at ${name}[${index}] is missing an id`,
              item,
            );
          }
          const key = item.id ?? `${name}-missing-id-${index}`;
          return (
            <ListItem
              key={key}
              layoutId={`${name}-edit-field-${index}`}
              value={item}
              handleDelete={getDeleteHandler(index)}
              handleClick={() => onClickItem(index)}
              sortable={sortable}
            >
              <Item
                form={form}
                fieldId={`${name}[${index}]`}
                sortable={sortable}
                {...item}
              />
            </ListItem>
          );
        })}
      </AnimatePresence>
      {(dirty || submitFailed) && error && !isArray(error) && (
        <Paragraph className="text-destructive">{error}</Paragraph>
      )}
    </Reorder.Group>
  );
};
export default OrderedList;
