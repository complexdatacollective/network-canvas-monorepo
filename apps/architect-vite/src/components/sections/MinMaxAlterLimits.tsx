import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";
import { get, isNull, isUndefined } from "es-toolkit/compat";
import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, FormSection, formValueSelector } from "redux-form";
import { Section } from "~/components/EditorLayout";
import { Number } from "~/components/Form/Fields";
import { openDialog } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/modules/root";
import { ValidatedField } from "../Form";
import IssueAnchor from "../IssueAnchor";
import Tip from "../Tip";

const maxValidation = (value: number | null | undefined, allValues: Record<string, unknown>) => {
	const minValue = get(allValues, "behaviours.minNodes", null) as number | null;

	if (isUndefined(minValue) || isNull(minValue) || !value) {
		return undefined;
	}

	return value >= minValue ? undefined : "Maximum number of alters must be greater than or equal to the minimum number";
};

const minValidation = (value: number | null | undefined, allValues: Record<string, unknown>) => {
	const maxValue = get(allValues, "behaviours.maxNodes") as number | null | undefined;

	if (isUndefined(maxValue) || isNull(maxValue) || !value) {
		return undefined;
	}

	return value <= maxValue ? undefined : "Minimum number of alters must be less than or equal to the maximum number";
};

const MinMaxAlterLimits = () => {
	const formSelector = useMemo(() => formValueSelector("edit-stage"), []);
	const currentMinValue = useSelector(
		(state: RootState) => formSelector(state, "behaviours.minNodes") as number | undefined,
	);
	const currentMaxValue = useSelector(
		(state: RootState) => formSelector(state, "behaviours.maxNodes") as number | undefined,
	);
	const hasMultiplePrompts = useSelector((state: RootState) => {
		const prompts = formSelector(state, "prompts") as unknown[] | undefined;
		return !!prompts && prompts.length > 1;
	});

	const dispatch = useDispatch<Dispatch<UnknownAction>>();

	const handleToggleChange = useCallback(
		async (newState: boolean) => {
			if ((isUndefined(currentMinValue) && isUndefined(currentMaxValue)) || newState === true) {
				return true;
			}

			const confirm = await dispatch(
				openDialog({
					type: "Warning",
					title: "This will clear your values",
					message: "This will clear the minimum and maximum alter values. Do you want to continue?",
					confirmLabel: "Clear values",
				}),
			);

			if (confirm) {
				dispatch(change("edit-stage", "behaviours.minNodes", null) as UnknownAction);
				dispatch(change("edit-stage", "behaviours.maxNodes", null) as UnknownAction);
				return true;
			}

			return false;
		},
		[dispatch, currentMinValue, currentMaxValue],
	);

	const startExpanded = useMemo(
		() => !isUndefined(currentMinValue) || !isUndefined(currentMaxValue),
		[currentMaxValue, currentMinValue],
	);

	return (
		<Section
			title="Min/max alters"
			summary=<p>
				This feature allows you to specify a minimum or maximum number of alters that can be named on this stage. Please
				note that these limits apply to the <strong>stage as a whole</strong>, regardless of the number of prompts you
				have created.
			</p>
			toggleable
			startExpanded={startExpanded}
			handleToggleChange={handleToggleChange}
		>
			{hasMultiplePrompts && (
				<Tip type="warning">
					<p>
						You have multiple prompts configured on this stage. Remember that the limits you specify here apply to the{" "}
						<strong>stage as a whole</strong>. Consider splitting your prompts up into multiple stages, or ensure you
						take extra care in the phrasing of your prompts so that you communicate the alter limits to your
						participants.
					</p>
				</Tip>
			)}
			<FormSection name="behaviours">
				<IssueAnchor fieldName="behaviours.minNodes" description="Minimum alters" />
				<ValidatedField
					name="minNodes"
					label="Minimum Number of Alters. (0 = no minimum)"
					component={Number}
					componentProps={{
						placeholder: "0",
					}}
					validation={{
						lessThanMax: minValidation,
						positiveNumber: (value: number | null | undefined) => {
							if (!value && value !== 0) return undefined;
							return value >= 0 ? undefined : "Must be a positive number";
						},
					}}
				/>
				<IssueAnchor fieldName="behaviours.maxNodes" description="Maximum alters" />
				<ValidatedField
					name="maxNodes"
					label="Maximum Number of Alters. _(Leave empty for no maximum)_"
					component={Number}
					componentProps={{
						placeholder: "Infinity",
					}}
					validation={{
						greaterThanMin: maxValidation,
						minValue: (value: number | null | undefined) => {
							if (!value) return undefined;
							return value >= 1 ? undefined : "Must be at least 1";
						},
					}}
				/>
			</FormSection>
		</Section>
	);
};

export default MinMaxAlterLimits;
