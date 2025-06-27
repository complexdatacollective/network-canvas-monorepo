import { DateTime, Info } from "luxon";
import { isEqual, get } from "lodash";

export const now = () => DateTime.local();

export interface DateObject {
	year: number | null;
	month: number | null;
	day: number | null;
}

/**
 * Is date object fully complete?
 */
export const isComplete =
	(type: string | null) =>
	({ day, month, year }: DateObject) => {
		switch (type) {
			case "year":
				return !!year;
			case "month":
				return !!year && !!month;
			default:
				return !!year && !!month && !!day;
		}
	};

/**
 * Is date object empty
 */
export const isEmpty = () => (date: DateObject) => isEqual(date, { year: null, month: null, day: null });

export const getMonthName = (numericMonth: number) => get(Info.months(), numericMonth - 1, numericMonth);

export interface RangeItem {
	value: number;
	label: string | number;
	isOutOfRange?: boolean;
}

export const formatRangeItem = (value: number, props: Partial<RangeItem> = {}): RangeItem => ({
	value,
	label: value,
	...props,
});
