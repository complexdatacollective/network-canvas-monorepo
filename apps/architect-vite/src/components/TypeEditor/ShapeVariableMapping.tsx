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

const rowClasses =
	"bg-surface-1 flex items-center gap-[var(--space-sm)] rounded px-[var(--space-sm)] py-[var(--space-xs)]";
const fieldLabelClasses = "text-text/70 mb-[var(--space-xs)] block text-sm";

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
		<div className="mt-[var(--space-md)]">
			<div className="border-surface-2 border-t py-[var(--space-sm)]">
				<label className="flex cursor-pointer items-center justify-between font-semibold">
					<span>Map variable to shape</span>
					<button
						type="button"
						className={cx(
							"relative h-6 w-11 cursor-pointer rounded-full border-none transition-colors duration-200",
							enabled ? "bg-active" : "bg-surface-2",
						)}
						onClick={handleToggle}
						aria-pressed={enabled}
					>
						<span
							className={cx(
								"absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-white transition-transform duration-200",
								enabled && "translate-x-[20px]",
							)}
						/>
					</button>
				</label>
				<p className="text-text/70 mt-[var(--space-xs)] text-sm">
					Override the default shape based on a variable's value.
				</p>
			</div>

			{enabled && (
				<div className="mt-[var(--space-md)] flex flex-col gap-[var(--space-md)]">
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
						<div className="flex flex-col gap-[var(--space-xs)]">
							<h4 className={cx(fieldLabelClasses, "text-base font-semibold")}>Shape for each value</h4>
							{getDiscreteOptions().map((option) => {
								const currentShape = getShapeForValue(option.value);
								return (
									<div key={String(option.value)} className={rowClasses}>
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
								<p className="text-warning mt-[var(--space-xs)] text-xs">
									Some values are unmapped and will use the default shape.
								</p>
							)}
						</div>
					)}

					{selectedVar && dynamic?.type === "breakpoints" && (
						<div className="flex flex-col gap-[var(--space-xs)]">
							<h4 className={fieldLabelClasses}>Thresholds</h4>
							<div className={cx(rowClasses, "opacity-60")}>
								<span className="flex-1 text-sm">Below first threshold</span>
								<span className="text-text/70 text-xs">uses default shape</span>
							</div>
							{(dynamic.thresholds ?? []).map((threshold, index) => (
								<div key={`threshold-${threshold.value}`} className={rowClasses}>
									<span className="text-text/70 text-sm">≥</span>
									<input
										type="number"
										className="bg-surface-2 border-surface-2 text-text w-[70px] rounded-sm border p-[var(--space-xs)] text-center"
										value={threshold.value}
										onChange={(e) => handleThresholdValueChange(index, Number.parseFloat(e.target.value) || 0)}
										onBlur={() => {
											const sorted = [...(dynamic.thresholds ?? [])].sort((a, b) => a.value - b.value);
											dispatch(change(form, "shape.dynamic.thresholds", sorted));
										}}
									/>
									<span className="text-text/70 text-sm">→</span>
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
										className="hover:text-destructive text-text/70 cursor-pointer border-none bg-transparent px-[var(--space-xs)] text-xl leading-none"
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
									className="bg-surface-1 border-surface-2 text-text/70 hover:border-text/70 mt-[var(--space-xs)] cursor-pointer rounded border border-dashed p-[var(--space-xs)] text-sm"
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
