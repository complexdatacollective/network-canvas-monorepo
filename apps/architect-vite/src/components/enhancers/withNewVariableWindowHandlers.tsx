import { get } from "es-toolkit/compat";
import { compose, mapProps, withHandlers, withState } from "recompose";
import { normalizeKeyDown } from "./withCreateVariableHandler";

/**
 * Helper props for use with <NewVariableWindow />
 *
 * openNewVariableWindow,
 * closeNewVariableWindow,
 * newVariableName,
 * newVariableOptions, // intended to be used for initialState, but can be used for anything
 * showNewVariableWindow,
 *
 * TODO: Should these live with NewVariableWindow?
 */

const newVariableInitialState = {
	variableName: null,
	variableOptions: {},
};

const parseVariableName = (variableName: unknown): string => (typeof variableName === "string" ? variableName : "");

const newVariablePropertiesState = withState(
	"newVariableProperties",
	"setNewVariableProperties",
	newVariableInitialState,
);

const newVariableHandlers = withHandlers({
	openNewVariableWindow:
		({ setNewVariableProperties }: { setNewVariableProperties: (props: { variableName: string; variableOptions: Record<string, unknown> }) => void }) =>
		(variableName: unknown, variableOptions: Record<string, unknown> = {}) =>
			setNewVariableProperties({
				variableName: parseVariableName(variableName),
				variableOptions,
			}),
	closeNewVariableWindow:
		({ setNewVariableProperties }: { setNewVariableProperties: (props: typeof newVariableInitialState) => void }) =>
		() =>
			setNewVariableProperties(newVariableInitialState),
	normalizeKeyDown: () => normalizeKeyDown,
});

const showVariableWindow = mapProps(({ newVariableProperties, ...rest }) => ({
	showNewVariableWindow: newVariableProperties.variableName !== null,
	newVariableName: get(newVariableProperties, "variableName", null),
	newVariableOptions: get(newVariableProperties, "variableOptions", {}),
	...rest,
}));

const withNewVariableWindowHandlers = compose(newVariablePropertiesState, newVariableHandlers, showVariableWindow);

export type WithNewVariableWindowHandlersProps = {
	openNewVariableWindow: (variableName: string, variableOptions?: Record<string, unknown>) => void;
	closeNewVariableWindow: () => void;
	newVariableName?: string;
	showNewVariableWindow: boolean;
	normalizeKeyDown: (event: KeyboardEvent) => KeyboardEvent;
};

export default withNewVariableWindowHandlers;
