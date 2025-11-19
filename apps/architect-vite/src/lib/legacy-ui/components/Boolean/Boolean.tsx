import type { ReactNode } from "react";
import BooleanOption from "./BooleanOption";

type BooleanValue = boolean | string | number | null;

interface BooleanOptionType {
	label: string | (() => ReactNode);
	value?: BooleanValue;
	classes?: string;
	icon?: () => ReactNode;
	negative?: boolean;
}

interface BooleanProps {
	noReset: boolean;
	options?: BooleanOptionType[];
	value?: BooleanValue;
	onChange?: (value: BooleanValue) => void;
}

const BooleanField = ({ noReset, options = [], value = null, onChange = () => {} }: BooleanProps) => (
	<div className="form-field boolean">
		<div className="boolean__options">
			{options.map(({ label, value: optionValue, classes, icon, negative }) => (
				<BooleanOption
					classes={classes}
					key={optionValue}
					label={label}
					selected={value === optionValue}
					onClick={() => onChange(optionValue)}
					icon={icon}
					negative={negative}
				/>
			))}
		</div>
		{!noReset && (
			<div className="boolean__reset">
				<div onClick={() => onChange(null)}>Reset answer</div>
			</div>
		)}
	</div>
);

export default BooleanField;
