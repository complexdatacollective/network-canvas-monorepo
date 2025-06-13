import TextField from "@codaco/legacy-ui/components/Fields/Text";
import { ValidatedField } from "../Form";

type ScalarParametersProps = {
	name: string;
};

const ScalarParameters = ({ name }: ScalarParametersProps) => (
	<>
		<p>
			This input type requires you to specify a <strong>minimum</strong> and <strong>maximum</strong> label, which will
			be displayed at each end of the scale.
		</p>
		<ValidatedField
			label="Minimum label"
			component={TextField}
			name={`${name}.minLabel`}
			validation={{ required: true }}
		/>
		<ValidatedField
			label="Maximum label"
			component={TextField}
			name={`${name}.maxLabel`}
			validation={{ required: true }}
		/>
	</>
);

export default ScalarParameters;
