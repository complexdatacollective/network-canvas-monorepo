import { useMemo } from "react";
import { change, formValueSelector } from "redux-form";
import VariablePicker from "~/components/Form/Fields/VariablePicker/VariablePicker";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
import type { RootState } from "~/ducks/store";
import { cx } from "~/utils/cva";
import ShapePicker from "./ShapePicker";

const DISCRETE_TYPES = new Set(["categorical", "ordinal", "boolean"]);
const BREAKPOINT_TYPES = new Set(["number", "scalar"]);
const ELIGIBLE_TYPES = new Set([...DISCRETE_TYPES, ...BREAKPOINT_TYPES]);

type Variable = {
	name: string;
	type: string;
	options?: Array<{ label: string; value: string | number | boolean }>;
};

type ShapeVariableMappingProps = {
	form: string;
	nodeColor?: string;
};

const ShapeVariableMapping = ({ form, nodeColor }: ShapeVariableMappingProps) => {
	const dispatch = useAppDispatch();
	const formSelector = useMemo(() => formValueSelector(form), [form]);

	const variables = useAppSelector((state: RootState) => formSelector(state, "variables")) as
		| Record<string, Variable>
		| undefined;
	const dynamic = useAppSelector((state: RootState) => formSelector(state, "shape.dynamic")) as
		| {
				variable?: string;
				type?: string;
				map?: Array<{ value: string | number | boolean; shape: string }>;
				thresholds?: Array<{ value: number; shape: string }>;
		  }
		| undefined;
	const enabled = !!dynamic;

	const eligibleVariables = useMemo(() => {
		if (!variables) return [];
		return Object.entries(variables)
			.filter(([, v]) => ELIGIBLE_TYPES.has(v.type))
			.map(([id, v]) => ({ id, name: v.name, type: v.type, options: v.options }));
	}, [variables]);

	const variableOptions = useMemo(() => {
		return eligibleVariables.map((v) => ({ label: v.name, value: v.id, type: v.type }));
	}, [eligibleVariables]);

	const selectedVarId = dynamic?.variable;
	const selectedVar = selectedVarId && variables ? variables[selectedVarId] : undefined;

	const handleToggle = () => {
		if (enabled) {
			dispatch(change(form, "shape.dynamic", undefined));
		} else {
			dispatch(change(form, "shape.dynamic", {}));
		}
	};

	const handleVariableChange = (varId: string) => {
		const variable = variables?.[varId];
		if (!variable) return;

		const mappingType = DISCRETE_TYPES.has(variable.type) ? "discrete" : "breakpoints";
		if (mappingType === "discrete") {
			dispatch(change(form, "shape.dynamic", { variable: varId, type: "discrete", map: [] }));
		} else {
			dispatch(change(form, "shape.dynamic", { variable: varId, type: "breakpoints", thresholds: [] }));
		}
	};

	const handleDiscreteShapeChange = (value: string | number | boolean, shape: string) => {
		const currentMap = dynamic?.map ?? [];
		const existingIndex = currentMap.findIndex((entry) => JSON.stringify(entry.value) === JSON.stringify(value));

		let newMap: Array<{ value: string | number | boolean; shape: string }>;
		if (existingIndex >= 0) {
			newMap = currentMap.map((entry, i) => (i === existingIndex ? { ...entry, shape } : entry));
		} else {
			newMap = [...currentMap, { value, shape }];
		}

		dispatch(change(form, "shape.dynamic.map", newMap));
	};

	const handleThresholdValueChange = (index: number, value: number) => {
		const currentThresholds = dynamic?.thresholds ?? [];
		const newThresholds = currentThresholds.map((t, i) => (i === index ? { ...t, value } : t));
		newThresholds.sort((a, b) => a.value - b.value);
		dispatch(change(form, "shape.dynamic.thresholds", newThresholds));
	};

	const handleThresholdShapeChange = (index: number, shape: string) => {
		const currentThresholds = dynamic?.thresholds ?? [];
		const newThresholds = currentThresholds.map((t, i) => (i === index ? { ...t, shape } : t));
		dispatch(change(form, "shape.dynamic.thresholds", newThresholds));
	};

	const handleAddThreshold = () => {
		const currentThresholds = dynamic?.thresholds ?? [];
		if (currentThresholds.length >= 2) return;
		const newThresholds = [...currentThresholds, { value: 0, shape: "square" }];
		dispatch(change(form, "shape.dynamic.thresholds", newThresholds));
	};

	const handleRemoveThreshold = (index: number) => {
		const currentThresholds = dynamic?.thresholds ?? [];
		const newThresholds = currentThresholds.filter((_, i) => i !== index);
		dispatch(change(form, "shape.dynamic.thresholds", newThresholds));
	};

	const getDiscreteOptions = (): Array<{ label: string; value: string | number | boolean }> => {
		if (!selectedVar) return [];
		if (selectedVar.type === "boolean") {
			if (selectedVar.options) {
				return selectedVar.options;
			}
			return [
				{ label: "True", value: true },
				{ label: "False", value: false },
			];
		}
		return selectedVar.options ?? [];
	};

	const getShapeForValue = (value: string | number | boolean): string => {
		const entry = dynamic?.map?.find((m) => JSON.stringify(m.value) === JSON.stringify(value));
		return entry?.shape ?? "";
	};

	return (
		<div className="mt-(--space-md)">
			<div className="py-(--space-sm) border-t border-surface-2">
				<label className="flex items-center justify-between font-semibold cursor-pointer">
					<span>Map variable to shape</span>
					<button
						type="button"
						className={cx(
							"relative w-[44px] h-[24px] rounded-[12px] border-0 cursor-pointer",
							"transition-colors duration-(--animation-duration-standard) ease-(--animation-easing)",
							enabled ? "bg-active" : "bg-surface-2",
						)}
						onClick={handleToggle}
						aria-pressed={enabled}
					>
						<span
							className={cx(
								"absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white",
								"transition-transform duration-(--animation-duration-standard) ease-(--animation-easing)",
								enabled && "translate-x-[20px]",
							)}
						/>
					</button>
				</label>
				<p className="text-sm text-muted-foreground mt-(--space-xs)">
					Override the default shape based on a variable's value.
				</p>
			</div>

			{enabled && (
				<div className="mt-(--space-md) flex flex-col gap-(--space-md)">
					<VariablePicker
						label="Variable"
						options={variableOptions}
						disallowCreation
						input={{
							value: selectedVarId,
							onChange: handleVariableChange,
						}}
					/>

					{selectedVar && dynamic?.type === "discrete" && (
						<div className="flex flex-col gap-(--space-xs)">
							<h4 className="block text-sm text-muted-foreground mb-(--space-xs) text-base font-semibold">
								Shape for each value
							</h4>
							{getDiscreteOptions().map((option) => {
								const currentShape = getShapeForValue(option.value);
								return (
									<div
										key={String(option.value)}
										className="flex items-center gap-(--space-sm) bg-surface-1 py-(--space-xs) px-(--space-sm)"
									>
										<span className="flex-1 text-sm">{option.label}</span>
										<ShapePicker
											small
											input={{
												value: currentShape,
												onChange: (shape: string) => handleDiscreteShapeChange(option.value, shape),
											}}
											meta={{}}
										/>
									</div>
								);
							})}
							{getDiscreteOptions().some((opt) => !getShapeForValue(opt.value)) && (
								<p className="text-xs text-warning mt-(--space-xs)">
									Some values are unmapped and will use the default shape.
								</p>
							)}
						</div>
					)}

					{selectedVar && dynamic?.type === "breakpoints" && (
						<div className="flex flex-col gap-(--space-xs)">
							<h4 className="block text-sm text-muted-foreground mb-(--space-xs)">Thresholds</h4>
							<div className="flex items-center gap-(--space-sm) bg-surface-1 py-(--space-xs) px-(--space-sm) opacity-60">
								<span className="flex-1 text-sm">Below first threshold</span>
								<span className="text-xs text-muted-foreground">uses default shape</span>
							</div>
							{(dynamic.thresholds ?? []).map((threshold, index) => (
								<div
									key={`threshold-${threshold.value}`}
									className="flex items-center gap-(--space-sm) bg-surface-1 py-(--space-xs) px-(--space-sm)"
								>
									<span className="text-sm text-muted-foreground">≥</span>
									<input
										type="number"
										className="w-[70px] bg-surface-2 border border-surface-2 rounded-[4px] p-(--space-xs) text-center text-foreground"
										value={threshold.value}
										onChange={(e) => handleThresholdValueChange(index, Number.parseFloat(e.target.value) || 0)}
										onBlur={() => {
											const sorted = [...(dynamic.thresholds ?? [])].sort((a, b) => a.value - b.value);
											dispatch(change(form, "shape.dynamic.thresholds", sorted));
										}}
									/>
									<span className="text-sm text-muted-foreground">→</span>
									<ShapePicker
										small
										nodeColor={nodeColor}
										input={{
											value: threshold.shape,
											onChange: (shape: string) => handleThresholdShapeChange(index, shape),
										}}
										meta={{}}
									/>
									<button
										type="button"
										className="bg-transparent border-0 text-muted-foreground cursor-pointer text-xl px-(--space-xs) leading-none hover:text-error"
										onClick={() => handleRemoveThreshold(index)}
										aria-label="Remove threshold"
									>
										×
									</button>
								</div>
							))}
							{(dynamic.thresholds ?? []).length < 2 && (
								<button
									type="button"
									className="bg-surface-1 border border-dashed border-surface-2 text-muted-foreground p-(--space-xs) cursor-pointer text-sm mt-(--space-xs) hover:border-muted-foreground"
									onClick={handleAddThreshold}
								>
									+ Add threshold
								</button>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default ShapeVariableMapping;
