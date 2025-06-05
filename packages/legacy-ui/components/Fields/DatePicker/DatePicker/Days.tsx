import { ReactNode, useContext } from "react";
import { range } from "lodash";
import { DateTime } from "luxon";
import DatePickerContext from "./DatePickerContext";
import { formatRangeItem, RangeItem } from "./helpers";

interface DaysRenderProps {
	days: RangeItem[];
}

interface DaysProps {
	children: (props: DaysRenderProps) => ReactNode;
}

/**
 * Supplies `days` range based on currently selected month.
 */
const Days = ({ children }: DaysProps) => {
	const { date, range: dateRange } = useContext(DatePickerContext);

	const days = range(1, DateTime.fromObject(date).daysInMonth + 1).map((day) => {
		const d = DateTime.fromObject({ ...date, day });
		if (dateRange?.contains(d)) {
			return formatRangeItem(day);
		}
		return formatRangeItem(day, { isOutOfRange: true });
	});

	return children({ days }) as JSX.Element;
};

export default Days;