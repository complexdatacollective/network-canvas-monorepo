import { get } from "es-toolkit/compat";
import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { isDirty, isInvalid } from "redux-form";
import InlineEditScreen from "~/components/InlineEditScreen/InlineEditScreen";
import { format, parse } from "~/components/TypeEditor/convert";
import getNewTypeTemplate from "~/components/TypeEditor/getNewTypeTemplate";
import TypeEditor from "~/components/TypeEditor/TypeEditor";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { createTypeAsync, updateTypeAsync } from "~/ducks/modules/protocol/codebook";
import type { RootState } from "~/ducks/store";
import { getProtocol } from "~/selectors/protocol";

const formName = "ENTITY_TYPE_DIALOG";

type EntityTypeDialogProps = {
	show: boolean;
	entity?: string;
	type?: string;
	onClose: () => void;
};

const EntityTypeDialog = ({ show, entity, type, onClose }: EntityTypeDialogProps) => {
	const dispatch = useDispatch();
	const protocol = useSelector((state: RootState) => getProtocol(state));
	const hasUnsavedChanges = useSelector((state: RootState) => isDirty(formName)(state));
	const invalid = useSelector((state: RootState) => isInvalid(formName)(state));

	const isNew = !type;

	const initialValues = useMemo(() => {
		if (!entity) {
			return {};
		}
		return format(get(protocol, ["codebook", entity, type], getNewTypeTemplate({ protocol, entity }), {}));
	}, [protocol, entity, type]);

	const title = useMemo(() => {
		if (!entity) {
			return "";
		}
		const entityLabel = entity === "node" ? "Node" : "Edge";
		return isNew ? `Create ${entityLabel} Type` : `Edit ${entityLabel} Type`;
	}, [entity, isNew]);

	const updateType = useCallback(
		(entityType: string, typeKey: string, form: Record<string, unknown>) => {
			// @ts-expect-error - thunk action returns promise
			return dispatch(updateTypeAsync({ entity: entityType, type: typeKey, configuration: parse(form) }));
		},
		[dispatch],
	);

	const createType = useCallback(
		(entityType: string, form: Record<string, unknown>) => {
			// @ts-expect-error - thunk action returns promise
			return dispatch(createTypeAsync({ entity: entityType, configuration: parse(form) }));
		},
		[dispatch],
	);

	const handleSubmit = useCallback(
		async (values: Record<string, unknown>) => {
			if (invalid) {
				return;
			}

			if (!entity) {
				return;
			}

			try {
				if (isNew) {
					// @ts-expect-error - thunk action returns promise
					await createType(entity, values);
				} else if (type) {
					// @ts-expect-error - thunk action returns promise
					await updateType(entity, type, values);
				}
				onClose();
			} catch (_error) {}
		},
		[createType, updateType, onClose, entity, type, isNew, invalid],
	);

	const handleCancel = useCallback(() => {
		if (!hasUnsavedChanges) {
			onClose();
			return;
		}

		// Show confirmation dialog for unsaved changes
		dispatch(
			dialogActions.openDialog({
				type: "Warning",
				title: "Unsaved Changes",
				message: "You have unsaved changes. Are you sure you want to close without saving?",
				confirmLabel: "Close Without Saving",
				onConfirm: () => {
					onClose();
				},
			}) as unknown,
		);
	}, [hasUnsavedChanges, onClose, dispatch]);

	if (!entity) {
		return null;
	}

	return (
		<InlineEditScreen
			show={show}
			form={formName}
			title={title}
			onSubmit={handleSubmit}
			onCancel={handleCancel}
			initialValues={initialValues}
		>
			<TypeEditor form={formName} entity={entity} type={type} isNew={isNew} />
		</InlineEditScreen>
	);
};

export default EntityTypeDialog;
