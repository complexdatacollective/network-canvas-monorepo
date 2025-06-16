import { createSelector } from "@reduxjs/toolkit";
import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import NewTypeDialog from "~/components/Dialog/NewTypeDialog";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { Icon } from "~/lib/legacy-ui/components";
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

// Helper function to get protocol ID from URL
const getProtocolId = () => {
	const urlPath = window.location.pathname;
	return urlPath.match(/\/protocol\/([^\/]+)/)?.[1];
};

const EntitySelectField = ({
	entityType,
	label = null,
	input: { value, onChange },
	meta: { error, invalid, touched },
	promptBeforeChange = null,
}: EntitySelectFieldProps) => {
	const dispatch = useDispatch();
	const edgeOptions = useSelector(getEdgeOptions);
	const nodeOptions = useSelector(getNodeOptions);
	const [showNewTypeDialog, setShowNewTypeDialog] = useState(false);

	const options = useMemo(() => {
		if (entityType === "edge") {
			return edgeOptions;
		}
		return nodeOptions;
	}, [entityType, edgeOptions, nodeOptions]);

	const hasError = !!touched && !!error;

	const handleClickItem = (clickedItem) => {
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
	};

	const handleOpenCreateNewType = useCallback(() => {
		setShowNewTypeDialog(true);
	}, []);

	const handleNewTypeComplete = useCallback(() => {
		setShowNewTypeDialog(false);
	}, []);

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
					color={color}
					onClick={() => handleClickItem(optionValue)}
					selected={value === optionValue}
				/>
			)),
		[options, value, handleClickItem, PreviewComponent],
	);

	const classes = cx(
		"form-fields-entity-select",
		{
			"form-fields-entity-select--has-error": hasError,
		},
		{
			"form-fields-entity-select--nodes": entityType === "node",
		},
		{
			"form-fields-entity-select--edges": entityType === "edge",
		},
	);

	return (
		<div className={classes}>
			{label && <h4 className="form-field-label">{label}</h4>}
			<div className="form-field flex-wrap flex">
				{renderOptions()}
				{options.length === 0 && (
					<p className="form-fields-entity-select__empty">
						No {entityType} types currently defined. Use the button below to create one.
					</p>
				)}
			</div>
			{invalid && touched && (
				<div className="form-fields-entity-select__error">
					<Icon name="warning" />
					{error}
				</div>
			)}
			<Button color="primary" icon="add" size="small" onClick={handleOpenCreateNewType}>
				Create new {entityType} type
			</Button>
			<NewTypeDialog
				show={showNewTypeDialog}
				entityType={entityType}
				onComplete={handleNewTypeComplete}
				onCancel={handleNewTypeCancel}
			/>
		</div>
	);
};

export default EntitySelectField;
