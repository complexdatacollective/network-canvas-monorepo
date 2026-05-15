import { toNumber } from "es-toolkit/compat";
import { GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import type React from "react";
import { compose, withHandlers } from "react-recompose";
import { connect } from "react-redux";
import RichTextField from "~/components/Form/Fields/RichText";
import TextField from "~/components/Form/Fields/Text";
import ValidatedField from "~/components/Form/ValidatedField";
import { actionCreators as dialogsActions } from "~/ducks/modules/dialogs";
import { Icon } from "~/lib/legacy-ui/components";
import { cx } from "~/utils/cva";
import type { OptionValue } from "./Options";

const isNumberLike = (value: string) => Number.parseInt(value, 10).toString() === value; // eslint-disable-line

type InternalItem<T> = {
	_internalId: string;
	data: T;
};

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

// Layout for the side controls (drag handle + delete button). Both are 3rem wide
// flex centers; the only difference is `cursor: grab` for the handle.
const sideControlClasses =
	"flex w-(--space-2xl) cursor-pointer items-center justify-center bg-transparent text-sortable-foreground [&_.icon]:size-(--space-md)";

const DeleteOption = (props: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={sideControlClasses}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		<Icon name="delete" />
	</div>
);

// Props passed from parent
type OptionBaseProps = {
	field: string;
	internalItem: InternalItem<OptionValue>;
	index: number;
	fields: {
		remove: (index: number) => void;
	};
	hasError?: boolean;
};

// Props injected by HOCs
type OptionInjectedProps = {
	handleDelete: () => void;
};

type OptionProps = OptionBaseProps & OptionInjectedProps;

const Option = ({ field, handleDelete, internalItem, hasError = false }: OptionProps) => {
	const controls = useDragControls();

	return (
		<Reorder.Item
			className={cx(
				"z-(--z-fx) flex rounded-xl text-sortable-foreground transition-colors duration-(--animation-duration-standard) ease-(--animation-easing)",
				hasError ? "bg-error" : "bg-form-control",
			)}
			value={internalItem}
			dragListener={false}
			dragControls={controls}
		>
			<div className="flex grow-0 items-center p-(--space-md)">
				<div className={cx(sideControlClasses, "cursor-grab")} onPointerDown={(e) => controls.start(e)}>
					<GripVertical className="cursor-grab" />
				</div>
			</div>
			<div className="flex flex-1">
				<div className="my-(--space-md) flex-1">
					<h4
						className={cx(
							"mb-(--space-md) mx-0 mt-0 transition-colors duration-(--animation-duration-standard) ease-(--animation-easing)",
							hasError && "text-primary-foreground",
						)}
					>
						Label
					</h4>
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
				<div className="my-(--space-md) ml-(--space-md) flex-1">
					<h4
						className={cx(
							"mb-(--space-md) mx-0 mt-0 transition-colors duration-(--animation-duration-standard) ease-(--animation-easing)",
							hasError && "text-primary-foreground",
						)}
					>
						Value
					</h4>
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
			<div className="flex grow-0 p-(--space-md)">
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
