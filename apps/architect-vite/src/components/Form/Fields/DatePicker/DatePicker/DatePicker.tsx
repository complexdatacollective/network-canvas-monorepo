import { DateTime, Interval } from "luxon";
import { type ReactNode, useEffect, useState } from "react";
import { DATE_FORMATS, type DateType, DEFAULT_MIN_DATE, DEFAULT_TYPE } from "./config";
import DatePickerContext from "./DatePickerContext";
import { type DateObject, isComplete, isEmpty, now } from "./helpers";

type DatePickerProps = {
	children?: ReactNode;
	date?: string | null;
	min?: string | null;
	max?: string | null;
	onChange?: (date: string) => void;
	type?: DateType | null;
};

/**
 * Get date object from an ISO string
 */
const getDate = (dateString: string | null | undefined): DateObject => {
	const { year, month, day } = dateString
		? DateTime.fromISO(dateString).toObject()
		: {
				month: null,
				day: null,
				year: null,
			};
	return { year: year ?? null, month: month ?? null, day: day ?? null };
};

const DatePicker = ({
	children = null,
	date = null,
	min = null,
	max = null,
	onChange = () => {},
	type = DEFAULT_TYPE,
}: DatePickerProps) => {
	const [pickerState, setPickerState] = useState({
		date: getDate(date),
	});

	// Correctly update component state when passed new date prop
	useEffect(() => {
		setPickerState((state) => ({
			...state,
			date: getDate(date),
		}));
	}, [date]);

	const typeWithDefault = type || DEFAULT_TYPE;

	const format = DATE_FORMATS[typeWithDefault];

	const minWithDefault = min ? DateTime.fromISO(min) : now().minus(DEFAULT_MIN_DATE);

	const maxWithDefault = max ? DateTime.fromISO(max) : now();

	const range = Interval.fromDateTimes(minWithDefault.startOf("day"), maxWithDefault.endOf("day"));

	const handleOnChange = (values: Partial<DateObject>) => {
		const newDate = { ...pickerState.date, ...values };

		setPickerState((state) => ({
			...state,
			date: newDate,
		}));

		if (isEmpty(type)(newDate)) {
			onChange("");
			return;
		}

		if (isComplete(type)(newDate)) {
			const dateString = DateTime.fromObject(newDate).toFormat(format);
			onChange(dateString);
		}
	};

	const context = {
		onChange: handleOnChange,
		range,
		type,
		...pickerState,
	};

	return <DatePickerContext.Provider value={context}>{children}</DatePickerContext.Provider>;
};

export default DatePicker;
