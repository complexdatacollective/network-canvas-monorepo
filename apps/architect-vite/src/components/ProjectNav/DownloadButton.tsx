import { Check, Download } from "lucide-react";
import { useCallback, useState } from "react";
import Tooltip from "~/components/NewComponents/Tooltip";
import { useAppDispatch } from "~/ducks/hooks";
import { exportNetcanvas } from "~/ducks/modules/userActions/userActions";
import { Button } from "~/lib/legacy-ui/components";

type DownloadButtonProps = {
	disabled?: boolean;
};

const DownloadButton = ({ disabled = false }: DownloadButtonProps) => {
	const dispatch = useAppDispatch();
	const [isExporting, setIsExporting] = useState(false);
	const [downloadSuccess, setDownloadSuccess] = useState(false);

	const handleDownload = useCallback(async () => {
		try {
			setIsExporting(true);
			await dispatch(exportNetcanvas()).unwrap();
			setDownloadSuccess(true);
			setTimeout(() => setDownloadSuccess(false), 2000);
		} catch (error) {
			throw new Error(`Failed to export protocol: ${error}`);
		} finally {
			setIsExporting(false);
		}
	}, [dispatch]);

	return (
		<Tooltip content="Download .netcanvas protocol">
			<Button
				onClick={handleDownload}
				color="sea-green"
				content={downloadSuccess ? "Downloaded" : isExporting ? "Downloading..." : "Download"}
				disabled={isExporting || disabled}
				icon={downloadSuccess ? <Check /> : <Download />}
			/>
		</Tooltip>
	);
};

export default DownloadButton;
