import type { PickedFile, Platform } from "./index";

async function pickProtocolFile(): Promise<PickedFile | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".netcanvas,application/x-netcanvas,application/zip";
		input.style.display = "none";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) {
				resolve(null);
				return;
			}
			const buffer = await file.arrayBuffer();
			resolve({ name: file.name, data: new Uint8Array(buffer) });
		};
		input.oncancel = () => resolve(null);
		document.body.appendChild(input);
		input.click();
		input.remove();
	});
}

async function saveExport(suggestedName: string, data: Uint8Array) {
	const blob = new Blob([data as BlobPart], { type: "application/zip" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = suggestedName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Let the browser pick up the click before revoking.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	return { ok: true };
}

export const webPlatform: Platform = {
	kind: "web",
	pickProtocolFile,
	saveExport,
};
