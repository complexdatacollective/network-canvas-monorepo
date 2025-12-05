import type { ComponentProps } from "react";
import { connect } from "react-redux";
import { compose } from "recompose";
import type { RootState } from "~/ducks/store";
import { getEntityProperties } from "./helpers";
import Variables from "./Variables";

type UsageItem = {
	label: string;
	id?: string;
};

type Variable = {
	id: string;
	name: string;
	component: string;
	inUse: boolean;
	usage: UsageItem[];
	usageString?: string;
};

type VariablesComponentProps = {
	variables: Variable[];
	entity: string;
};

type EgoTypeProps = {
	variables?: Record<string, Variable>;
};

const EgoType = ({ variables = {} }: EgoTypeProps) => {
	const variableArray = Object.values(variables);
	const VariablesTyped = Variables as unknown as React.ComponentType<VariablesComponentProps>;

	return (
		<div className="codebook__entity">
			{variableArray.length > 0 && (
				<div className="codebook__entity-variables codebook__entity-variables--no-border">
					<h3>Variables:</h3>
					<VariablesTyped variables={variableArray} entity="ego" />
				</div>
			)}
		</div>
	);
};

const mapStateToProps = (state: RootState) => {
	const entityProperties = getEntityProperties(state, { entity: "ego" });
	return entityProperties;
};

export default compose<ComponentProps<typeof EgoType>, typeof EgoType>(connect(mapStateToProps))(EgoType);
