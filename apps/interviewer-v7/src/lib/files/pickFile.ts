import { isElectron } from "../platform/platform";

export type PickedFile = {
	name: string;
	file: File;
};

export async function pickProtocolFile(): Promise<PickedFile | null> {
	if (isElectron && window.electronAPI?.openFile) {
		const result = await window.electronAPI.openFile();
		if (!result || result.canceled || !result.data || !result.name) return null;
		const arrayBuffer = result.data.buffer.slice(
			result.data.byteOffset,
			result.data.byteOffset + result.data.byteLength,
		) as ArrayBuffer;
		return { name: result.name, file: new File([arrayBuffer], result.name) };
	}

	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".netcanvas,application/zip";
		input.onchange = () => {
			const file = input.files?.[0];
			resolve(file ? { name: file.name, file } : null);
		};
		input.oncancel = () => resolve(null);
		input.click();
	});
}
