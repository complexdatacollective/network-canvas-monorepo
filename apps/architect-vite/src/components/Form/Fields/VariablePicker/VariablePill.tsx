import type { VariableType } from "@codaco/protocol-validation";
import Tippy from "@tippyjs/react";
import cx from "classnames";
import { get } from "es-toolkit/compat";
import { AnimatePresence, motion } from "motion/react";
import React, { useMemo, useRef, useState } from "react";
import TextInput from "~/components/Form/Fields/Text";
import { getIconForType } from "~/config/variables";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
import { updateVariableByUUID } from "~/ducks/modules/protocol/codebook";
import type { RootState } from "~/ducks/store";
import { Icon } from "~/lib/legacy-ui/components";
import { getVariablesForSubject, makeGetVariableWithEntity } from "~/selectors/codebook";
import { cn } from "~/utils/cn";
import { validations } from "~/utils/validations";

const EDIT_COMPLETE_BUTTON_ID = "editCompleteButton";

type BaseVariablePillProps = {
	type: VariableType;
	children: React.ReactNode;
};

const BaseVariablePill = React.forwardRef<HTMLDivElement, BaseVariablePillProps>(({ type, children }, ref) => {
	const icon = useMemo(() => getIconForType(type), [type]);
	// const backgroundColor = useMemo(() => getColorForType(type), [type]);

	// TODO: remove these from the src/config/variables.ts file
	const iconClasses = cn(
		"variable-pill__icon",
		type === "number" && "bg-paradise-pink",
		type === "text" && "bg-cerulean-blue",
		type === "boolean" && "bg-neon-carrot",
		type === "ordinal" && "bg-sea-green",
		type === "categorical" && "bg-mustard",
		type === "scalar" && "bg-kiwi",
		type === "datetime" && "bg-tomato",
		type === "layout" && "bg-purple-pizazz",
		type === "location" && "bg-slate-blue-dark",
	);

	return (
		<motion.div className="variable-pill" ref={ref}>
			<div className={iconClasses}>
				<img className="icon" src={icon} alt={type} />
			</div>
			<div className="variable-pill__container">{children}</div>
		</motion.div>
	);
});

type SimpleVariablePillProps = {
	label: string;
} & BaseVariablePillProps;

export const SimpleVariablePill = ({ label, ...props }: SimpleVariablePillProps) => (
	// eslint-disable-next-line react/jsx-props-no-spreading
	<BaseVariablePill {...props}>
		<motion.h4>{label}</motion.h4>
	</BaseVariablePill>
);

type EditableVariablePillProps = {
	uuid: string;
};

const EditableVariablePill = ({ uuid }: EditableVariablePillProps) => {
	const dispatch = useAppDispatch();
	const ref = useRef<HTMLDivElement>(null);

	const [editing, setIsEditing] = useState(false);
	const [canSubmit, setCanSubmit] = useState(false);
	const [validation, setValidation] = useState<string | null>(null);

	const variableSelector = useMemo(() => makeGetVariableWithEntity(uuid), [uuid]);
	const variable = useAppSelector(variableSelector);
	const { name, type, entity, entityType } = variable ?? {};

	const [newName, setNewName] = useState(name ?? "");

	const handleCancel = () => {
		setIsEditing(false);
		setValidation(null);
		setNewName(name ?? "");
	};

	const handleBlur = (e: React.FocusEvent) => {
		// relatedTarget is the element that the focus event was fired from
		const target = get(e, "relatedTarget.id", null);

		// Don't cancel if the user clicked the submit button
		if (target === EDIT_COMPLETE_BUTTON_ID) {
			return;
		}
		handleCancel();
	};

	const onEditComplete = () => {
		const action = updateVariableByUUID(uuid, { name: newName }, true);
		dispatch(action);
		setValidation(null);
		setIsEditing(false);
	};

	const existingVariablesSelector = useMemo(
		() => (state: RootState) => {
			const validEntity = (entity || "") as "node" | "edge" | "ego";
			const validType = (entityType || "node") as "node" | "edge" | "ego";
			return getVariablesForSubject(state, {
				entity: validEntity,
				type: validType,
			});
		},
		[entity, entityType],
	);
	const existingVariables = useAppSelector(existingVariablesSelector);

	const existingVariableNames = useMemo(
		() =>
			Object.keys(existingVariables)
				.filter((variableId) => variableId !== uuid) // Exclude current variable being edited
				.map((variable) => get(existingVariables[variable], "name")),
		[existingVariables, uuid],
	);

	const handleUpdateName = (event: React.ChangeEvent<HTMLInputElement>) => {
		const {
			target: { value },
		} = event;
		setNewName(value);

		const required = validations.required("You must enter a variable name")(value);
		const unique = validations.uniqueByList(existingVariableNames)(value);
		const allowed = validations.allowedVariableName()(value);

		const validationResult = required || unique || allowed || undefined;
		setValidation(validationResult);
		setCanSubmit(!validationResult);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault(); // Prevent any parent form from submitting

			if (canSubmit) {
				onEditComplete();
			}
		}
	};

	if (!type) {
		return null;
	}

	return (
		<BaseVariablePill type={type as VariableType} ref={ref}>
			<AnimatePresence initial={false} mode="wait">
				{editing ? (
					<motion.div
						key="edit"
						style={{ flex: 1 }}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
					>
						<Tippy theme="error" content={validation} visible={!!validation} placement="bottom">
							<div style={{ width: "100%", flex: "1 auto" }}>
								<TextInput
									autoFocus
									placeholder="Enter a new variable name..."
									input={{
										value: newName,
										onChange: handleUpdateName,
										onBlur: handleBlur,
										onKeyDown: handleKeyDown,
									}}
									adornmentRight={
										<motion.div className="edit-buttons">
											<motion.div
												title="Finished"
												aria-label="Finished"
												initial={{ x: "100%", opacity: 0 }}
												animate={{ x: 0, opacity: 1 }}
												transition={{ delay: 0.4 }}
												role="button"
												tabIndex={0} // Needed to allow focus
												id={EDIT_COMPLETE_BUTTON_ID}
												onClick={onEditComplete}
												className={cx("edit-buttons__button", {
													"edit-buttons__button--disabled": !canSubmit,
												})}
											>
												<Icon name="tick" color="sea-green" />
											</motion.div>
											<motion.div
												title="Cancel"
												aria-label="Cancel"
												initial={{ x: "100%", opacity: 0 }}
												animate={{ x: 0, opacity: 1 }}
												transition={{ delay: 0.6 }}
												role="button"
												tabIndex={0} // Needed to allow focus
												onClick={handleCancel}
												className="edit-buttons__button edit-buttons__button--cancel"
											>
												<Icon name="cross" color="tomato" />
											</motion.div>
										</motion.div>
									}
								/>
							</div>
						</Tippy>
					</motion.div>
				) : (
					<motion.h4
						key="label"
						className="label"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={() => setIsEditing(true)}
						title="Click to rename this variable..."
					>
						{name ?? ""}
					</motion.h4>
				)}
			</AnimatePresence>
		</BaseVariablePill>
	);
};

export default React.memo(EditableVariablePill);
