import withAssetMeta from "~/components/Assets/withAssetMeta";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";
import { thumbnailBase, thumbnailExisting, thumbnailIcon, thumbnailLabel } from "./styles";

type GeoJSONThumbnailProps = {
	id: string;
	meta?: {
		name: string;
	};
};

const GeoJSONThumbnail = ({ id, meta = { name: "" } }: GeoJSONThumbnailProps) => (
	<div className={cx(thumbnailBase, id === "existing" && thumbnailExisting)}>
		<div className={thumbnailIcon}>
			<Icon name="menu-map" />
		</div>
		<div className={thumbnailLabel}>{meta.name}</div>
	</div>
);

export default withAssetMeta(GeoJSONThumbnail);
