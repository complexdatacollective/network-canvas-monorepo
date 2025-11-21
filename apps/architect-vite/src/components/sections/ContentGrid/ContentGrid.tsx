import { get } from "es-toolkit/compat";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/modules/root";
import { getAssetManifest } from "~/selectors/protocol";
import Grid from "../../Grid";
import ItemEditor from "./ItemEditor";
import ItemPreview from "./ItemPreview";
import { capacity } from "./options";

type Item = {
	type: string;
	content?: string;
	[key: string]: unknown;
};

const normalizeType = (item: Item): Item => ({
	...item,
	type: item.type === "text" ? "text" : "asset",
});

const denormalizeType = (state: RootState, { form, editField }: { form: string; editField: string }): Item | null => {
	const item = formValueSelector(form)(state, editField) as Item | undefined;

	if (!item) {
		return null;
	}

	if (item.type === "text") {
		return item;
	}

	const assetManifest = getAssetManifest(state);
	const manifestType = get(assetManifest, [item.content ?? "", "type"]);

	return {
		...item,
		type: manifestType as string,
	};
};

const ContentGrid = (props: Record<string, unknown>) => (
	<Grid
		previewComponent={ItemPreview}
		editComponent={ItemEditor}
		normalize={normalizeType}
		itemSelector={denormalizeType}
		title="Edit Items"
		capacity={capacity}
		form={props.form as string}
		disabled={props.disabled as boolean}
		{...props}
	/>
);

export default ContentGrid;
