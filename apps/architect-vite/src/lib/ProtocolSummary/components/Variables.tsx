import type { CollectionEntityType, CurrentProtocol, Entity, StageEntity, Variable } from "@codaco/protocol-validation";
import { get, isEmpty, sortBy, toPairs } from "es-toolkit/compat";
import type { ReactNode } from "react";
import React, { useContext } from "react";
import Markdown from "~/components/Form/Fields/Markdown";
import { SimpleVariablePill } from "~/components/Form/Fields/VariablePicker/VariablePill";
import DualLink from "./DualLink";
import { renderValue } from "./helpers";
import MiniTable from "./MiniTable";
import SummaryContext from "./SummaryContext";

type IndexEntry = {
	id: string;
	stages?: string[];
	[key: string]: unknown;
};

function flattenStageEntities(entities: Entity[]): StageEntity[] {
	const result: StageEntity[] = [];
	for (const entity of entities) {
		if (entity.type === "Stage") {
			result.push(entity);
		} else if (entity.type === "Collection") {
			result.push(...flattenStageEntities((entity as CollectionEntityType).children));
		}
	}
	return result;
}

const getStageName = (protocol: CurrentProtocol) => (stageId: string) => {
	const stages = flattenStageEntities(protocol.timeline.entities);
	const stageConfiguration = stages.find((s) => s.id === stageId);
	return stageConfiguration?.label;
};

const makeGetUsedIn = (protocol: CurrentProtocol) => (indexEntry: IndexEntry | undefined) => {
	const stages = get(indexEntry, "stages", []) as string[];

	return stages.map((stageId: string) => [stageId, getStageName(protocol)(stageId)]);
};

type VariablesProps = {
	variables?: Record<string, unknown>;
};

const Variables = ({ variables }: VariablesProps) => {
	const { protocol, index } = useContext(SummaryContext);

	const getUsedIn = makeGetUsedIn(protocol);

	const sortedVariables = sortBy(toPairs(variables), [(variable) => (variable[1] as Variable).name.toLowerCase()]);

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
						const config = variableConfiguration as Variable;
						const { name, type } = config;

						const indexEntry = index.find(({ id }: { id: string }) => id === variableId) as IndexEntry | undefined;

						let optionsRows: ReactNode[][] = [];

						if ("options" in config) {
							optionsRows =
								config.options?.map(({ value, label }) => [
									<span key={`val-${String(value)}`}>{renderValue(value)}</span>,
									<Markdown key={`label-${String(value)}`} label={label} />,
								]) ?? [];
						}

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
									{optionsRows.length > 0 && <MiniTable rows={[["Value", "Label"], ...optionsRows]} />}
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
