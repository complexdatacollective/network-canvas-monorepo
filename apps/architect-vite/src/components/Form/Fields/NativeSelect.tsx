import type { UnknownAction } from "@reduxjs/toolkit";
import cx from "classnames";
import { sortBy } from "es-toolkit/compat";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { untouch } from "redux-form";
import { Text } from "~/components/Form/Fields";
import { useAppDispatch } from "~/ducks/hooks";
import { Button } from "~/lib/legacy-ui/components";
import Icon from "~/lib/legacy-ui/components/Icon";
import { getValidator } from "~/utils/validations";

type Option = {
	label: string;
	value: string;
	disabled?: boolean;
};

type InputProps = {
	onChange: (value: string | null) => void;
	onBlur?: () => void;
	value?: string | null;
	name: string;
};

type MetaProps = {
	invalid?: boolean;
	error?: string | null;
	touched?: boolean;
	form: string;
};

type NativeSelectProps = {
	className?: string;
	label?: string | null;
	options?: Option[];
	placeholder?: string;
	onCreateOption?: (value: string) => Promise<void> | void;
	onCreateNew?: () => void;
	createLabelText?: string;
	createInputLabel?: string;
	createInputPlaceholder?: string;
	allowPlaceholderSelect?: boolean;
	sortOptionsByLabel?: boolean;
	reserved?: Option[];
	validation?: Record<string, unknown> | null;
	disabled?: boolean;
	input: InputProps;
	meta?: MetaProps;
	entity?: string;
};

