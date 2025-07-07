import { useEffect, useState } from "react";
import { connect } from "react-redux";
import { compose } from "recompose";
import { change, formValues } from "redux-form";
import NativeSelect from "~/components/Form/Fields/NativeSelect";
import ValidatedField from "~/components/Form/ValidatedField";
import { DatePicker } from "~/components/Form/Fields";
import { DATE_FORMATS, DATE_TYPES } from "~/components/Form/Fields/DatePicker";

const dateTypes = DATE_TYPES.map((type) => ({
	...type,
	label: `${type.label} (${DATE_FORMATS[type.value].toUpperCase()})`,
}));

type DateTimeParametersProps = {
	name: string;
	type?: string;
	setSelectDefault: () => void;
	resetRangeFields: () => void;
};

const DateTimeParameters = ({ name, type = "full", setSelectDefault, resetRangeFields }: DateTimeParametersProps) => {
	const dateFormat = type ? DATE_FORMATS[type] : DATE_FORMATS.full;
	const [useDateFormat, setUseDateFormat] = useState(type);

	useEffect(() => {
		if (!type) {
			setSelectDefault();
		}
		setUseDateFormat(type);
	}, [type, setSelectDefault]);

	return (
		<>
			<h4>Date Resolution</h4>
			<p>
				Date resolution controls the precision of the measurement. By default, this input will ask for a year, a month,
				and a day. You may optionally choose to collect only a year and a month, or only a year.
			</p>
			<ValidatedField
				label=""
				component={NativeSelect}
				name={`${name}.type`}
				options={dateTypes}
				validation={{ required: true }}
				onChange={(_, value) => {
					setUseDateFormat(value);
					resetRangeFields();
				}}
			/>
			<br />
			<h4>Start Range</h4>
			<p>
				The start range is the earliest date available for the participant to select. If left empty, it will default to
				starting in the year 1920.
			</p>
			<ValidatedField
				label=""
				component={DatePicker}
				name={`${name}.min`}
				validation={{ ISODate: dateFormat }}
				placeholder="Select a start range date..."
				parameters={{
					type: useDateFormat,
					min: "1000-01-01",
					max: "3000-12-31",
				}}
			/>
			<br />
			<h4>End Range</h4>
			<p>
				The end range is the latest date available for the participant to select. If it is not supplied, the input will
				default to ending at the current date.
			</p>
			<ValidatedField
				label=""
				component={DatePicker}
				name={`${name}.max`}
				validation={{ ISODate: dateFormat }}
				placeholder="Select an end range date, or leave empty to use interview date..."
				parameters={{
					type: useDateFormat,
					min: "1000-01-01",
					max: "3000-12-31",
				}}
			/>
		</>
	);
};

const mapDispatchToProps = (dispatch, { name, form }) => ({
	setSelectDefault: () => dispatch(change(form, `${name}.type`, "full")),
	resetRangeFields: () => {
		dispatch(change(form, `${name}.max`, null));
		dispatch(change(form, `${name}.min`, null));
	},
});

export default compose(connect(null, mapDispatchToProps), formValues({ type: "parameters.type" }))(DateTimeParameters);
