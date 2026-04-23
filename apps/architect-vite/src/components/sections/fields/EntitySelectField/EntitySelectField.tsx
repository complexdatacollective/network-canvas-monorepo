import { createSelector } from "@reduxjs/toolkit";
import { useCallback, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { v4 as uuid } from "uuid";
import NewTypeDialog from "~/components/Dialog/NewTypeDialog";
import { BaseField } from "~/components/Form/BaseField";
import { useAppDispatch } from "~/ducks/hooks";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import Button from "~/lib/legacy-ui/components/Button";
import { getEdgeTypes, getNodeTypes } from "../../../../selectors/codebook";
import { asOptions } from "../../../../selectors/utils";
import PreviewEdge from "./PreviewEdge";
import PreviewNode from "./PreviewNode";

// Memoized selectors for options
const getEdgeOptions = createSelector([getEdgeTypes], (edgeTypes) => asOptions(edgeTypes));
const getNodeOptions = createSelector([getNodeTypes], (nodeTypes) => asOptions(nodeTypes));

type EntitySelectFieldProps = {
	entityType: "node" | "edge";
	label?: string | null;
	input: {
		name?: string;
		value?: string;
		onChange: (value: string) => void;
	};
	meta: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	promptBeforeChange?: string | null;
};

const EntitySelectField = ({
	entityType,
	label = null,
	input: { name, value, onChange },
	meta,
	promptBeforeChange = null,
}: EntitySelectFieldProps) => {
	const idRef = useRef(uuid());
	const id = idRef.current;
	const dispatch = useAppDispatch();
	const edgeOptions = useSelector(getEdgeOptions);
	const nodeOptions = useSelector(getNodeOptions);
	const [showNewTypeDialog, setShowNewTypeDialog] = useState(false);

	const options = useMemo(() => {
		if (entityType === "edge") {
			return edgeOptions;
		}
		return nodeOptions;
	}, [entityType, edgeOptions, nodeOptions]);

	const { error, invalid, touched } = meta;
	const showErrors = Boolean(touched && invalid && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);

	const handleClickItem = useCallback(
		(clickedItem: string) => {
			if (!value || !promptBeforeChange) {
				onChange(clickedItem);
				return;
			}

			dispatch(
				dialogActions.openDialog({
					type: "Confirm",
					title: `Change ${entityType} type?`,
					message: promptBeforeChange,
					onConfirm: () => onChange(clickedItem),
					confirmLabel: "Continue",
				}),
			);
		},
		[value, promptBeforeChange, onChange, dispatch, entityType],
	);

	const handleOpenCreateNewType = useCallback(() => {
		setShowNewTypeDialog(true);
	}, []);

	const handleNewTypeComplete = useCallback(
		(newTypeId?: string) => {
			setShowNewTypeDialog(false);
			if (newTypeId) {
				onChange(newTypeId);
			}
		},
		[onChange],
	);

	const handleNewTypeCancel = useCallback(() => {
		setShowNewTypeDialog(false);
	}, []);

	const PreviewComponent = useMemo(() => {
		if (entityType === "edge") {
			return PreviewEdge;
		}
		return PreviewNode;
	}, [entityType]);

	const renderOptions = useCallback(
		() =>
			options.map(({ label: optionLabel, color, value: optionValue }) => (
				<PreviewComponent
					key={optionValue}
					label={optionLabel}
					color={color ?? "node-color-seq-1"}
					onClick={() => handleClickItem(optionValue)}
					selected={value === optionValue}
				/>
			)),
		[options, value, handleClickItem, PreviewComponent],
	);

	return (
		<BaseField id={id} name={name} label={label ?? undefined} errors={errors} showErrors={showErrors}>
			<div className="flex flex-col items-start gap-4 [--base-node-size:7rem]">
				<div className="flex flex-row flex-wrap justify-start gap-2 p-2">{renderOptions()}</div>
				{options.length === 0 && <p>No {entityType} types currently defined. Use the button below to create one.</p>}
				<Button icon="add" onClick={handleOpenCreateNewType} color="sea-green">
					Create new {entityType} type
				</Button>
				<NewTypeDialog
					show={showNewTypeDialog}
					entityType={entityType}
					onComplete={handleNewTypeComplete}
					onCancel={handleNewTypeCancel}
				/>
			</div>
		</BaseField>
	);
};

export default EntitySelectField;
