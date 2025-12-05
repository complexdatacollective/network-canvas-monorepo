import cx from "classnames";
import withAssetMeta from "~/components/Assets/withAssetMeta";
import Icon from "~/lib/legacy-ui/components/Icon";

type APIKeyThumbnailProps = {
	id: string;
	meta?: {
		name: string;
	};
};

const APIKeyThumbnail = ({ id, meta = { name: "" } }: APIKeyThumbnailProps) => (
	<div
		className={cx("thumbnail thumbnail--audio", {
			"thumbnail--existing": id === "existing",
		})}
	>
		<div className="thumbnail__icon">
			<Icon name="VpnKey" />
		</div>
		<div className="thumbnail__label">{meta.name}</div>
	</div>
);

export default withAssetMeta(APIKeyThumbnail);
