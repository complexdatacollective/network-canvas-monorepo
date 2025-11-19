declare module "luxon" {
	export interface DateTimeOptions {
		zone?: string;
		locale?: string;
	}

	export interface DateObjectUnits {
		year?: number | null;
		month?: number | null;
		day?: number | null;
		hour?: number | null;
		minute?: number | null;
		second?: number | null;
		millisecond?: number | null;
	}

	export class DateTime {
		static now(): DateTime;
		static fromISO(text: string, opts?: DateTimeOptions): DateTime;
		static fromObject(obj: DateObjectUnits): DateTime;

		year: number;
		month: number;
		day: number;
		hour: number;
		minute: number;
		second: number;
		millisecond: number;

		toObject(): DateObjectUnits;
		toISO(): string;
		toISODate(): string;
		toFormat(fmt: string): string;
		plus(duration: DurationObject): DateTime;
		minus(duration: DurationObject): DateTime;
		startOf(unit: string): DateTime;
		endOf(unit: string): DateTime;
		diff(other: DateTime, unit?: string | string[]): Duration;

		isValid: boolean;
		invalidReason: string | null;
	}

	export interface DurationObject {
		years?: number;
		months?: number;
		weeks?: number;
		days?: number;
		hours?: number;
		minutes?: number;
		seconds?: number;
		milliseconds?: number;
	}

	export class Duration {
		static fromObject(obj: DurationObject): Duration;

		years: number;
		months: number;
		weeks: number;
		days: number;
		hours: number;
		minutes: number;
		seconds: number;
		milliseconds: number;

		toObject(): DurationObject;
	}

	export interface IntervalObject {
		start: DateTime;
		end: DateTime;
	}

	export class Interval {
		static fromDateTimes(start: DateTime, end: DateTime): Interval;
		static fromISO(text: string): Interval;

		start: DateTime;
		end: DateTime;

		contains(dateTime: DateTime): boolean;
		length(unit?: string): number;
		isValid: boolean;
		invalidReason: string | null;
	}
}
