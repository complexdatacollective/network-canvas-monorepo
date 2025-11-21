import type { Descendant } from "slate";
import type { RenderElementProps } from "slate-react";

type CustomElement = {
	type: string;
	children: Descendant[];
};

interface ElementProps extends RenderElementProps {
	element: CustomElement;
}

const Element = ({ attributes, children, element }: ElementProps) => {
	switch (element.type) {
		case "ul_list":
			return <ul {...attributes}>{children}</ul>;
		case "ol_list":
			return <ol {...attributes}>{children}</ol>;
		case "heading_one":
			return <h1 {...attributes}>{children}</h1>;
		case "heading_two":
			return <h2 {...attributes}>{children}</h2>;
		case "heading_three":
			return <h3 {...attributes}>{children}</h3>;
		case "heading_four":
			return <h4 {...attributes}>{children}</h4>;
		case "list_item":
			return <li {...attributes}>{children}</li>;
		case "thematic_break":
			return (
				<div {...attributes}>
					<hr />
					{children}
				</div>
			);
		default:
			return <p {...attributes}>{children}</p>;
	}
};

export default Element;
