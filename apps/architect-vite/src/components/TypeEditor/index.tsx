import { get } from "es-toolkit/compat";
import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { actionCreators as codebookActions } from "~/ducks/modules/protocol/codebook";
import type { RootState } from "~/ducks/store";
import { getProtocol } from "~/selectors/protocol";
import Editor from "../Editor";
import { format, parse } from "./convert";
import getNewTypeTemplate from "./getNewTypeTemplate";
import TypeEditor from "./TypeEditor";

const formName = "TYPE_EDITOR";

type TypeEditorContainerProps = {
	entity?: string;
	type?: string;
	onComplete?: () => void;
};

const TypeEditorContainer = ({ entity, type, onComplete }: TypeEditorContainerProps) => {
	const dispatch = useDispatch();
	const protocol = useSelector((state: RootState) => getProtocol(state));

	const initialValues = useMemo(() => {
		return format(get(protocol, ["codebook", entity, type], getNewTypeTemplate({ protocol, entity }), {}));
	}, [protocol, entity, type]);

	const updateType = useCallback(
		(entityType: string, typeKey: string, form: Record<string, unknown>) => {
			// @ts-expect-error - thunk action returns promise
			return dispatch(codebookActions.updateType({ entity: entityType, type: typeKey, configuration: parse(form) }));
		},
		[dispatch],
	);

	const createType = useCallback(
		(entityType: string, form: Record<string, unknown>) => {
			// @ts-expect-error - thunk action returns promise
			return dispatch(codebookActions.createType({ entity: entityType, configuration: parse(form) }));
		},
		[dispatch],
	);

	const handleSubmit = useCallback(
		async (values: Record<string, unknown>) => {
			if (!type && entity) {
				// @ts-expect-error - thunk action returns promise
				return createType(entity, values).then(() => onComplete?.());
			}
			if (entity && type) {
				// @ts-expect-error - thunk action returns promise
				return updateType(entity, type, values).then(() => onComplete?.());
			}
		},
		[createType, updateType, onComplete, entity, type],
	);

	return (
		<Editor form={formName} initialValues={initialValues} onSubmit={handleSubmit}>
			<TypeEditor form={formName} entity={entity} type={type} isNew={!type} />
		</Editor>
	);
};

export { formName };
export default TypeEditorContainer;
