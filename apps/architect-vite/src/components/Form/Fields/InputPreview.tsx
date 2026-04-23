import { get } from "es-toolkit/compat";

import inputImages from "../../../images/inputs";

const getInputImage = (type: string) => get(inputImages, type);

type InputPreviewProps = {
	image: string;
	label: string;
	description: string;
};

const InputPreview = ({ image, label, description }: InputPreviewProps) => (
	<div className="bg-surface-1 flex rounded p-[var(--space-md)]">
		<div className="basis-1/2">
			<img className="w-full" src={getInputImage(image)} alt={label} />
		</div>
		<div className="basis-1/2 pl-[var(--space-xl)]">
			<p>{description}</p>
		</div>
	</div>
);

export default InputPreview;
