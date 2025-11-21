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
		<Reorder.Group className="flex flex-col gap-4 w-full" onReorder={handleReorder} values={values} axis="y">
			<AnimatePresence>
				{values.map((item, index) => {
					const key = item.id || hash(item);
					return (
						<ListItem
							key={key}
							layoutId={`${name}-edit-field-${index}`}
							value={item}
							handleDelete={getDeleteHandler(index)}
							handleClick={() => onClickItem(index)}
							sortable={sortable}
						>
							<Item form={form} fieldId={`${name}[${index}]`} sortable={sortable} {...item} />
						</ListItem>
					);
				})}
			</AnimatePresence>
			{(dirty || submitFailed) && error && !isArray(error) && <p className="text-destructive">{error}</p>}
		</Reorder.Group>
	);
};

export default OrderedList;
