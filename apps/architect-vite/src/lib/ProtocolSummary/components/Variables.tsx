import { find, get, isEmpty, sortBy, toPairs } from "es-toolkit/compat";
import type { ReactNode } from "react";
import React, { useContext } from "react";
import Markdown from "~/components/Form/Fields/Markdown";
import { SimpleVariablePill } from "~/components/Form/Fields/VariablePicker/VariablePill";
import DualLink from "./DualLink";
import { renderValue } from "./helpers";
import MiniTable from "./MiniTable";
import SummaryContext from "./SummaryContext";

type ProtocolType = {
	stages?: Array<{ id: string; label: string }>;
	[key: string]: unknown;
};

type IndexEntry = {
	id: string;
	stages?: string[];
	[key: string]: unknown;
};

type VariableConfig = {
	name: string;
	type: string;
	options?: Array<{ value: unknown; label: string }>;
	[key: string]: unknown;
};

const getStageName = (protocol: ProtocolType) => (stageId: string) => {
	const stageConfiguration = find(protocol.stages, ["id", stageId]);
	return get(stageConfiguration, "label");
};

// TODO: Make this part of the index?
const makeGetUsedIn = (protocol: ProtocolType) => (indexEntry: IndexEntry | undefined) => {
	const stages = get(indexEntry, "stages", []) as string[];

	return stages.map((stageId: string) => [stageId, getStageName(protocol)(stageId)]);
};

type VariablesProps = {
	variables?: Record<string, unknown>;
};

const Variables = ({ variables }: VariablesProps) => {
	const { protocol, index } = useContext(SummaryContext);

	const getUsedIn = makeGetUsedIn(protocol as ProtocolType);

	const sortedVariables = sortBy(toPairs(variables), [
		(variable) => (variable[1] as VariableConfig).name.toLowerCase(),
	]);

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
						const config = variableConfiguration as VariableConfig;
						const { name, type, options } = config;

						const indexEntry = index.find(({ id }: { id: string }) => id === variableId) as IndexEntry | undefined;

						const optionsRows: ReactNode[][] =
							options?.map(({ value, label }: { value: unknown; label: string }) => [
								<span key={`val-${String(value)}`}>{renderValue(value)}</span>,
								<Markdown key={`label-${String(value)}`} value={label} />,
							]) ?? [];

						return (
							<tr key={variableId} id={`variable-${variableId}`}>
								<td>
									<SimpleVariablePill label={name} type={type}>
										{name}
									</SimpleVariablePill>
								</td>
								<td>
									{type}
									<br />
									<br />
									{options && <MiniTable rows={[["Value", "Label"], ...optionsRows]} />}
								</td>
								<td>
									{getUsedIn(indexEntry).map(([stageId, stageName]) => (
										<React.Fragment key={String(stageId)}>
											<DualLink to={`#stage-${String(stageId)}`}>{String(stageName)}</DualLink>
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
