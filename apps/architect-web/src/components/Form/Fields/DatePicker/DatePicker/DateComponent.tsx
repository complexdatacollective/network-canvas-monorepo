import type { Interval } from "luxon";
import { type ReactNode, useContext } from "react";
import DatePickerContext from "./DatePickerContext";
import { type DateObject, isComplete, isEmpty } from "./helpers";

type DateRenderProps = {
	onChange: (values: Partial<DateObject>) => void;
	date: DateObject;
	range: Interval | null;
	type: string | null;
	isComplete: boolean;
	isEmpty: boolean;
};

type DateProps = {
	children: (props: DateRenderProps) => ReactNode;
};

const DateComponent = ({ children }: DateProps): ReactNode => {
	const { onChange, date, range, type } = useContext(DatePickerContext);

	return children({
		onChange,
		date,
		range,
		type,
		isComplete: isComplete(type)(date),
		isEmpty: isEmpty(type)(date),
	});
};

export default DateComponent;
