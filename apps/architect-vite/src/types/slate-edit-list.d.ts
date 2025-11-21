declare module "@productboard/slate-edit-list" {
	import type { Editor } from "slate";

	type EditListTransforms = {
		wrapInList(editor: Editor, format: string): void;
		unwrapList(editor: Editor, format: string): void;
	};

	export function EditListPlugin(options?: {
		maxDepth?: number;
	}): [
		(editor: Editor) => Editor,
		(editor: Editor) => (event: React.KeyboardEvent) => void,
		{ Transforms: EditListTransforms },
	];
}
