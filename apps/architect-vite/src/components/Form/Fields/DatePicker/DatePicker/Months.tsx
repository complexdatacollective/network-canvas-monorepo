import { range } from "lodash";
import { Interval } from "luxon";
import { type ReactNode, useContext } from "react";
import DatePickerContext from "./DatePickerContext";
import { formatRangeItem, getMonthName, type RangeItem } from "./helpers";

interface MonthsRenderProps {
	months: RangeItem[];
}

interface MonthsProps {
	children: (props: MonthsRenderProps) => ReactNode;
}

/**
 * Supplies `months` range.
 */
const Months = ({ children }: MonthsProps) => {
	const { date, range: dateRange } = useContext(DatePickerContext);

	const months = range(1, 13).map((month) => {
		// Create a month long period
		const m = Interval.after({ ...date, month, day: 1 }, { months: 1 });
		const label = getMonthName(month);
		// if it overlaps min/max period, then this month is valid
		if (!dateRange?.overlaps(m) || !date.year) {
			return formatRangeItem(month, { label, isOutOfRange: true });
		}
		return formatRangeItem(month, { label });
	});

	return children({ months }) as JSX.Element;
};

export default Months;
