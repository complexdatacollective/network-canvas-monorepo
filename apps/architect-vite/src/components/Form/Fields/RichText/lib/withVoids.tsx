/* eslint-disable no-param-reassign */

import type { BaseEditor, Element } from "slate";

const VOID_TYPES = ["thematic_break"];

interface VoidEditor extends BaseEditor {
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