const NativeSelect: React.FC<NativeSelectProps> = ({
	label = null,
	options = [],
	placeholder = "Select an option",
	className = "",
	onCreateOption = null,
	onCreateNew = null,
	createLabelText = "✨ Create new ✨",
	createInputLabel = "New variable name",
	createInputPlaceholder = "Enter a variable name...",
	allowPlaceholderSelect = false,
	sortOptionsByLabel = true,
	reserved = [],
	validation = null,
	disabled = false,
	input,
	meta = {
		invalid: false,
		error: null,
		touched: false,
		form: "",
	},
	entity,
	...rest
}) => {
	const [showCreateOptionForm, setShowCreateOptionForm] = useState(false);
	const [newOptionValue, setNewOptionValue] = useState<string | null>(null);
	const [newOptionError, setNewOptionError] = useState<string | false>(false);
	const dispatch = useAppDispatch();

	const { onBlur, ...inputProps } = input;
	const { invalid = false, error = null, touched = false, form } = meta;

	const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		const value = event.target.value;

		if (value === "_create") {
			inputProps.onChange(null);

			// Setting input to null above will 'touch' the select, triggering validation
			// which we don't want yet. We 'un-touch' the input to resolve this.
			dispatch(untouch(form, inputProps.name) as UnknownAction);
			if (onCreateNew) {
				onCreateNew();
				return;
			}

			setShowCreateOptionForm(true);
			return;
		}

		if (value === "_placeholder") {
			inputProps.onChange(null);
			return;
		}

		inputProps.onChange(value);
	};

	const resetForm = () => {
		setShowCreateOptionForm(false);
		setNewOptionValue(null);
		setNewOptionError(false);
	};

	const handleCreateOption = () => {
		if (!onCreateOption || !newOptionValue) return;

		const newValue = newOptionValue;
		resetForm();
		return onCreateOption(newValue);
	};

	const isValidCreateOption = useCallback(
		(value?: string | null): boolean => {
			if (!value) return true;

			const validationErrors = getValidator(validation || {})(value);

			if (validationErrors) {
				setNewOptionError(validationErrors);
				return false;
			}

			// True if option matches the label prop of the supplied object
			const matchLabel = ({ label: variableLabel }: Option) =>
				variableLabel && value && variableLabel.toLowerCase() === value.toLowerCase();

			const alreadyExists = options.some(matchLabel);
			const isReserved = reserved.some(matchLabel);

			if (alreadyExists || isReserved) {
				setNewOptionError(`Variable name "${value}" is already defined on entity type ${entity}`);
				return false;
			}

			setNewOptionError(false);
			return true;
		},
		[validation, options, reserved, entity],
	);

	// Do we have a value in the create new Text field that is not submitted?
	const valueButNotSubmitted = newOptionValue !== null && showCreateOptionForm;

	const notSubmittedError = useMemo(
		() => valueButNotSubmitted && 'You must click "create" to finish creating this variable.',
		[valueButNotSubmitted],
	);

	/**
	 * This passes through validation errors from the select to the Text field for
	 * creating new options. It also has to handle when the create new option form
	 * hasn't been shown
	 *
	 * touched:
	 *   - touched: controlled by parent input, and triggered/reset from child as needed
	 *   - new option isn't null (prevents "required" immediately showing) AND new option
	 *     isn't valid. Combined this allows the correct error to be shown.
	 * invalid:
	 *   - !isValidCreateOption: validate the new variable Text field value
	 *   - valueButNotSubmitted: true if value entered in Text field but not submitted
	 *   - invalid: parent select invalid prop. Will be set to true when validation is
	 *     triggered and we have no value set
	 * error:
	 *   - newOptionError: error message from Text field variable validation
	 *   - error: parent select error message. Will usually be "Required"
	 */

	const calculateMeta = useMemo(() => {
		const localInvalid = !isValidCreateOption(newOptionValue);
		return {
			touched: touched || (newOptionValue !== null && !isValidCreateOption(newOptionValue)),
			invalid: !isValidCreateOption(newOptionValue) || valueButNotSubmitted || (newOptionValue === null && invalid),
			localInvalid,
			error: newOptionError || notSubmittedError || error,
		};
	}, [
		touched,
		invalid,
		error,
		newOptionValue,
		newOptionError,
		valueButNotSubmitted,
		notSubmittedError,
		isValidCreateOption,
	]);

	const sortedOptions = useMemo(
		() => (sortOptionsByLabel ? sortBy(options, "label") : options),
		[options, sortOptionsByLabel],
	);

	const variants = {
		show: { opacity: 1 },
		hide: { opacity: 0 },
		transition: { duration: 0.5 },
	};

	const componentClasses = cx(className, "form-fields-select-native", {
		"form-fields-select-native--has-error": invalid && touched && error,
		"form-fields-select-native--disabled": disabled,
	});

	return (
		<motion.div className="form-fields-select-native__wrapper">
			<AnimatePresence initial={false} mode="wait">
				{showCreateOptionForm ? (
					<motion.div
						className="form-fields-select-native__new-section"
						key="new-section"
						variants={variants}
						initial="hide"
						exit="hide"
						animate="show"
					>
						<Text
							label={createInputLabel}
							autoFocus
							input={{
								// Make interaction with this input also touch the parent so we can control
								// validation better.
								onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
									dispatch(untouch(form, inputProps.name) as UnknownAction);
									setNewOptionValue(event.target.value);
								},
							}}
							placeholder={createInputPlaceholder}
							meta={{
								touched: calculateMeta.touched,
								invalid: calculateMeta.invalid,
								error: calculateMeta.error ?? undefined,
							}}
						/>
						<div className="button-footer">
							<Button color="platinum" onClick={() => setShowCreateOptionForm(false)}>
								Cancel
							</Button>
							<Button onClick={handleCreateOption} disabled={calculateMeta.localInvalid}>
								Create
							</Button>
						</div>
					</motion.div>
				) : (
					<motion.div
						key="select-section"
						className={componentClasses}
						initial="hide"
						variants={variants}
						exit="hide"
						animate="show"
					>
						{label && <h4>{label}</h4>}
						<select
							className="form-fields-select-native__component"
							{...inputProps}
							value={inputProps.value || "_placeholder"}
							onChange={handleChange}
							disabled={!!disabled}
							{...rest}
						>
							<option disabled={!allowPlaceholderSelect} value="_placeholder">
								-- {placeholder} --
							</option>
							{(onCreateOption || onCreateNew) && <option value="_create">{createLabelText}</option>}
							{sortedOptions.map((option) => (
								<option key={`${option.label}_${option.value}`} value={option.value} disabled={!!option.disabled}>
									{option.label}
								</option>
							))}
						</select>
						{invalid && touched && (
							<div className="form-fields-select-native__error">
								<Icon name="warning" />
								{error}
							</div>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
};

export default NativeSelect;
