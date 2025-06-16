import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { Markdown } from "~/lib/legacy-ui/components/Fields";
import { getAssetManifest } from "~/selectors/protocol";
import AudioWithUrl from "../../Assets/Audio";
import BackgroundImageWithUrl from "../../Assets/BackgroundImage";
import VideoWithUrl from "../../Assets/Video";

type ItemPreviewProps = {
	content?: string | null;
	assetType?: string | null;
};

const mapStateToProps = (state: any, { content }: { content: string }) => {
	const assetManifest = getAssetManifest(state);

	const assetType = get(assetManifest, [content, "type"]);

	return {
		assetType,
	};
};

const ItemPreview = ({ content = null, assetType = null }: ItemPreviewProps) => {
	switch (assetType) {
		case "image":
			return <BackgroundImageWithUrl id={content} />;
		case "video":
			return <VideoWithUrl id={content} controls />;
		case "audio":
			return <AudioWithUrl id={content} controls />;
		default:
			return <Markdown label={content} />;
	}
};

export default connect(mapStateToProps)(ItemPreview);
