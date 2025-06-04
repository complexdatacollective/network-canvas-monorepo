import cx from "classnames";
import Icon from "../Icon";

interface RoundCheckboxProps {
	checked?: boolean;
	negative?: boolean;
}

const RoundCheckbox = ({ checked = false, negative = false }: RoundCheckboxProps) => {
	const classes = cx(
		"round-checkbox",
		{ "round-checkbox--checked": checked },
		{ "round-checkbox--negative": negative },
	);

	return (
		<div className={classes}>
			<Icon name={negative ? "cross" : "tick"} color="white" />
		</div>
	);
};

export default RoundCheckbox;
