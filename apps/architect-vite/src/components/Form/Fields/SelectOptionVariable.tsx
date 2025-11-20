// @ts-expect-error - components export exists at runtime but may not be typed in v3.x
import { components as ReactSelectComponents } from "react-select";

const { Option } = ReactSelectComponents;

type SelectOptionVariableProps = {
	data: {
		label: string;
		name: string;
		description: string;
	};
} & Record<string, unknown>;

const SelectOptionVariable = (props: SelectOptionVariableProps) => {
	const {
		data: { label, name, description },
	} = props;

	return (
		<Option
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...props}
			className="form-fields-select__item"
			classNamePrefix="form-fields-select__item"
		>
			<h4>
				{label}{" "}
				<span className="select-item__variable--variable-name">
					&lt;
					{name}
					&gt;
				</span>
			</h4>
			<p>{description}</p>
		</Option>
	);
};

export default SelectOptionVariable;
