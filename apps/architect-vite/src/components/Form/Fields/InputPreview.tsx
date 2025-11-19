import { get } from "es-toolkit/compat";

import inputImages from "../../../images/inputs";

const getInputImage = (type) => get(inputImages, type);

type InputPreviewProps = {
	image: string;
	label: string;
	description: string;
};

const InputPreview = ({ image, label, description }: InputPreviewProps) => (
	<div className="input-preview">
		<div className="input-preview__image">
			<img className="" src={getInputImage(image)} alt={label} />
		</div>
		<div className="input-preview__description">
			<p>{description}</p>
		</div>
	</div>
);

export default InputPreview;
