import { difference, get, intersection } from "lodash";
import { DateTime, Info } from "luxon";

export const now = () => DateTime.local();

export const isEmpty = (value: any) => value === null || value === "";

export const getFirstDayOfMonth = (dateObj: { year?: number | null; month?: number | null; day?: number | null }) =>
	DateTime.fromObject({ ...dateObj, day: 1 }).toFormat("c");

export const asNullObject = (keys: string[]) => keys.reduce((acc, key) => ({ ...acc, [key]: null }), {});

export const getProperties = (obj: Record<string, any>) =>
	Object.keys(obj).reduce<string[]>((acc, key) => {
		if (!obj[key]) {
			return acc;
		}
		return [...acc, key];
	}, []);

export const hasProperties =
	(includes: string[] = [], excludes: string[] = []) =>
	(obj: Record<string, any>) => {
		const props = getProperties(obj);
		const hasIncludes = difference(includes, props).length === 0;
		const noExcludes = intersection(props, excludes).length === 0;
		return hasIncludes && noExcludes;
	};

export const getMonthName = (numericMonth: number) => get(Info.months(), numericMonth - 1, numericMonth);
