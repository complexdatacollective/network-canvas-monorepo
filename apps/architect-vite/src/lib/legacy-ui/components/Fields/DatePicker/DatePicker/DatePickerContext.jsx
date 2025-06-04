import { createContext } from "react";

const DatePickerContext = createContext({
	onChange: () => {},
	range: null,
	date: {},
	type: null,
});

export default DatePickerContext;
