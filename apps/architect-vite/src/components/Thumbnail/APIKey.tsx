import cx from "classnames";
import { KeyRound } from "lucide-react";
import withAssetMeta from "~/components/Assets/withAssetMeta";

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
			<KeyRound className="icon" />
		</div>
		<div className="thumbnail__label">{meta.name}</div>
	</div>
);

export default withAssetMeta(APIKeyThumbnail);
