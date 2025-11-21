import cx from "classnames";
import { find, times } from "lodash";
import React, { useEffect } from "react";
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

	const findToday = find(range, ({ value }) => value === today);
	if (findToday) {
		return findToday.value;
	}

	const first = range[0].value;
	const last = range[range.length - 1].value;

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
	const datePickerRef = React.createRef<HTMLDivElement>();
	const scrollRef = React.createRef<HTMLDivElement>();

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

	const classes = cx("date-picker__range-picker", { [`date-picker__range-picker--${type}`]: !!type });

	const padding = times(offset, (index) => <div key={`padding${index}`} className="date-picker__range-item" />);

	const handleKeyDown = (itemValue: number) => (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onSelect(itemValue);
		}
	};

	const scrollToValue = getScrollToValue(range, today);
	return (
		<div className={classes} ref={datePickerRef}>
			<div className="date-picker__range-picker-items">
				{padding}
				{range.map((d) => {
					const itemStyle = cx(
						"date-picker__range-item",
						{ "date-picker__range-item--is-active": value === d.value },
						{ "date-picker__range-item--is-today": today === d.value },
						{ "date-picker__range-item--is-disabled": d.isOutOfRange },
					);
					const ref = scrollToValue === d.value ? scrollRef : null;

					return (
						<div
							className={itemStyle}
							onClick={() => onSelect(d.value)}
							onKeyDown={handleKeyDown(d.value)}
							role="button"
							tabIndex={d.isOutOfRange ? -1 : 0}
							aria-label={`Select ${d.label}`}
							aria-disabled={d.isOutOfRange}
							ref={ref}
							data-value={d.value}
							key={`item${d.value}`}
						>
							<div className="date-picker__highlight">{d.label}</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default RangePicker;
