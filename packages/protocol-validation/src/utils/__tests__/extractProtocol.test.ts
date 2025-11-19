import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractProtocol } from "../extractProtocol";

// Mock JSZip
vi.mock("jszip");

describe("extractProtocol", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should successfully extract protocol from valid zip buffer", async () => {
		const mockProtocol = {
			schemaVersion: 8,
			name: "Test Protocol",
			stages: [],
			codebook: { node: {}, edge: {}, ego: {} },
		};

		const mockZipFile = {
			async: vi.fn().mockResolvedValue(JSON.stringify(mockProtocol)),
		};

		const mockZip = {
			file: vi.fn().mockReturnValue(mockZipFile),
		};

		vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as never);

		const buffer = Buffer.from("mock zip content");
		const result = await extractProtocol(buffer);

		expect(JSZip.loadAsync).toHaveBeenCalledWith(buffer);
		expect(mockZip.file).toHaveBeenCalledWith("protocol.json");
		expect(mockZipFile.async).toHaveBeenCalledWith("string");
		expect(result).toEqual({ protocol: mockProtocol, assets: [] });
	});

	it("should throw error when protocol.json is not found in zip", async () => {
		const mockZip = {
			file: vi.fn().mockReturnValue(null),
		};

		vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as never);

		const buffer = Buffer.from("mock zip content");

		await expect(extractProtocol(buffer)).rejects.toThrow("protocol.json not found in zip");
		expect(mockZip.file).toHaveBeenCalledWith("protocol.json");
	});

	it("should throw error when protocol.json is undefined", async () => {
		const mockZip = {
			file: vi.fn().mockReturnValue(undefined),
		};

		vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as never);

		const buffer = Buffer.from("mock zip content");

		await expect(extractProtocol(buffer)).rejects.toThrow("protocol.json not found in zip");
	});

	it("should throw error when protocol.json contains invalid JSON", async () => {
		const mockZipFile = {
			async: vi.fn().mockResolvedValue("invalid json {"),
		};

		const mockZip = {
			file: vi.fn().mockReturnValue(mockZipFile),
		};

		vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as never);

		const buffer = Buffer.from("mock zip content");

		await expect(extractProtocol(buffer)).rejects.toThrow();
	});

	it("should handle empty protocol.json", async () => {
		const mockZipFile = {
			async: vi.fn().mockResolvedValue(""),
		};

		const mockZip = {
			file: vi.fn().mockReturnValue(mockZipFile),
		};

		vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as never);

		const buffer = Buffer.from("mock zip content");

		await expect(extractProtocol(buffer)).rejects.toThrow();
	});

	it("should throw error when zip loading fails", async () => {
		vi.mocked(JSZip.loadAsync).mockRejectedValue(new Error("Invalid zip file"));

		const buffer = Buffer.from("invalid zip content");

		await expect(extractProtocol(buffer)).rejects.toThrow("Invalid zip file");
	});

	it("should handle protocol with complex structure", async () => {
		const mockProtocol = {
			schemaVersion: 8,
			name: "Complex Protocol",
			description: "A complex protocol with many fields",
			stages: [
				{
					id: "stage1",
					type: "NameGenerator",
					label: "Name Generator Stage",
				},
			],
			codebook: {
				node: {
					person: {
						name: "Person",
						variables: {
							name: {
								type: "text",
								label: "Name",
							},
						},
					},
				},
				edge: {},
				ego: {},
			},
		};

		const mockZipFile = {
			async: vi.fn().mockResolvedValue(JSON.stringify(mockProtocol)),
		};

		const mockZip = {
			file: vi.fn().mockReturnValue(mockZipFile),
		};

		vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as never);

		const buffer = Buffer.from("mock zip content");
		const result = await extractProtocol(buffer);

		expect(result).toEqual({ protocol: mockProtocol, assets: [] });
	});

	it("should handle protocol with special characters", async () => {
		const mockProtocol = {
			schemaVersion: 8,
			name: "Protocol with 特殊字符 and émojis 🎉",
			description: "Testing unicode support: café, naïve, 日本語",
		};

		const mockZipFile = {
			async: vi.fn().mockResolvedValue(JSON.stringify(mockProtocol)),
		};

		const mockZip = {
			file: vi.fn().mockReturnValue(mockZipFile),
		};

		vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as never);

		const buffer = Buffer.from("mock zip content");
		const result = await extractProtocol(buffer);

		expect(result).toEqual({ protocol: mockProtocol, assets: [] });
	});

	it("should handle minimal protocol structure", async () => {
		const mockProtocol = {
			schemaVersion: 8,
		};

		const mockZipFile = {
			async: vi.fn().mockResolvedValue(JSON.stringify(mockProtocol)),
		};

		const mockZip = {
			file: vi.fn().mockReturnValue(mockZipFile),
		};

		vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as never);

		const buffer = Buffer.from("mock zip content");
		const result = await extractProtocol(buffer);

		expect(result).toEqual({ protocol: mockProtocol, assets: [] });
	});

	it("should handle protocol with null values", async () => {
		const mockProtocol = {
			schemaVersion: 8,
			name: "Test",
			description: null,
			stages: null,
		};

		const mockZipFile = {
			async: vi.fn().mockResolvedValue(JSON.stringify(mockProtocol)),
		};

		const mockZip = {
			file: vi.fn().mockReturnValue(mockZipFile),
		};

		vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as never);

		const buffer = Buffer.from("mock zip content");
		const result = await extractProtocol(buffer);

		expect(result).toEqual({ protocol: mockProtocol, assets: [] });
	});

	it("should throw error when async method fails", async () => {
		const mockZipFile = {
			async: vi.fn().mockRejectedValue(new Error("Failed to read file")),
		};

		const mockZip = {
			file: vi.fn().mockReturnValue(mockZipFile),
		};

		vi.mocked(JSZip.loadAsync).mockResolvedValue(mockZip as never);

		const buffer = Buffer.from("mock zip content");

		await expect(extractProtocol(buffer)).rejects.toThrow("Failed to read file");
	});
});
