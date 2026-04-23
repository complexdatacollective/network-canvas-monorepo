import { find, times } from "es-toolkit/compat";
import React, { useEffect } from "react";
import { cva, cx } from "~/utils/cva";
import type { RangeItem } from "./DatePicker/helpers";

type RangePickerType = "year" | "month" | "day";

type RangePickerProps = {
	type?: RangePickerType | null;
	today?: number | null;
	range: RangeItem[];
	value?: number | null;
	onSelect?: (value: number) => void;
	offset?: number;
};

// The year grid alternates 5-column stripe bands (rows 1-2 shaded, 3 unshaded, repeat)
// by tagging every 10th-sequence of items. Day/month follow analogous even/odd band rules.
// We use nth-child selectors via arbitrary variants to preserve the stripe pattern.
const rangePickerVariants = cva({
	base: cx("absolute top-0 left-0 h-full w-full overflow-y-auto pt-0"),
	variants: {
		type: {
			year: "[overflow-x:hidden] [-webkit-overflow-scrolling:touch]",
			month: "",
			day: "",
		},
	},
});

const rangePickerItemsVariants = cva({
	base: cx("relative top-0 left-0 grid h-full w-full"),
	variants: {
		type: {
			year: cx(
				"grid-cols-5 grid-rows-[minmax(auto,5rem)] py-[calc(0.6rem*2)]",
				// Shade first 5 of every 10-item band (two visual rows of 5)
				"[&>[data-range-item]:nth-child(10n-9)]:bg-white/5",
				"[&>[data-range-item]:nth-child(10n-8)]:bg-white/5",
				"[&>[data-range-item]:nth-child(10n-7)]:bg-white/5",
				"[&>[data-range-item]:nth-child(10n-6)]:bg-white/5",
				"[&>[data-range-item]:nth-child(10n-5)]:bg-white/5",
			),
			month: cx(
				"grid-cols-3",
				"[&>[data-range-item]:nth-child(6n-5)]:bg-white/5",
				"[&>[data-range-item]:nth-child(6n-4)]:bg-white/5",
				"[&>[data-range-item]:nth-child(6n-3)]:bg-white/5",
			),
			day: cx(
				"grid-cols-7",
				"[&>[data-range-item]:nth-child(14n-13)]:bg-white/5",
				"[&>[data-range-item]:nth-child(14n-12)]:bg-white/5",
				"[&>[data-range-item]:nth-child(14n-11)]:bg-white/5",
				"[&>[data-range-item]:nth-child(14n-10)]:bg-white/5",
				"[&>[data-range-item]:nth-child(14n-9)]:bg-white/5",
				"[&>[data-range-item]:nth-child(14n-8)]:bg-white/5",
				"[&>[data-range-item]:nth-child(14n-7)]:bg-white/5",
			),
		},
	},
});

const rangeItemVariants = cva({
	base: cx("flex cursor-pointer items-center justify-center"),
	variants: {
		type: {
			year: "box-border max-h-20 py-4",
			month: "",
			day: "",
		},
		isDisabled: {
			true: "pointer-events-none opacity-15",
			false: "",
		},
	},
});

// Highlight pill around each value; becomes filled when selected; bold when "today".
const rangeHighlightVariants = cva({
	base: cx(
		"box-border flex items-center justify-center rounded-[5rem]",
		"px-[calc(0.6rem*2)] py-3",
		"transition-colors duration-200",
	),
	variants: {
		isActive: {
			true: "bg-sea-green",
			false: "bg-transparent",
		},
		isToday: {
			true: "font-bold",
			false: "",
		},
	},
});

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

const RangePicker = ({
	type = null,
	range,
	today = null,
	value = null,
	onSelect = () => {},
	offset = 0,
}: RangePickerProps) => {
	const variantType = type ?? undefined;
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

	const padding = times(offset, (index) => (
		<div
			key={`padding${index}`}
			data-range-item
			className={rangeItemVariants({ type: variantType, isDisabled: false })}
		/>
	));

	const scrollToValue = getScrollToValue(range, today);
	return (
		<div className={rangePickerVariants({ type: variantType })} ref={datePickerRef}>
			<div className={rangePickerItemsVariants({ type: variantType })}>
				{padding}
				{range.map((d) => {
					const ref = scrollToValue === d.value ? scrollRef : null;
					const isActive = value === d.value;
					const isToday = today === d.value;

					return (
						<button
							type="button"
							data-range-item
							className={rangeItemVariants({ type: variantType, isDisabled: !!d.isOutOfRange })}
							onClick={() => onSelect(d.value)}
							aria-label={`Select ${d.label}`}
							disabled={d.isOutOfRange}
							ref={ref}
							data-value={d.value}
							key={`item${d.value}`}
						>
							<div className={rangeHighlightVariants({ isActive, isToday })}>{d.label}</div>
						</button>
					);
				})}
			</div>
		</div>
	);
};

export default RangePicker;
