import { DateTime } from "luxon";
import DatePicker, { DATE_FORMATS } from "./DatePicker";

const DATE_FORMAT = DATE_FORMATS.full;

/**
 * A relative version of the date picker.
 *
 * Selectable range is determined as days relative to
 * an anchor date (defaults to 'today' e.g. interview date,
 * when not set).
 */
interface RelativeDatePickerProps {
	parameters?: {
		anchor?: string;
		before?: number;
		after?: number;
	};
	[key: string]: any;
}

const RelativeDatePicker = ({ parameters = {}, ...rest }: RelativeDatePickerProps) => {
	const anchor = parameters?.anchor ? DateTime.fromISO(parameters.anchor) : DateTime.local();

	const min = anchor.minus({ days: parameters?.before || 180 }).toFormat(DATE_FORMAT);

	const max = anchor.plus({ days: parameters?.after || 0 }).toFormat(DATE_FORMAT);

	const newParameters = {
		min,
		max,
	};

	// eslint-disable-next-line react/jsx-props-no-spreading
	return <DatePicker {...rest} parameters={newParameters} />;
};

export default RelativeDatePicker;
