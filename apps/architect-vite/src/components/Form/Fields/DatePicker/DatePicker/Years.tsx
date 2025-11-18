import { range } from "lodash";
import { type ReactNode, useContext } from "react";
import DatePickerContext from "./DatePickerContext";
import { formatRangeItem, type RangeItem } from "./helpers";

interface YearsRenderProps {
	years: RangeItem[];
}

interface YearsProps {
	children: (props: YearsRenderProps) => ReactNode;
}

/**
 * Supplies `years` range based on min/max props.
 */
const Years = ({ children }: YearsProps) => {
	const { range: dateRange } = useContext(DatePickerContext);

	if (!dateRange) {
		return children({ years: [] }) as JSX.Element;
	}

	const years = range(dateRange.start.year, dateRange.end.year + 1).map((y) => formatRangeItem(y));
	return children({ years }) as JSX.Element;
};

export default Years;
