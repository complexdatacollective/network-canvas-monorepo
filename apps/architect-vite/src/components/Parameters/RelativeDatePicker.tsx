import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";
import type React from "react";
import { useState } from "react";
import { connect } from "react-redux";
import { compose } from "recompose";
import { change, Field, formValueSelector } from "redux-form";
import { DatePicker } from "~/components/Form/Fields";
import { DATE_FORMATS } from "~/components/Form/Fields/DatePicker";
import NumberField from "~/components/Form/Fields/Number";
import Toggle from "~/components/Form/Fields/Toggle";
import ValidatedField from "~/components/Form/ValidatedField";
import type { RootState } from "~/ducks/modules/root";

type RelativeDatePickerParametersProps = {
	name: string;
	resetField: () => void;
	anchorValue?: string | null;
};

const RelativeDatePickerParameters = ({ name, anchorValue = null, resetField }: RelativeDatePickerParametersProps) => {
	const dateFormat = DATE_FORMATS.full;
	const [useInterviewDate, setUseInterviewDate] = useState(!anchorValue);
	return (
		<>
			<h4>Anchor Date</h4>
			<p>
				The anchor date defines the point that the participant can select a date relative to. You can choose to either
				use the interview date, or specify a specific date manually. When using the interview date, the date will be set
				dynamically based on when your interview is conducted.
			</p>
			<Toggle
				input={{
					name: `${name}.useInterviewDate`,
					value: useInterviewDate,
					onChange: (checked: boolean) => {
						if (checked) {
							resetField();
						}
						setUseInterviewDate(checked);
					},
				}}
				label="Use interview date"
				fieldLabel=" "
			/>
			{!useInterviewDate && (
				<ValidatedField
					label="Specific Anchor Date"
					component={DatePicker as any}
					name={`${name}.anchor`}
					validation={{ required: !useInterviewDate, ISODate: dateFormat }}
					componentProps={{
						parameters: {
							min: "1000-01-01",
							max: "3000-01-01",
						},
					}}
				/>
			)}
			<h4>Days Before</h4>
			<p>
				Days before is the number of days prior to the anchor date that can be selected from. Defaults to 180 days if
				left blank.
			</p>
			<Field label="" component={NumberField} name={`${name}.before`} placeholder="180" />
			<h4>Days After</h4>
			<p>
				Days after is the number of days after the anchor date that can be selected from. Defaults to 0 days if left
				blank.
			</p>
			<Field label="" component={NumberField} name={`${name}.after`} placeholder="0" />
		</>
	);
};

type ConnectProps = {
	name: string;
	form: string;
};

const mapStateToProps = (state: RootState, { name, form }: ConnectProps) => ({
	anchorValue: formValueSelector(form)(state, `${name}.anchor`),
});

const mapDispatchToProps = (dispatch: Dispatch, { name, form }: ConnectProps) => ({
	resetField: () => dispatch(change(form, `${name}.anchor`, null) as UnknownAction),
});

export default compose(connect(mapStateToProps, mapDispatchToProps))(RelativeDatePickerParameters as any);
