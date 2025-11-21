import { range } from "lodash";
import { type ReactNode, useContext } from "react";
import DatePickerContext from "./DatePickerContext";
import { formatRangeItem, type RangeItem } from "./helpers";

type YearsRenderProps = {
	years: RangeItem[];
};

type YearsProps = {
	children: (props: YearsRenderProps) => ReactNode;
};

/**
 * Supplies `years` range based on min/max props.
 */
const Years = ({ children }: YearsProps): ReactNode => {
	const { range: dateRange } = useContext(DatePickerContext);

	if (!dateRange || !dateRange.start || !dateRange.end) {
		return children({ years: [] });
	}

	const years = range(dateRange.start.year, dateRange.end.year + 1).map((y) => formatRangeItem(y));
	return children({ years });
};

export default Years;
