import cx from "classnames";
import withAssetMeta from "~/components/Assets/withAssetMeta";
import Icon from "~/lib/legacy-ui/components/Icon";

type GeoJSONThumbnailProps = {
	id: string;
	meta?: {
		name: string;
	};
};

const GeoJSONThumbnail = ({ id, meta = { name: "" } }: GeoJSONThumbnailProps) => (
	<div className={cx("thumbnail thumbnail--audio", { "thumbnail--existing": id === "existing" })}>
		<div className="thumbnail__icon">
			<Icon name="Map" />
		</div>
		<div className="thumbnail__label">{meta.name}</div>
	</div>
);

export default withAssetMeta(GeoJSONThumbnail);
