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

const BooleanToggle = ({ noReset, options = [], value = null, onChange = () => {} }: BooleanProps) => (
	<div className="flex w-full flex-col gap-2">
		<div className="flex w-full gap-2">
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
			<div>
				<button
					type="button"
					onClick={() => onChange(null)}
					className="cursor-pointer text-sm text-input-contrast underline hover:text-input-contrast/80"
				>
					Reset answer
				</button>
			</div>
		)}
	</div>
);

export default BooleanToggle;
