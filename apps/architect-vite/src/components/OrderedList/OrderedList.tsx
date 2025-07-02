import { isArray } from "es-toolkit/compat";
import { AnimatePresence, Reorder } from "motion/react";
import type React from "react";
import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { arrayRemove } from "redux-form";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import ListItem from "./ListItem";

type OrderedListBaseProps = {
	input: {
		value: {
			variable: string;
			prompt: string;
		}[];
		name: string;
		onChange: (newValues: Record<string, unknown>[]) => void;
	};
	meta: {
		error?: string | string[];
		dirty?: boolean;
		submitFailed?: boolean;
		form: string;
	};
	item: React.ReactNode;
	disabled?: boolean;
	onClickItem?: ((fieldId: string) => void) | null;
};

type OrderedListProps = OrderedListBaseProps & {
	sortable?: boolean;
};

const OrderedList = (props: OrderedListProps) => {
	const {
		input: { value: values, name, onChange },
		meta: { error, dirty, submitFailed },
		item: Item,
		disabled: sortable,
		onClickItem,
		meta: { form },
	} = props;

	const dispatch = useDispatch();

	const getDeleteHandler = useCallback(
		(variable: string) => async () => {
			const index = values.findIndex((item) => item.variable === variable);
			if (index !== -1) {
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
			}
		},
		[values, dispatch, form, name],
	);

	const handleReorder = (
		newOrder: {
			variable: string;
			prompt: string;
		}[],
	) => {
		onChange(newOrder);
	};

	return (
		<Reorder.Group
			className="flex flex-col gap-4 my-4"
			onReorder={handleReorder}
			values={values}
			disabled={sortable}
			axis="y"
		>
			{(dirty || submitFailed) && error && !isArray(error) && <p className="text-destructive">{error}</p>}
			<AnimatePresence initial={false}>
				{values.map((item, index) => (
					<ListItem
						key={item.variable}
						value={item}
						handleDelete={getDeleteHandler(item.variable)}
						handleClick={() => onClickItem(`${name}[${index}]`)}
						sortable={sortable}
					>
						<Item form={form} {...item} />
					</ListItem>
				))}
			</AnimatePresence>
		</Reorder.Group>
	);
};

export default OrderedList;
