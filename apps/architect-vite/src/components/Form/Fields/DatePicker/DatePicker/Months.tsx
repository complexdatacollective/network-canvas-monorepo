import { range } from "lodash";
import { DateTime, Interval } from "luxon";
import { type ReactNode, useContext } from "react";
import DatePickerContext from "./DatePickerContext";
import { formatRangeItem, getMonthName, type RangeItem } from "./helpers";

type MonthsRenderProps = {
	months: RangeItem[];
};

type MonthsProps = {
	children: (props: MonthsRenderProps) => ReactNode;
};

/**
 * Supplies `months` range.
 */
const Months = ({ children }: MonthsProps): ReactNode => {
	const { date, range: dateRange } = useContext(DatePickerContext);

	const months = range(1, 13).map((month) => {
		// Create a month long period
		const year = date.year ?? new Date().getFullYear();
		const startDate = DateTime.fromObject({ year, month, day: 1 });
		const m = Interval.after(startDate, { months: 1 });
		const label = getMonthName(month);
		// if it overlaps min/max period, then this month is valid
		if (!dateRange?.overlaps(m) || !date.year) {
			return formatRangeItem(month, { label, isOutOfRange: true });
		}
		return formatRangeItem(month, { label });
	});

	return children({ months });
};

export default Months;
