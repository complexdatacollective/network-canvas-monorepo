import cx from "classnames";
import { Node } from "~/lib/legacy-ui/components";

type PreviewNodeProps = {
	label: string;
	color?: string;
	onClick?: (() => void) | undefined;
	selected?: boolean;
};

const PreviewNode = ({ label, color = "node-color-seq-1", onClick, selected = false }: PreviewNodeProps) => {
	const content = <Node label={label} selected={selected} color={color} />;

	const commonClasses = cx(
		"preview-node",
		{ "preview-node--selected": selected },
		{ "preview-node--clickable": onClick },
	);

	if (onClick && !selected) {
		return (
			<button type="button" className={commonClasses} onClick={onClick} aria-label={`Select node ${label}`}>
				{content}
			</button>
		);
	}

	return <div className={commonClasses}>{content}</div>;
};

export default PreviewNode;
