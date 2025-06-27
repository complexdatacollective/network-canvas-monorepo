import { createContext } from "react";
import type { Interval } from "luxon";
import type { DateObject } from "./helpers";

export interface DatePickerContextType {
	onChange: (values: Partial<DateObject>) => void;
	range: Interval | null;
	date: DateObject;
	type: string | null;
}

const DatePickerContext = createContext<DatePickerContextType>({
	onChange: () => {},
	range: null,
	date: { year: null, month: null, day: null },
	type: null,
});

export default DatePickerContext;
