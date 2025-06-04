import Icon from "@codaco/legacy-ui/components/Icon";
import cx from "classnames";
import withAssetMeta from "~/components/Assets/withAssetMeta";

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
