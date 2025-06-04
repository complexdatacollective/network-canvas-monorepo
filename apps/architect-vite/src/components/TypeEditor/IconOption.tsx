import Icon from "@codaco/legacy-ui/components/Icon";
import Radio from "../Form/Fields/Radio";

type IconOptionProps = {
	label: string;
} & React.ComponentProps<typeof Radio>;

const IconOption = (props: IconOptionProps) => (
	<Radio
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
		className="type-editor-icon-option"
		// eslint-disable-next-line react/destructuring-assignment
		label={<Icon name={props.label} />}
	/>
);

export default IconOption;
