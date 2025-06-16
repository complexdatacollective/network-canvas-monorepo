import { ReactNode, useContext } from "react";
import { Interval } from "luxon";
import DatePickerContext from "./DatePickerContext";
import { isComplete, isEmpty, DateObject } from "./helpers";

interface DateRenderProps {
	onChange: (values: Partial<DateObject>) => void;
	date: DateObject;
	range: Interval | null;
	type: string | null;
	isComplete: boolean;
	isEmpty: boolean;
}

interface DateProps {
	children: (props: DateRenderProps) => ReactNode;
}

const Date = ({ children }: DateProps) => {
	const { onChange, date, range, type } = useContext(DatePickerContext);

	return children({
		onChange,
		date,
		range,
		type,
		isComplete: isComplete(type)(date),
		isEmpty: isEmpty(type)(date),
	}) as JSX.Element;
};

export default Date;