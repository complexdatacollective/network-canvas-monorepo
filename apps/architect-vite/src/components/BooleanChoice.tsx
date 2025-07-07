import { compose } from "@reduxjs/toolkit";
import { isEmpty, isNull } from "lodash";
import { useEffect } from "react";
import { connect } from "react-redux";
import { change, Field, formValueSelector } from "redux-form";
import RichText from "~/components/Form/Fields/RichText";
import Toggle from "~/components/Form/Fields/Toggle";
import ValidatedField from "./Form/ValidatedField";

type OptionType = {
	label: string;
	value: boolean;
	negative?: boolean;
};

type OptionsProps = {
	form: string;
	formSelector: (variable: string) => any;
	changeField: (form: string, field: string, value: any) => void;
};

type RootState = {
	[key: string]: any;
};

const mapStateToProps = (state: RootState, { form }: { form: string }) => {
	const selector = formValueSelector(form);

	const formSelector = (variable: string) => selector(state, variable);
	return {
		formSelector,
	};
};

const mapDispatchToProps = {
	changeField: change,
};

const Options = compose(connect(mapStateToProps, mapDispatchToProps))(
	({ form, formSelector, changeField }: OptionsProps) => {
		const initialValues: OptionType[] = [
			{ label: "Yes", value: true },
			{ label: "No", value: false, negative: true },
		];

		useEffect(() => {
			const currentOptions = formSelector("options");
			if (isNull(currentOptions) || isEmpty(currentOptions)) {
				changeField(form, "options", initialValues);
			}
		}, [form, formSelector, changeField, initialValues]);

		return (
			<div className="type-editor__subsection">
				<p>
					The BooleanChoice input component allows you to specify rich text labels for the two choices that your
					participant sees. Create a label for the first option, representing the value true, and the second option,
					representing the value false, below.
				</p>
				<p>
					Each value can also be styled to indicate that it is negative. When enabled, this will make the option red
					when selected, and use a cross icon rather than a tick.
				</p>
				<div className="boolean-option-configuration">
					<div className="boolean-option-configuration__item">
						<h3>Option One</h3>
						<p>
							This option will set the value <strong>true</strong> when selected.
						</p>
						<ValidatedField
							label="Label"
							component={RichText}
							name="options[0].label"
							validation={{ required: true }}
							disallowedTypes={["history", "quote"]}
						/>
						<Field label="Style option as negative" component={Toggle} name="options[0].negative" />
					</div>
					<div className="boolean-option-configuration__item">
						<h3>Option Two</h3>
						<p>
							This option will set the value <strong>false</strong> when selected.
						</p>
						<ValidatedField
							label="Label"
							component={RichText}
							name="options[1].label"
							validation={{ required: true }}
							disallowedTypes={["history", "quote"]}
						/>
						<Field label="Style option as negative" component={Toggle} name="options[1].negative" />
					</div>
				</div>
			</div>
		);
	},
);

export default Options;
