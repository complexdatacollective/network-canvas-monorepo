import { Button } from "@codaco/ui";
import TextField from "@codaco/ui/lib/components/Fields/Text";
import { get, values } from "lodash";
import PropTypes from "prop-types";
import { useCallback, useMemo, useState } from "react";
import { connect } from "react-redux";
import { Field } from "redux-form";
import BasicForm from "~/src/components/BasicForm";
import ContextualDialog, { Controls, Title } from "~/src/components/ContextualDialog";
import { actionCreators as codebookActions } from "~/src/ducks/modules/protocol/codebook";
import { getType, getVariablesForSubject } from "~/src/selectors/codebook";
import safeName from "~/src/utils/safeName";
import { allowedVariableName, required, uniqueByList } from "~/src/utils/validations";

const isRequired = required();

const isAllowedVariableName = allowedVariableName();

const RenameVariableControl = ({ id, name, children, entity, type, updateVariable, existingVariableNames }) => {
	const formName = `rename-variable-${id}`;

	const [isOpen, setIsOpen] = useState(false);

	const validate = useMemo(
		() => [isRequired, uniqueByList(existingVariableNames), isAllowedVariableName],
		[existingVariableNames.join()],
	);

	const handleClose = useCallback(() => {
		setIsOpen(false);
	}, []);

	const handleSubmit = useCallback(
		(formValues) => {
			const { name: newName } = formValues;
			updateVariable(entity, type, id, { name: newName }, true);
			setIsOpen(false);
		},
		[id],
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
	}, [setIsOpen]);

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

RenameVariableControl.propTypes = {
	id: PropTypes.string.isRequired,
	entity: PropTypes.string.isRequired,
	type: PropTypes.string,
	updateVariable: PropTypes.func.isRequired,
	name: PropTypes.string,
	existingVariableNames: PropTypes.arrayOf(PropTypes.string),
	children: PropTypes.func.isRequired,
};

RenameVariableControl.defaultProps = {
	name: null,
	type: null,
	existingVariableNames: [],
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
