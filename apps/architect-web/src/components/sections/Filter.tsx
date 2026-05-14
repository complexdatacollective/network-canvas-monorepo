import type { FilterRule } from "@codaco/protocol-validation";
import type { UnknownAction } from "@reduxjs/toolkit";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useSelector } from "react-redux";
import { change, Field, formValueSelector } from "redux-form";
import { Section } from "~/components/EditorLayout";
import { useAppDispatch } from "~/ducks/hooks";
import { openDialog } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/modules/root";
import IssueAnchor from "../IssueAnchor";
import { Filter as FilterQuery, ruleValidator, withFieldConnector, withStoreConnector } from "../Query";
import Tip from "../Tip";
import getEdgeFilteringWarning from "./SociogramPrompts/utils";

const FilterField = (
	withFieldConnector as unknown as (c: React.ComponentType) => React.ComponentType<Record<string, unknown>>
)(
	withStoreConnector(FilterQuery as unknown as React.ComponentType) as unknown as React.ComponentType,
) as React.ComponentType<Record<string, unknown>>;

export const handleFilterDeactivate = async (openDialogFn: () => Promise<boolean>) => {
	const result = await openDialogFn();
	return result;
};

const Filter = () => {
	const getFormValue = formValueSelector("edit-stage");
	const dispatch = useAppDispatch();
	const currentValue = useSelector(
		(state: RootState) => getFormValue(state, "filter") as { rules?: unknown[] } | undefined,
	);

	// get edge creation and display values for edges across all prompts
	const prompts = useSelector(
		(state: RootState) =>
			getFormValue(state, "prompts") as Array<{ edges?: { create?: string; display?: string[] } }> | undefined,
	);

	const { edgeCreationValues, edgeDisplayValues } = useMemo(() => {
		if (!prompts) return { edgeCreationValues: [], edgeDisplayValues: [] };
		const creationValues: string[] = [];
		const displayValues: string[] = [];
		prompts.forEach((prompt) => {
			if (prompt?.edges?.create) creationValues.push(prompt.edges.create);
			if (prompt?.edges?.display) displayValues.push(...prompt.edges.display);
		});
		return {
			edgeCreationValues: creationValues,
			edgeDisplayValues: displayValues,
		};
	}, [prompts]);
	const shouldShowWarning = useMemo(() => {
		if (edgeCreationValues.length > 0 || edgeDisplayValues.length > 0) {
			return getEdgeFilteringWarning((currentValue?.rules || []) as FilterRule[], [
				...edgeCreationValues,
				...edgeDisplayValues,
			]);
		}
		return false;
	}, [currentValue, edgeCreationValues, edgeDisplayValues]);

	const handleToggleChange = useCallback(
		async (newState: boolean) => {
			if (!currentValue || newState === true) {
				return true;
			}

			const confirm = await handleFilterDeactivate(
				() =>
					dispatch(
						openDialog({
							type: "Warning",
							title: "This will clear your filter",
							message: "This will clear your filter, and delete any rules you have created. Do you want to continue?",
							confirmLabel: "Clear filter",
						}) as unknown as UnknownAction,
					) as unknown as Promise<boolean>,
			);

			if (confirm) {
				dispatch(change("edit-stage", "filter", null));
				return true;
			}

			return false;
		},
		[dispatch, currentValue],
	);

	return (
		<Section
			title="Filter"
			toggleable
			summary={
				<p>
					You can optionally filter which nodes or edges are shown on this stage, by creating one or more rules using
					the options below.
				</p>
			}
			startExpanded={!!currentValue}
			handleToggleChange={handleToggleChange}
			layout="vertical"
		>
			{shouldShowWarning && (
				<Tip type="warning">
					<p>
						This stage has edge creation or display values that will not be shown based on the current filter rules.
					</p>
				</Tip>
			)}
			<IssueAnchor fieldName="filter" description="Filter text" />
			<Field name="filter" component={FilterField} validate={ruleValidator} />
		</Section>
	);
};

export default Filter;
