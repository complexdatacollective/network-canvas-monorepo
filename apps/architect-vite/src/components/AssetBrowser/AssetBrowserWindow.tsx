import { Layout } from "~/components/EditorLayout";
import Dialog from "../NewComponents/Dialog";
import AssetBrowser from "./AssetBrowser";

type AssetBrowserWindowProps = {
	show?: boolean;
	type?: string | null;
	selected?: string | null;
	onCancel?: () => void;
	onSelect?: () => void;
};

const AssetBrowserWindow = ({
	show = true,
	type = null,
	selected = null,
	onCancel = () => {},
	onSelect = () => {},
}: AssetBrowserWindowProps) => {
	return (
		<Dialog
			open={show}
			onOpenChange={(open) => !open && onCancel()}
			title="Resource Browser"
			onCancel={onCancel}
			cancelText="Cancel"
		>
			<Layout>
				<AssetBrowser type={type} onSelect={onSelect} selected={selected} disableDelete />
			</Layout>
		</Dialog>
	);
};

export default AssetBrowserWindow;
