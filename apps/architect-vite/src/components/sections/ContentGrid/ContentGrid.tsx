import { get } from "es-toolkit/compat";
import { formValueSelector } from "redux-form";
import { getAssetManifest } from "../../../selectors/protocol";
import Grid from "../../Grid";
import ItemEditor from "./ItemEditor";
import ItemPreview from "./ItemPreview";
import { capacity } from "./options";

const normalizeType = (item) => ({
	...item,
	type: item.type === "text" ? "text" : "asset",
});

const denormalizeType = (state, { form, editField }) => {
	const item = formValueSelector(form)(state, editField);

	if (!item) {
		return null;
	}

	if (item.type === "text") {
		return item;
	}

	const assetManifest = getAssetManifest(state);
	const manifestType = get(assetManifest, [item.content, "type"]);

	return {
		...item,
		type: manifestType,
	};
};

const ContentGrid = (props) => (
	<Grid
		previewComponent={ItemPreview}
		editComponent={ItemEditor}
		normalize={normalizeType}
		itemSelector={denormalizeType}
		title="Edit Items"
		capacity={capacity}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	/>
);

export { ContentGrid };

export default ContentGrid;
