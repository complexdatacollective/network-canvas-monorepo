import { Layout } from "~/components/EditorLayout";
import { Button } from "~/lib/legacy-ui/components";
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
			onCancel={onCancel}
			cancelText="Cancel"
			header={<h2 className="m-0">Resource Browser</h2>}
			footer={
				<>
					<Button
						onClick={() => {
							onCancel();
						}}
						color="platinum"
					>
						Cancel
					</Button>
				</>
			}
		>
			<Layout>
				<AssetBrowser type={type} onSelect={onSelect} selected={selected} disableDelete sectionLayout="vertical" />
			</Layout>
		</Dialog>
	);
};

export default AssetBrowserWindow;
