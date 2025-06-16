import { find, get, isEmpty, sortBy, toPairs } from "es-toolkit/compat";
import React, { useContext } from "react";
import { SimpleVariablePill } from "~/components/Form/Fields/VariablePicker/VariablePill";
import Markdown from "~/lib/legacy-ui/components/Fields/Markdown";
import DualLink from "./DualLink";
import MiniTable from "./MiniTable";
import SummaryContext from "./SummaryContext";
import { renderValue } from "./helpers";

const getStageName = (protocol: any) => (stageId: string) => {
	const stageConfiguration = find(protocol.stages, ["id", stageId]);
	return get(stageConfiguration, "label");
};

// TODO: Make this part of the index?
const makeGetUsedIn = (protocol: any) => (indexEntry: any) => {
	const stages = get(indexEntry, "stages", []);

	return stages.map((stageId: string) => [stageId, getStageName(protocol)(stageId)]);
};

type VariablesProps = {
	variables?: Record<string, unknown>;
};

const Variables = ({ variables }: VariablesProps) => {
	const { protocol, index } = useContext(SummaryContext);

	const getUsedIn = makeGetUsedIn(protocol, index);

	const sortedVariables = sortBy(toPairs(variables), [(variable) => variable[1].name.toLowerCase()]);

	return (
		<div className="protocol-summary-variables">
			<table className="protocol-summary-variables__data">
				<thead>
					<tr>
						<th>Name</th>
						<th>Type</th>
						<th>Used In</th>
					</tr>
				</thead>
				<tbody>
					{isEmpty(variables) && (
						<tr className="empty">
							<td colSpan={3}>No variables to display.</td>
						</tr>
					)}
					{sortedVariables.map(([variableId, variableConfiguration]) => {
						const { name, type, options } = variableConfiguration;

						const indexEntry = index.find(({ id }) => id === variableId);

						const optionsRows = options?.map(({ value, label }) => [renderValue(value), <Markdown label={label} />]);

						return (
							<tr key={variableId} id={`variable-${variableId}`}>
								<td>
									<SimpleVariablePill label={name} type={type} />
								</td>
								<td>
									{type}
									<br />
									<br />
									{options && <MiniTable rows={[["Value", "Label"], ...optionsRows]} />}
								</td>
								<td>
									{getUsedIn(indexEntry).map(([stageId, stageName], n) => (
										<React.Fragment key={n}>
											<DualLink to={`#stage-${stageId}`}>{stageName}</DualLink>
											<br />
										</React.Fragment>
									))}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
};

export default Variables;
