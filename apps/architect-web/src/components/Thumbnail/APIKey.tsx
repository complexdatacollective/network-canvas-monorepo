import { KeyRound } from "lucide-react";
import withAssetMeta from "~/components/Assets/withAssetMeta";
import { cx } from "~/utils/cva";
import {
	thumbnailBase,
	thumbnailExisting,
	thumbnailFullWidth,
	thumbnailIcon,
	thumbnailInteractive,
	thumbnailLabel,
} from "./styles";

type APIKeyThumbnailProps = {
	id: string;
	meta?: {
		name: string;
	};
	interactive?: boolean;
	fullWidth?: boolean;
};

const APIKeyThumbnail = ({ id, meta = { name: "" }, interactive, fullWidth }: APIKeyThumbnailProps) => (
	<div
		className={cx(
			thumbnailBase,
			id === "existing" && thumbnailExisting,
			fullWidth && thumbnailFullWidth,
			interactive && thumbnailInteractive,
		)}
	>
		<div className={thumbnailIcon}>
			<KeyRound className="icon" />
		</div>
		<div className={thumbnailLabel}>{meta.name}</div>
	</div>
);

export default withAssetMeta(APIKeyThumbnail);
