import type { VariableType } from "@codaco/protocol-validation";
import Tippy from "@tippyjs/react";
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
import { cx } from "~/utils/cva";
import { validations } from "~/utils/validations";

const EDIT_COMPLETE_BUTTON_ID = "editCompleteButton";

const ICON_BACKGROUND_BY_TYPE: Record<VariableType, string> = {
	number: "bg-paradise-pink",
	text: "bg-cerulean-blue",
	boolean: "bg-neon-carrot",
	ordinal: "bg-sea-green",
	categorical: "bg-mustard",
	scalar: "bg-kiwi",
	datetime: "bg-tomato",
	layout: "bg-purple-pizazz",
	location: "bg-slate-blue-dark",
};

type BaseVariablePillProps = {
	type: VariableType;
	children: React.ReactNode;
	width?: string;
};

const BaseVariablePill = React.forwardRef<HTMLDivElement, BaseVariablePillProps>(({ type, children, width }, ref) => {
	const icon = useMemo(() => getIconForType(type), [type]);

	return (
		// `variable-pill` class is preserved as a styling hook for the
		// remaining unmigrated consumer — `protocol-summary.css` — which
		// overrides `--variable-pill-shadow-color` and preview margin via
		// cascade. The codebook width cascade migrated to the `width` prop in
		// slice 32; the rules-preview cascade migrated to arbitrary-child
		// selectors on PreviewRule's `__text` row in slice 33. Remove the
		// marker once slice 35 folds protocol-summary.css into tailwind.css.
		<motion.div
			className="variable-pill inline-flex h-(--space-2xl) flex-nowrap overflow-hidden rounded-full bg-platinum w-[var(--variable-pill-width,20rem)] shadow-[0_0_var(--space-sm)_var(--variable-pill-shadow-color,transparent)]"
			style={width ? ({ "--variable-pill-width": width } as React.CSSProperties) : undefined}
			ref={ref}
		>
			<div
				className={cx(
					"flex shrink-0 basis-(--space-2xl) items-center justify-center [&_.icon]:w-(--space-lg)",
					ICON_BACKGROUND_BY_TYPE[type],
				)}
			>
				<img className="icon" src={icon} alt={type} />
			</div>
			<div className="flex flex-1 w-[calc(100%-var(--space-2xl))] items-center justify-between [&_.label]:cursor-text [&_.label]:w-full [&_.label]:overflow-hidden [&_.label]:whitespace-nowrap [&_.label]:text-ellipsis">
				{children}
			</div>
		</motion.div>
	);
});

type SimpleVariablePillProps = {
	label: string;
} & BaseVariablePillProps;

export const SimpleVariablePill = ({ label, ...props }: SimpleVariablePillProps) => (
	// eslint-disable-next-line react/jsx-props-no-spreading
	<BaseVariablePill {...props}>
		<motion.h4 className="m-0 grow shrink-0 px-(--space-md) py-(--space-sm) [word-break:keep-all] text-input-foreground">
			{label}
		</motion.h4>
	</BaseVariablePill>
);

type EditableVariablePillProps = {
	uuid: string;
	width?: string;
};

const EditableVariablePill = ({ uuid, width }: EditableVariablePillProps) => {
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

	const subject = useMemo(
		() => ({
			entity: (entity || "") as "node" | "edge" | "ego",
			type: (entityType || "node") as "node" | "edge" | "ego",
		}),
		[entity, entityType],
	);
	const existingVariables = useAppSelector((state: RootState) => getVariablesForSubject(state, subject));

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

		const validationResult = required || unique || allowed || null;
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
		<BaseVariablePill type={type as VariableType} width={width} ref={ref}>
			<AnimatePresence initial={false} mode="wait">
				{editing ? (
					<motion.div
						key="edit"
						className="flex-1"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
					>
						<Tippy theme="error" content={validation} visible={!!validation} placement="bottom">
							<div className="flex-auto w-full">
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
										<motion.div className="relative right-(--space-md) flex shrink-0 grow-0">
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
												className={cx(
													"cursor-pointer [&_.icon]:size-(--space-md)",
													!canSubmit && "cursor-not-allowed grayscale",
												)}
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
												className="ml-(--space-sm) cursor-pointer [&_.icon]:size-(--space-md)"
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
						className="label m-0 grow shrink-0 px-(--space-md) py-(--space-sm) [word-break:keep-all] text-input-foreground"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={() => setIsEditing(true)}
						title="Click to rename this variable..."
					>
						{name}
					</motion.h4>
				)}
			</AnimatePresence>
		</BaseVariablePill>
	);
};

export default React.memo(EditableVariablePill);
