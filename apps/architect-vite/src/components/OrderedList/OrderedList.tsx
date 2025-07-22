import { isArray, noop } from "es-toolkit/compat";
import { AnimatePresence, Reorder } from "motion/react";
import { hash } from "ohash";
import type React from "react";
import { useCallback } from "react";
import { arrayRemove, type WrappedFieldProps } from "redux-form";
import { useAppDispatch } from "~/ducks/hooks";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import ListItem from "./ListItem";

// Only the unique props for OrderedList (excluding WrappedFieldProps)
export type OrderedListProps = {
	item: React.ComponentType<Record<string, unknown>>;
	onClickItem?: (index: number) => void;
	editIndex?: number | null; // Index of item being edited (to hide it)
};

const OrderedList = (props: WrappedFieldProps & OrderedListProps) => {
	const {
		input: { value: values, name, onChange },
		meta: { error, dirty, submitFailed, form },
		item: Item,
		onClickItem = noop,
		editIndex = null, // Extract editIndex prop
	} = props;

	const dispatch = useAppDispatch();

	const getDeleteHandler = useCallback(
		(index: number) => async () => {
			dispatch(
				dialogActions.openDialog({
					type: "Confirm",
					title: "Remove this item?",
					confirmLabel: "Remove item",
					onConfirm: () => {
						dispatch(arrayRemove(form, name, index));
					},
				}),
			);
		},
		[dispatch, form, name],
	);

	const handleReorder = (newOrder: T[]) => {
		onChange(newOrder);
	};

	if (!values || !Array.isArray(values)) {
		return null;
	}

	return (
		<Reorder.Group
			className="flex flex-col gap-4 not-first:mt-4 not-last:mb-4"
			onReorder={handleReorder}
			values={values}
			axis="y"
		>
			<AnimatePresence initial={false}>
				{values.map((item, index) => {
					// Create a stable identifier by hashing the item.
					const key = hash(item);

					// Make editing item invisible but keep it in layout for smooth animation
					const isEditing = editIndex === index;

					return (
						<ListItem
							key={key}
							layoutId={isEditing ? undefined : `${name}-edit-field-${index}`}
							value={item}
							handleDelete={getDeleteHandler(index)}
							handleClick={() => onClickItem(index)}
							sortable
							className={isEditing ? "opacity-0 pointer-events-none" : null}
						>
							<Item form={form} {...item} />
						</ListItem>
					);
				})}
			</AnimatePresence>
			{(dirty || submitFailed) && error && !isArray(error) && <p className="text-destructive">{error}</p>}
		</Reorder.Group>
	);
};

export default OrderedList;
