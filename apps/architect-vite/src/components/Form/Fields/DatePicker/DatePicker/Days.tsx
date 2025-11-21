import { range } from "lodash";
import { DateTime } from "luxon";
import { type ReactNode, useContext } from "react";
import DatePickerContext from "./DatePickerContext";
import { formatRangeItem, type RangeItem } from "./helpers";

type DaysRenderProps = {
	days: RangeItem[];
};

type DaysProps = {
	children: (props: DaysRenderProps) => ReactNode;
};

/**
 * Supplies `days` range based on currently selected month.
 */
const Days = ({ children }: DaysProps): ReactNode => {
	const { date, range: dateRange } = useContext(DatePickerContext);

	// Handle null values by providing defaults for DateTime
	const year = date.year ?? new Date().getFullYear();
	const month = date.month ?? 1;

	const daysInMonth = DateTime.fromObject({ year, month }).daysInMonth ?? 30;

	const days = range(1, daysInMonth + 1).map((day) => {
		const d = DateTime.fromObject({ year, month, day });
		if (dateRange?.contains(d)) {
			return formatRangeItem(day);
		}
		return formatRangeItem(day, { isOutOfRange: true });
	});

	return children({ days });
};

export default Days;
