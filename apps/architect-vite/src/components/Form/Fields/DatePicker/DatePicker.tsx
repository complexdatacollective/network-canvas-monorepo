import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { type FocusEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import useScrollTo from "~/lib/legacy-ui/hooks/useScrollTo";
import DateComponent from "./DatePicker/DateComponent";
import DatePicker from "./DatePicker/DatePicker";
import Days from "./DatePicker/Days";
import Months from "./DatePicker/Months";
import Years from "./DatePicker/Years";
import DatePreview from "./DatePreview";
import { getFirstDayOfMonth, hasProperties, isEmpty, now } from "./helpers";
import Panel from "./Panel";
import Panels from "./Panels";
import RangePicker from "./RangePicker";

type DatePickerInputProps = {
	onChange?: (value: string) => void;
	value?: string | null;
	parameters?: Record<string, unknown>;
	parentRef: RefObject<HTMLElement | null>;
	placeholder?: string | null;
};

const DatePickerInput = ({
	onChange: onChangeInput = () => {},
	value = null,
	parameters = {},
	parentRef,
	placeholder = null,
}: DatePickerInputProps) => {
	const ref = useRef<HTMLDivElement>(null);

	const [panelsOpen, setPanelsOpen] = useState(false);

	const handleChange = useCallback(
		(newValue: string) => {
			if (newValue !== "") {
				setPanelsOpen(false);
			}
			if (newValue !== value) {
				onChangeInput(newValue);
			}
		},
		[value, onChangeInput],
	);

	const handleClickOutside = useCallback((e: MouseEvent) => {
		if (ref.current?.contains(e.target as Node)) {
			// inside click
			return;
		}
		// outside click
		setPanelsOpen(false);
	}, []);

	useScrollTo(parentRef, (panelsOpenArg: unknown) => !!panelsOpenArg, [panelsOpen, parentRef]);

	useEffect(() => {
		if (panelsOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		} else {
			document.removeEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [panelsOpen, handleClickOutside]);

	// treat empty string as no value (for Redux Forms)
	const initialDate = isEmpty(value) ? null : value;
	const handleClickPreview = (open = true) => setPanelsOpen(open);
	const today = now().toObject();

	const handleFocus = () => {
		if (isEmpty(value)) {
			setPanelsOpen(true);
		}
	};

	return (
		<DatePicker
			onChange={handleChange}
			date={initialDate}
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...parameters}
		>
			<DateComponent>
				{({ date, range: dateRange, isComplete, type, onChange }) => {
					const canSetMonth = ["full", "month"].includes(type || "");
					const canSetDay = ["full"].includes(type || "");
					const isYearActive = hasProperties([], ["year"])(date);
					const isYearComplete = hasProperties(["year"])(date);
					const isMonthActive = hasProperties(["year"], ["month"])(date);
					const isMonthComplete = hasProperties(["month"])(date);
					const isDayActive = hasProperties(["year", "month"], ["day"])(date);
					const isDayComplete = hasProperties(["day"])(date);
					const todayYear = today.year || null;
					const todayMonth = date.year === today.year ? today.month : null;
					const todayDay = date.year === today.year && date.month === today.month ? today.day : null;

					const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
						if (e.target !== e.currentTarget) {
							return;
						}
						// dump incomplete state
						if (!isComplete) {
							onChange({ year: null, month: null, day: null });
						}
					};

					return (
						<LayoutGroup>
							<motion.div
								className="relative max-w-full"
								style={
									{
										"--datepicker-panel-height": "18rem",
										"--datepicker-preview-height": "4rem",
										"--datepicker-popover-max-width": "30rem",
										"--datepicker-row-tint": "rgb(255 255 255 / 0.05)",
									} as React.CSSProperties
								}
								onBlur={handleBlur}
								onFocus={handleFocus}
								tabIndex={0}
								role="button"
							>
								<DatePreview onClick={handleClickPreview} isActive={panelsOpen} placeholder={placeholder} />
								<motion.div
									ref={ref}
									layout
									className="absolute z-(--z-global-ui) mb-(--space-2xl) w-full max-w-(--datepicker-popover-max-width) shadow-(--modal-window-box-shadow)"
								>
									<AnimatePresence>
										{panelsOpen && (
											<Panels>
												<Panel isActive={isYearActive} isComplete={isYearComplete}>
													<Years>
														{({ years }) => (
															<RangePicker
																type="year"
																today={todayYear}
																range={years}
																value={date.year}
																offset={dateRange?.start ? dateRange.start.year % 5 : 0}
																onSelect={(y) => onChange({ year: y, month: null, day: null })}
															/>
														)}
													</Years>
												</Panel>
												{canSetMonth && (
													<Panel isActive={isMonthActive} isComplete={isMonthComplete}>
														<Months>
															{({ months }) => (
																<RangePicker
																	type="month"
																	today={todayMonth}
																	range={months}
																	value={date.month}
																	onSelect={(m) => onChange({ month: m, day: null })}
																/>
															)}
														</Months>
													</Panel>
												)}
												{canSetDay && (
													<Panel isActive={isDayActive} isComplete={isDayComplete}>
														<Days>
															{({ days }) => (
																<RangePicker
																	type="day"
																	today={todayDay}
																	range={days}
																	value={date.day}
																	offset={getFirstDayOfMonth(date) - 1}
																	onSelect={(d) => onChange({ day: d })}
																/>
															)}
														</Days>
													</Panel>
												)}
											</Panels>
										)}
									</AnimatePresence>
								</motion.div>
							</motion.div>
						</LayoutGroup>
					);
				}}
			</DateComponent>
		</DatePicker>
	);
};

export default DatePickerInput;
