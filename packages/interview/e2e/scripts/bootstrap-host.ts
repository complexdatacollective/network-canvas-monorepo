import fs from "node:fs/promises";
import path from "node:path";
import {
	type Codebook,
	type CurrentProtocol,
	CurrentProtocolSchema,
	extractProtocol,
	hashProtocol,
} from "@codaco/protocol-validation";
import { v4 as uuid } from "uuid";
import type { ProtocolPayload, ResolvedAsset } from "../../src/contract/types.ts";

type AssetEntry = { name: string; type: string; source?: string; value?: string };

const HOST_URL = "http://localhost:4101";
const ASSET_SERVER_URL = "http://localhost:4200";
const ASSET_DIR = path.resolve(import.meta.dirname, "..", ".assets");

const protocolPath = process.argv[2] ?? path.resolve(import.meta.dirname, "..", "data", "silos.netcanvas");
// Slug names the asset-server-served directory holding both the prepared
// `bootstrap.json` and the extracted asset files. Stable per protocol so the
// auto-bootstrap URL (`?bootstrap=<slug>`) doesn't change between runs.
const slug = process.argv[3] ?? path.basename(protocolPath, path.extname(protocolPath));

async function main(): Promise<void> {
	const fileBuffer = await fs.readFile(protocolPath);
	const { protocol: protocolJson, assets: extractedAssets } = await extractProtocol(fileBuffer);

	const protocolId = uuid();
	const protocolAssetDir = path.join(ASSET_DIR, slug);
	await fs.rm(protocolAssetDir, { recursive: true, force: true });
	await fs.mkdir(protocolAssetDir, { recursive: true });

	const manifest = protocolJson.assetManifest ?? {};
	for (const asset of extractedAssets) {
		const entry = manifest[asset.id];
		if (!entry || typeof entry !== "object" || !("type" in entry)) continue;
		if (entry.type === "apikey") continue;
		if (!("source" in entry) || typeof entry.source !== "string") continue;

		const destPath = path.join(protocolAssetDir, entry.source);
		await fs.mkdir(path.dirname(destPath), { recursive: true });
		const content = asset.data instanceof Blob ? Buffer.from(await asset.data.arrayBuffer()) : asset.data;
		await fs.writeFile(destPath, content);
	}

	const rewrittenStr = JSON.stringify(protocolJson).replace(/asset:\/\/([^"]+)/g, `${ASSET_SERVER_URL}/${slug}/$1`);
	const rewrittenProtocol: CurrentProtocol = CurrentProtocolSchema.parse(JSON.parse(rewrittenStr));

	const assets: ResolvedAsset[] = buildResolvedAssets(rewrittenProtocol);
	const assetUrls = buildAssetUrls(rewrittenProtocol, slug);

	const payload: ProtocolPayload = {
		...(rewrittenProtocol as Omit<CurrentProtocol, "assetManifest"> & { codebook: Codebook }),
		id: protocolId,
		hash: hashProtocol(rewrittenProtocol),
		importedAt: new Date().toISOString(),
		assets,
	};

	const bootstrapPath = path.join(protocolAssetDir, "bootstrap.json");
	await fs.writeFile(bootstrapPath, JSON.stringify({ protocol: payload, assetUrls }, null, 0));

	process.stdout.write(`Protocol prepared: ${rewrittenProtocol.name ?? "Untitled"} (slug=${slug})\n`);
	process.stdout.write(`Open ${HOST_URL}/?bootstrap=${slug} to enter the interview.\n`);
}

function buildResolvedAssets(protocol: CurrentProtocol): ResolvedAsset[] {
	if (!protocol.assetManifest) return [];
	const validTypes = ["image", "video", "audio", "network", "geojson"] as const;
	type ValidType = (typeof validTypes)[number];

	function isAssetEntry(entry: unknown): entry is AssetEntry {
		return typeof entry === "object" && entry !== null && "type" in entry;
	}
	function isValidType(t: string): t is ValidType {
		return (validTypes as readonly string[]).includes(t);
	}

	const assets: ResolvedAsset[] = [];
	for (const [assetId, entry] of Object.entries(protocol.assetManifest)) {
		if (!isAssetEntry(entry)) continue;
		if (entry.type === "apikey") {
			assets.push({
				assetId,
				name: entry.name,
				type: "apikey",
				value: typeof entry.value === "string" ? entry.value : undefined,
			});
			continue;
		}
		if (!entry.source) continue;
		if (!isValidType(entry.type)) continue;
		assets.push({ assetId, name: entry.name, type: entry.type });
	}
	return assets;
}

function buildAssetUrls(protocol: CurrentProtocol, protocolId: string): Record<string, string> {
	const urls: Record<string, string> = {};
	const manifest = protocol.assetManifest;
	if (!manifest) return urls;
	for (const [assetId, entry] of Object.entries(manifest)) {
		if (!entry || typeof entry !== "object") continue;
		if (!("type" in entry) || entry.type === "apikey") continue;
		if (!("source" in entry) || typeof entry.source !== "string") continue;
		urls[assetId] = `${ASSET_SERVER_URL}/${protocolId}/${entry.source}`;
	}
	return urls;
}

await main();
