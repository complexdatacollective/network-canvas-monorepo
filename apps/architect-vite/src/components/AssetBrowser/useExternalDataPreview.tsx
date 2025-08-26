import { useCallback, useMemo, useState } from "react";
import Preview from "~/components/AssetBrowser/Preview";
import useExternalDataDownload from "./useExternalDataDownload";

const useExternalDataPreview = (): [React.ReactNode | null, (id: string) => void, () => void] => {
	const [showPreview, setShowPreview] = useState<string | null>(null);
	const handleDownload = useExternalDataDownload();

	const handleShowPreview = setShowPreview;

	const handleClosePreview = useCallback(() => setShowPreview(null), []);

	const preview = useMemo(
		() =>
			showPreview && (
				<Preview id={showPreview} onDownload={() => handleDownload(showPreview)} onClose={handleClosePreview} />
			),
		[showPreview, handleDownload, handleClosePreview],
	);

	return [preview, handleShowPreview, handleClosePreview];
};

export default useExternalDataPreview;
