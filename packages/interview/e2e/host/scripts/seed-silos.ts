// One-shot helper: extracts the SILOS protocol into static files under
// e2e/host/public/ so a browser can hydrate sessionStorage and load the
// host without the Playwright fixture infrastructure.
//
// Usage: pnpm --filter @codaco/interview tsx e2e/host/scripts/seed-silos.ts
//
// Outputs:
//   e2e/host/public/silos-state.json     — SerializableState matching `__e2e_test_state`
//   e2e/host/public/silos-assets/<id>/.. — asset files (referenced by the rewritten payload)

import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CurrentProtocolSchema, extractProtocol } from "@codaco/protocol-validation";
import { v4 as uuid } from "uuid";
import type { ProtocolPayload, ResolvedAsset, SessionPayload } from "../../../src/contract/types.js";
import { createInitialNetwork } from "../../../src/store/modules/session.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST_ROOT = path.resolve(HERE, "..");
const SILOS_PROTOCOL = path.resolve(HOST_ROOT, "../data/silos.netcanvas");
const PUBLIC_DIR = path.resolve(HOST_ROOT, "public");
const ASSET_DIR_REL = "silos-assets";

type AssetEntry = {
	name: string;
	type: string;
	source?: string;
	value?: string;
};

function isAssetEntry(entry: unknown): entry is AssetEntry {
	return typeof entry === "object" && entry !== null && "type" in entry;
}

const validTypes = ["image", "video", "audio", "network", "geojson"] as const;
type ValidType = (typeof validTypes)[number];
function isValidType(t: string): t is ValidType {
	return (validTypes as readonly string[]).includes(t);
}

async function main(): Promise<void> {
	process.stdout.write(`Reading ${SILOS_PROTOCOL}…\n`);
	const fileBuffer = await fs.readFile(SILOS_PROTOCOL);
	const { protocol: protocolJson, assets: extractedAssets } = await extractProtocol(fileBuffer);

	const protocolId = uuid();
	const protocolAssetDir = path.join(PUBLIC_DIR, ASSET_DIR_REL, protocolId);
	await fs.rm(path.join(PUBLIC_DIR, ASSET_DIR_REL), { recursive: true, force: true });
	await fs.mkdir(protocolAssetDir, { recursive: true });

	const manifest = protocolJson.assetManifest ?? {};
	let written = 0;
	for (const asset of extractedAssets) {
		const manifestEntry = manifest[asset.id];
		if (!manifestEntry || typeof manifestEntry !== "object" || !("type" in manifestEntry)) continue;
		if (manifestEntry.type === "apikey") continue;
		if (!("source" in manifestEntry) || typeof manifestEntry.source !== "string") continue;

		const destPath = path.join(protocolAssetDir, manifestEntry.source);
		await fs.mkdir(path.dirname(destPath), { recursive: true });
		const content = asset.data instanceof Blob ? Buffer.from(await asset.data.arrayBuffer()) : asset.data;
		await fs.writeFile(destPath, content);
		written += 1;
	}
	process.stdout.write(`Wrote ${written} asset file(s) to ${protocolAssetDir}\n`);

	// Rewrite asset:// URLs to absolute paths the Vite dev server can serve from /public.
	const assetUrlBase = `/${ASSET_DIR_REL}/${protocolId}`;
	const protocolJsonStr = JSON.stringify(protocolJson);
	const rewrittenStr = protocolJsonStr.replace(/asset:\/\/([^"]+)/g, `${assetUrlBase}/$1`);
	const rewrittenProtocol = CurrentProtocolSchema.parse(JSON.parse(rewrittenStr));

	const assets: ResolvedAsset[] = [];
	const assetUrls: Record<string, string> = {};
	if (rewrittenProtocol.assetManifest) {
		for (const [assetId, entry] of Object.entries(rewrittenProtocol.assetManifest)) {
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
			assetUrls[assetId] = `${assetUrlBase}/${entry.source}`;
		}
	}

	const protocolPayload: ProtocolPayload = {
		...rewrittenProtocol,
		id: protocolId,
		importedAt: new Date().toISOString(),
		assets,
	};

	const interviewId = uuid();
	const session: SessionPayload = {
		id: interviewId,
		startTime: new Date().toISOString(),
		finishTime: null,
		exportTime: null,
		lastUpdated: new Date().toISOString(),
		network: createInitialNetwork(),
		currentStep: 0,
	};

	// Matches the SerializableState shape testHooks.persistState() writes.
	const serializable = {
		protocols: { [protocolId]: protocolPayload },
		interviews: {
			[interviewId]: {
				protocolId,
				participantId: "seed-silos-participant",
				session,
			},
		},
		assetUrls,
	};

	const meta = { protocolId, interviewId, storageKey: "__e2e_test_state" };
	const statePath = path.join(PUBLIC_DIR, "silos-state.json");
	await fs.mkdir(PUBLIC_DIR, { recursive: true });
	await fs.writeFile(statePath, JSON.stringify({ meta, state: serializable }, null, 2));
	process.stdout.write(`Wrote ${statePath}\n`);
	process.stdout.write(`Interview ID: ${interviewId}\n`);
	process.stdout.write(`Protocol ID: ${protocolId}\n`);
}

await main();
