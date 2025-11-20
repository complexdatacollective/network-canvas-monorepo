/* eslint-disable no-param-reassign */

import { Editor, type Element } from "slate";

const VOID_TYPES = ["thematic_break"];

interface VoidEditor extends Editor {
	isVoid: (element: Element) => boolean;
}

const withVoids = (editor: VoidEditor): VoidEditor => {
	const { isVoid } = editor;
	editor.isVoid = (element: Element) => {
		if ("type" in element && VOID_TYPES.includes(element.type as string)) {
			return true;
		}
		return isVoid(element);
	};

	return editor;
};

export default withVoids;
