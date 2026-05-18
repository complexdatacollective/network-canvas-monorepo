import withAssetMeta from "~/components/Assets/withAssetMeta";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";
import {
	thumbnailBase,
	thumbnailExisting,
	thumbnailFullWidth,
	thumbnailIcon,
	thumbnailInteractive,
	thumbnailLabel,
} from "./styles";

type GeoJSONThumbnailProps = {
	id: string;
	meta?: {
		name: string;
	};
	interactive?: boolean;
	fullWidth?: boolean;
};

const GeoJSONThumbnail = ({ id, meta = { name: "" }, interactive, fullWidth }: GeoJSONThumbnailProps) => (
	<div
		className={cx(
			thumbnailBase,
			id === "existing" && thumbnailExisting,
			fullWidth && thumbnailFullWidth,
			interactive && thumbnailInteractive,
		)}
	>
		<div className={thumbnailIcon}>
			<Icon name="menu-map" />
		</div>
		<div className={thumbnailLabel}>{meta.name}</div>
	</div>
);

export default withAssetMeta(GeoJSONThumbnail);
