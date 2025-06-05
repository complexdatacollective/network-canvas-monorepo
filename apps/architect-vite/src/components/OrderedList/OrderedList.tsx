import { isArray, isPlainObject } from "es-toolkit/compat";
import type React from "react";
import { connect } from "react-redux";
import { compose, renameProp } from "recompose";
import { arrayMove, arrayRemove } from "redux-form";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import ListItem from "./ListItem";

type OrderedListBaseProps = {
	input: {
		value: Record<string, unknown>[];
		name: string;
	};
	meta: {
		error?: string | string[];
		dirty?: boolean;
		submitFailed?: boolean;
		form: string;
	};
	item: React.ComponentType<any>;
	onClickItem?: ((fieldId: string) => void) | null;
	removeItem: (index: number) => void;
	disabled: boolean;
};

type OrderedListProps = OrderedListBaseProps & {
	lockAxis?: string;
	useDragHandle?: boolean;
	sortable?: boolean;
	onSortEnd?: (params: { oldIndex: number; newIndex: number }) => void;
};

const OrderedList = (props: OrderedListBaseProps) => {
	const {
		input: { value: values = [], name },
		meta: { error, dirty, submitFailed },
		item: Item,
		disabled: sortable,
		onClickItem,
		removeItem,
		meta: { form },
	} = props;

	return (
		<div className="list">
			{(dirty || submitFailed) && error && !isArray(error) && <p className="list__error">{error}</p>}
			{values?.map((value, index) => {
				const previewValue = isPlainObject(value) ? value : { value };
				const fieldId = `${name}[${index}]`;
				const onClick = onClickItem && (() => onClickItem(fieldId));

				const onDelete = () => removeItem(index);

				return (
					<ListItem
						index={index}
						sortable={sortable}
						key={fieldId}
						layoutId={onClickItem && fieldId}
						onClick={onClick}
						onDelete={onDelete}
					>
						<Item
							{...previewValue} // eslint-disable-line react/jsx-props-no-spreading
							fieldId={fieldId}
							form={form}
							key={fieldId}
						/>
					</ListItem>
				);
			})}
		</div>
	);
};

const mapDispatchToProps = (dispatch, { input: { name }, meta: { form } }) => ({
	removeItem: (index) => {
		dispatch(
			dialogActions.openDialog({
				type: "Confirm",
				title: "Remove this item?",
				confirmLabel: "Remove item",
			}),
		).then((confirm) => {
			if (!confirm) {
				return;
			}
			dispatch(arrayRemove(form, name, index));
		});
	},
	onSortEnd: ({ oldIndex, newIndex }) => {
		dispatch(arrayMove(form, name, oldIndex, newIndex));
	},
});

export { OrderedList };

const withDefaults = (Component: React.ComponentType<OrderedListBaseProps>) => {
	return (props: Omit<OrderedListProps, "removeItem" | "onSortEnd">) => {
		const { lockAxis = "y", useDragHandle = true, sortable = true, onClickItem = null, ...rest } = props;

		return <Component {...rest} onClickItem={onClickItem} disabled={!sortable} />;
	};
};

export default compose(
	withDefaults,
	renameProp("sortable", "disabled"),
	connect(null, mapDispatchToProps),
)(OrderedList);
