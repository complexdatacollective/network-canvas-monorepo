import { toNumber } from "es-toolkit/compat";
import { GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import type React from "react";
import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import RichTextField from "~/components/Form/Fields/RichText";
import TextField from "~/components/Form/Fields/Text";
import ValidatedField from "~/components/Form/ValidatedField";
import { actionCreators as dialogsActions } from "~/ducks/modules/dialogs";
import { Icon } from "~/lib/legacy-ui/components";
import type { OptionValue } from "./Options";

const isNumberLike = (value: string) => Number.parseInt(value, 10).toString() === value; // eslint-disable-line

const deleteOption =
	({
		fields,
		openDialog,
		index,
	}: {
		fields: { remove: (index: number) => void };
		openDialog: (options: {
			type: string;
			title: string;
			message: string;
			onConfirm: () => void;
			confirmLabel: string;
		}) => void;
		index: number;
	}) =>
	() => {
		openDialog({
			type: "Warning",
			title: "Remove option",
			message: "Are you sure you want to remove this option?",
			onConfirm: () => {
				fields.remove(index);
			},
			confirmLabel: "Remove option",
		});
	};

const DeleteOption = (props: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className="options__option-delete"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		<Icon name="delete" />
	</div>
);

// Props passed from parent
type OptionBaseProps = {
	field: string;
	value: OptionValue;
	index: number;
	fields: {
		remove: (index: number) => void;
	};
};

// Props injected by HOCs
type OptionInjectedProps = {
	handleDelete: () => void;
};

type OptionProps = OptionBaseProps & OptionInjectedProps;

const Option = ({ field, handleDelete, value }: OptionProps) => {
	const controls = useDragControls();

	return (
		<Reorder.Item className="options__option" value={value} dragListener={false} dragControls={controls}>
			<div className="options__option-controls options__option-controls--center">
				<div className="options__option-handle" onPointerDown={(e) => controls.start(e)}>
					<GripVertical className="cursor-grab" />
				</div>
			</div>
			<div className="options__option-values">
				<div className="options__option-value">
					<h4 className="options__option-label">Label</h4>
					<ValidatedField<{ inline?: boolean; placeholder?: string }>
						component={RichTextField as React.ComponentType<Record<string, unknown>>}
						componentProps={{
							inline: true,
							placeholder: "Enter a label...",
						}}
						name={`${field}.label`}
						validation={{ required: true, uniqueArrayAttribute: true }}
					/>
				</div>
				<div className="options__option-value">
					<h4 className="options__option-label">Value</h4>
					<ValidatedField<{
						parse?: (value: string) => string | number;
						placeholder?: string;
					}>
						component={TextField as React.ComponentType<Record<string, unknown>>}
						componentProps={{
							parse: (value: string) => (isNumberLike(value) ? toNumber(value) : value),
							placeholder: "Enter a value...",
						}}
						name={`${field}.value`}
						validation={{
							required: true,
							uniqueArrayAttribute: true,
							allowedVariableName: "option value",
						}}
					/>
				</div>
			</div>
			<div className="options__option-controls">
				<DeleteOption onClick={handleDelete} />
			</div>
		</Reorder.Item>
	);
};

const mapDispatchToItemProps = {
	openDialog: dialogsActions.openDialog,
};

type ConnectedProps = OptionBaseProps & {
	openDialog: typeof dialogsActions.openDialog;
};

export default compose<OptionProps, OptionBaseProps>(
	connect(null, mapDispatchToItemProps),
	withHandlers<ConnectedProps, { handleDelete: () => void }>({
		handleDelete: deleteOption as (props: ConnectedProps) => () => void,
	}),
)(Option);
