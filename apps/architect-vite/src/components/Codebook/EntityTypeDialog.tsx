import { get } from "es-toolkit/compat";
import { useCallback, useMemo } from "react";
import { isDirty, isInvalid } from "redux-form";
import InlineEditScreen from "~/components/InlineEditScreen/InlineEditScreen";
import { format, parse } from "~/components/TypeEditor/convert";
import getNewTypeTemplate from "~/components/TypeEditor/getNewTypeTemplate";
import TypeEditor from "~/components/TypeEditor/TypeEditor";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
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
	const dispatch = useAppDispatch();
	const protocol = useAppSelector((state: RootState) => getProtocol(state));
	const hasUnsavedChanges = useAppSelector((state: RootState) => isDirty(formName)(state));
	const invalid = useAppSelector((state: RootState) => isInvalid(formName)(state));

	const isNew = !type;

	const initialValues = useMemo(() => {
		if (!entity || !protocol) {
			return {};
		}
		const defaultValue = getNewTypeTemplate({ protocol, entity });
		const value = type ? get(protocol, ["codebook", entity, type]) || defaultValue : defaultValue;
		return format(value);
	}, [protocol, entity, type]);

	const title = useMemo(() => {
		if (!entity) {
			return "";
		}
		const entityLabel = entity === "node" ? "Node" : "Edge";
		return isNew ? `Create ${entityLabel} Type` : `Edit ${entityLabel} Type`;
	}, [entity, isNew]);

	const updateType = useCallback(
		async (entityType: string, typeKey: string, form: Record<string, unknown>) => {
			await dispatch(
				updateTypeAsync({
					entity: entityType as "node" | "edge" | "ego",
					type: typeKey,
					configuration: parse(form),
				}),
			).unwrap();
		},
		[dispatch],
	);

	const createType = useCallback(
		async (entityType: string, form: Record<string, unknown>) => {
			await dispatch(
				createTypeAsync({
					entity: entityType as "node" | "edge" | "ego",
					configuration: parse(form),
				}),
			).unwrap();
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
					await createType(entity, values);
				} else if (type) {
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
		void dispatch(
			dialogActions.openDialog({
				type: "Warning",
				title: "Unsaved Changes",
				message: "You have unsaved changes. Are you sure you want to close without saving?",
				confirmLabel: "Close Without Saving",
				onConfirm: () => {
					onClose();
				},
			}),
		).unwrap();
	}, [hasUnsavedChanges, onClose, dispatch]);

	if (!entity) {
		return null;
	}

	return (
		<InlineEditScreen
			show={show}
			form={formName}
			title={title}
			onSubmit={handleSubmit as (values: unknown) => void}
			onCancel={handleCancel}
			initialValues={initialValues}
		>
			<TypeEditor form={formName} entity={entity} type={type} isNew={isNew} />
		</InlineEditScreen>
	);
};

export default EntityTypeDialog;
