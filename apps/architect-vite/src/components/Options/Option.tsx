import { Icon } from "@codaco/legacy-ui/components";
import RichTextField from "@codaco/legacy-ui/components/Fields/RichText";
import TextField from "@codaco/legacy-ui/components/Fields/Text";
import { toNumber } from "es-toolkit/compat";
import type React from "react";
import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import ValidatedField from "~/components/Form/ValidatedField";
import { actionCreators as dialogsActions } from "~/ducks/modules/dialogs";

const isNumberLike = (value) => Number.parseInt(value, 10) === value; // eslint-disable-line

const deleteOption =
	({ fields, openDialog, index }) =>
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

const OptionHandle = () => (
	<div className="options__option-handle">
		<Icon name="move" />
	</div>
);

const DeleteOption = (props: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className="options__option-delete"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		<Icon name="delete" />
	</div>
);

type OptionProps = {
	field: string;
	handleDelete: () => void;
};

const Option = ({ field, handleDelete }: OptionProps) => (
	<div className="options__option">
		<div className="options__option-controls options__option-controls--center">
			<OptionHandle />
		</div>
		<div className="options__option-values">
			<div className="options__option-value">
				<h4 className="options__option-label">Label</h4>
				<ValidatedField
					component={RichTextField}
					inline
					type="text"
					name={`${field}.label`}
					placeholder="Enter a label..."
					validation={{ required: true, uniqueArrayAttribute: true }}
				/>
			</div>
			<div className="options__option-value">
				<h4 className="options__option-label">Value</h4>
				<ValidatedField
					component={TextField}
					type="text"
					name={`${field}.value`}
					parse={(value) => (isNumberLike(value) ? toNumber(value) : value)}
					placeholder="Enter a value..."
					// option values must also respect allowedVariableName (NMTOKEN) rules
					validation={{ required: true, uniqueArrayAttribute: true, allowedVariableName: "option value" }}
				/>
			</div>
		</div>
		<div className="options__option-controls">
			<DeleteOption onClick={handleDelete} />
		</div>
	</div>
);

const mapDispatchToItemProps = {
	openDialog: dialogsActions.openDialog,
};

export default compose(
	connect(null, mapDispatchToItemProps),
	withHandlers({
		handleDelete: deleteOption,
	}),
)(Option);
