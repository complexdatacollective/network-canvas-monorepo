import { get, values } from "es-toolkit/compat";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { connect } from "react-redux";
import { Field } from "redux-form";
import BasicForm from "~/components/BasicForm";
import ContextualDialog, { Controls, Title } from "~/components/ContextualDialog";
import TextField from "~/components/Form/Fields/Text";
import { actionCreators as codebookActions } from "~/ducks/modules/protocol/codebook";
import { Button } from "~/lib/legacy-ui/components";
import { getType, getVariablesForSubject } from "~/selectors/codebook";
import safeName from "~/utils/safeName";
import { allowedVariableName, required, uniqueByList } from "~/utils/validations";

const isRequired = required();

const isAllowedVariableName = allowedVariableName();

type RenameVariableControlProps = {
	id: string;
	entity: string;
	type?: string | null;
	updateVariable: (
		entity: string,
		type: string | null,
		id: string,
		data: { name: string },
		shouldNotify?: boolean,
	) => void;
	name?: string | null;
	existingVariableNames?: string[];
	children: ({ onClick }: { onClick: () => void }) => React.ReactNode;
};

const RenameVariableControl = ({
	id,
	name = null,
	children,
	entity,
	type = null,
	updateVariable,
	existingVariableNames = [],
}: RenameVariableControlProps) => {
	const formName = `rename-variable-${id}`;

	const [isOpen, setIsOpen] = useState(false);

	const validate = useMemo(
		() => [isRequired, uniqueByList(existingVariableNames), isAllowedVariableName],
		[existingVariableNames],
	);

	const handleClose = useCallback(() => {
		setIsOpen(false);
	}, []);

	const handleSubmit = useCallback(
		(formValues: { name: string }) => {
			const { name: newName } = formValues;
			updateVariable(entity, type, id, { name: newName }, true);
			setIsOpen(false);
		},
		[id, entity, type, updateVariable],
	);

	const controls = [
		<Button key="close" onClick={handleClose} color="navy-taupe">
			Close
		</Button>,
		<Button key="save" type="submit" color="mustard">
			Save
		</Button>,
	];

	const handleOpen = useCallback(() => {
		setIsOpen(true);
	}, []);

	const initialValues = useMemo(
		() => ({
			name,
		}),
		[name],
	);

	return (
		<>
			{children({ onClick: handleOpen })}
			{isOpen && (
				<ContextualDialog className="rename-variable__dialog" windowRoot={document.body} controls={controls}>
					<BasicForm form={formName} onSubmit={handleSubmit} initialValues={initialValues}>
						<Title>Rename Variable</Title>
						<p>
							Choose a new name for the &quot;
							<em>{name}</em>
							&quot; variable.
						</p>
						<Field
							component={TextField}
							name="name"
							placeholder="e.g. Nickname"
							validate={validate}
							normalize={safeName}
						/>

						<Controls>{controls}</Controls>
					</BasicForm>
				</ContextualDialog>
			)}
		</>
	);
};

const mapStateToProps = (state, { entity, type, id }) => {
	const entityDefinition = getType(state, { entity, type });
	const name = get(entityDefinition, ["variables", id, "name"], "");
	const existingVariables = getVariablesForSubject(state, { entity, type });
	const existingVariableNames = values(existingVariables).map((variable) => variable.name);

	return {
		existingVariableNames,
		name,
	};
};

const mapDispatchToProps = {
	updateVariable: codebookActions.updateVariable,
};

const withState = connect(mapStateToProps, mapDispatchToProps);

export default withState(RenameVariableControl);
