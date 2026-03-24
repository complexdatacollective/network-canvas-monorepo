import { useMemo } from "react";
import { change, formValueSelector } from "redux-form";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
import type { RootState } from "~/ducks/store";
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
		<div className="shape-variable-mapping">
			<div className="shape-variable-mapping__toggle">
				<label className="shape-variable-mapping__toggle-label">
					<span>Map variable to shape</span>
					<button
						type="button"
						className={`shape-variable-mapping__toggle-btn ${enabled ? "shape-variable-mapping__toggle-btn--active" : ""}`}
						onClick={handleToggle}
						aria-pressed={enabled}
					>
						<span className="shape-variable-mapping__toggle-knob" />
					</button>
				</label>
				<p className="shape-variable-mapping__description">Override the default shape based on a variable's value.</p>
			</div>

			{enabled && (
				<div className="shape-variable-mapping__config">
					<div className="shape-variable-mapping__select-wrapper">
						<label className="shape-variable-mapping__field-label">Variable</label>
						<select
							className="shape-variable-mapping__select"
							value={selectedVarId ?? ""}
							onChange={(e) => handleVariableChange(e.target.value)}
						>
							<option value="" disabled>
								Select a variable...
							</option>
							{eligibleVariables.map((v) => (
								<option key={v.id} value={v.id}>
									{v.name} ({v.type})
								</option>
							))}
						</select>
					</div>

					{selectedVar && dynamic?.type === "discrete" && (
						<div className="shape-variable-mapping__mapping">
							<label className="shape-variable-mapping__field-label">Shape for each value</label>
							{getDiscreteOptions().map((option) => {
								const currentShape = getShapeForValue(option.value);
								return (
									<div key={String(option.value)} className="shape-variable-mapping__row">
										<span className="shape-variable-mapping__row-label">{option.label}</span>
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
								<p className="shape-variable-mapping__warning">
									Some values are unmapped and will use the default shape.
								</p>
							)}
						</div>
					)}

					{selectedVar && dynamic?.type === "breakpoints" && (
						<div className="shape-variable-mapping__mapping">
							<label className="shape-variable-mapping__field-label">Thresholds</label>
							<div className="shape-variable-mapping__row shape-variable-mapping__row--muted">
								<span className="shape-variable-mapping__row-label">Below first threshold</span>
								<span className="shape-variable-mapping__row-hint">uses default shape</span>
							</div>
							{(dynamic.thresholds ?? []).map((threshold, index) => (
								<div key={`threshold-${threshold.value}`} className="shape-variable-mapping__row">
									<span className="shape-variable-mapping__threshold-prefix">≥</span>
									<input
										type="number"
										className="shape-variable-mapping__threshold-input"
										value={threshold.value}
										onChange={(e) => handleThresholdValueChange(index, Number.parseFloat(e.target.value) || 0)}
										onBlur={() => {
											const sorted = [...(dynamic.thresholds ?? [])].sort((a, b) => a.value - b.value);
											dispatch(change(form, "shape.dynamic.thresholds", sorted));
										}}
									/>
									<span className="shape-variable-mapping__threshold-arrow">→</span>
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
										className="shape-variable-mapping__remove-btn"
										onClick={() => handleRemoveThreshold(index)}
										aria-label="Remove threshold"
									>
										×
									</button>
								</div>
							))}
							{(dynamic.thresholds ?? []).length < 2 && (
								<button type="button" className="shape-variable-mapping__add-btn" onClick={handleAddThreshold}>
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
