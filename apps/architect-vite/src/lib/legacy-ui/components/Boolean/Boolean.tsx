import type { ReactElement } from "react";
import BooleanOption from "./BooleanOption";

type BooleanOptionType = {
	label: string | ReactElement;
	value: boolean;
	classes?: string;
	icon?: ReactElement;
	negative?: boolean;
};

type BooleanProps = {
	noReset: boolean;
	options?: BooleanOptionType[];
	value: boolean | null;
	onChange: (value: boolean | null) => void;
};

const BooleanField = ({ noReset, options = [], value = null, onChange = () => {} }: BooleanProps) => (
	<div className="form-field boolean">
		<div className="boolean__options">
			{options.map(({ label, value: optionValue, classes, icon, negative }) => (
				<BooleanOption
					classes={classes}
					key={`${optionValue}`}
					label={label}
					selected={value === optionValue}
					onClick={() => onChange(optionValue)}
					customIcon={icon}
					negative={negative}
				/>
			))}
		</div>
		{!noReset && (
			<div className="boolean__reset">
				<button type="button" onClick={() => onChange(null)}>
					Reset answer
				</button>
			</div>
		)}
	</div>
);

export default BooleanField;
