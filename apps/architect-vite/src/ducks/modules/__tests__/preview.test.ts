import { describe, expect, it } from "vitest";
import previewReducer, {
	type PreviewState,
	previewUploadFailed,
	previewUploadStarted,
	previewUploadSucceeded,
} from "../preview";

const initial: PreviewState = { status: "idle", url: null, error: null, lastUploadedAt: null, lastUploadedHash: null };

describe("preview reducer", () => {
	it("transitions idle → uploading", () => {
		const next = previewReducer(initial, previewUploadStarted({ hash: "abc" }));
		expect(next.status).toBe("uploading");
	});

	it("records url and hash on success", () => {
		const next = previewReducer(initial, previewUploadSucceeded({ url: "https://x", hash: "abc", at: 10 }));
		expect(next.status).toBe("ready");
		expect(next.url).toBe("https://x");
		expect(next.lastUploadedHash).toBe("abc");
		expect(next.lastUploadedAt).toBe(10);
		expect(next.error).toBeNull();
	});

	it("records error on failure", () => {
		const next = previewReducer(initial, previewUploadFailed({ error: "boom" }));
		expect(next.status).toBe("error");
		expect(next.error).toBe("boom");
	});
});
