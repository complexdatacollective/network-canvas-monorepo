import { find, times } from "es-toolkit/compat";
import React, { useEffect } from "react";
import { cx } from "~/utils/cva";
import type { RangeItem } from "./DatePicker/helpers";

type RangePickerProps = {
	type?: string | null;
	today?: number | null;
	range: RangeItem[];
	value?: number | null;
	onSelect?: (value: number) => void;
	offset?: number;
};

// If today's date isn't in range, what's the closest value?
const getScrollToValue = (range: RangeItem[], today: number | null | undefined) => {
	if (today !== 0 && !today) {
		return null;
	}

	if (range.length === 0) {
		return null;
	}

	const findToday = find(range, ({ value }) => value === today);
	if (findToday) {
		return findToday.value;
	}

	const first = range[0]?.value;
	const last = range[range.length - 1]?.value;

	if (first === undefined || last === undefined) {
		return null;
	}

	if (Math.abs(today - first) < Math.abs(today - last)) {
		return first;
	}

	return last;
};

// The outer is the scroll container for all picker types. Year additionally
// hides horizontal overflow so the year list can scroll vertically without
// the (5rem) tall rows nudging horizontally.
const pickerBase = "absolute top-0 left-0 h-full w-full overflow-y-auto pt-0!";
const pickerYear = "overflow-x-hidden";

// Each grid layout tints alternating "rows" (column-count items per row,
// every other row). The :is() lists are spelled out per-type because Tailwind
// arbitrary variants can't accept dynamic step counts. The year inner grid
// keeps a constrained height so that the items overflow into the outer
// scroller — `getScrollToValue` + the useEffect below scroll the outer.
const yearGrid =
	"grid-cols-5 [grid-template-rows:minmax(auto,_var(--space-3xl))] py-(--space-md) [&>*]:max-h-(--space-3xl) [&>*]:py-(--space-md) [height:calc(100%_-_3rem)] [&>*:is(:nth-child(10n+1),:nth-child(10n+2),:nth-child(10n+3),:nth-child(10n+4),:nth-child(10n+5))]:bg-(--datepicker-row-tint)";
const monthGrid = "grid-cols-3 [&>*:is(:nth-child(6n+1),:nth-child(6n+2),:nth-child(6n+3))]:bg-(--datepicker-row-tint)";
const dayGrid =
	"grid-cols-7 [&>*:is(:nth-child(14n+1),:nth-child(14n+2),:nth-child(14n+3),:nth-child(14n+4),:nth-child(14n+5),:nth-child(14n+6),:nth-child(14n+7))]:bg-(--datepicker-row-tint)";

const itemBase = "flex cursor-pointer items-center justify-center";

const highlightBase =
	"flex items-center justify-center box-border rounded-full px-(--space-md) py-(--space-sm) transition-colors duration-(--animation-duration-fast) ease-(--animation-easing)";

const RangePicker = ({
	type = null,
	range,
	today = null,
	value = null,
	onSelect = () => {},
	offset = 0,
}: RangePickerProps) => {
	const datePickerRef = React.createRef<HTMLDivElement | null>();
	const scrollRef = React.createRef<HTMLButtonElement | null>();

	const _datePickerKey = !!datePickerRef.current;
	const _scrollRefKey = scrollRef.current?.getAttribute("data-value");
	const _rangeKey = range.toString();

	useEffect(() => {
		// only scroll year
		if (type !== "year") {
			return;
		}
		// only scroll when value is empty
		if (value !== null) {
			return;
		}
		if (!datePickerRef.current || !scrollRef.current) {
			return;
		}
		const { offsetTop } = scrollRef.current;
		const { offsetHeight } = scrollRef.current;
		datePickerRef.current.scrollTop = offsetTop - offsetHeight * 0.5;
	}, [value, type, datePickerRef.current, scrollRef.current]);

	const padding = times(offset, (index) => <div key={`padding${index}`} className={itemBase} />);

	const scrollToValue = getScrollToValue(range, today);
	return (
		<div className={cx(pickerBase, type === "year" && pickerYear)} ref={datePickerRef}>
			<div
				className={cx(
					"relative top-0 left-0 grid h-full w-full",
					type === "year" && yearGrid,
					type === "month" && monthGrid,
					type === "day" && dayGrid,
				)}
			>
				{padding}
				{range.map((d) => {
					const isActive = value === d.value;
					const isToday = today === d.value;
					const ref = scrollToValue === d.value ? scrollRef : null;

					return (
						<button
							type="button"
							className={cx(itemBase, d.isOutOfRange && "pointer-events-none opacity-15")}
							onClick={() => onSelect(d.value)}
							aria-label={`Select ${d.label}`}
							disabled={d.isOutOfRange}
							ref={ref}
							data-value={d.value}
							key={`item${d.value}`}
						>
							<div className={cx(highlightBase, isActive && "bg-active", isToday && "font-bold")}>{d.label}</div>
						</button>
					);
				})}
			</div>
		</div>
	);
};

export default RangePicker;
