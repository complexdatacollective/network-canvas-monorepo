import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

// Orchestrates a one-command dev experience for the e2e host:
//   1. Run bootstrap-host to extract the silos protocol into e2e/.assets/silos/
//   2. Spawn the asset server (port 4200)
//   3. Spawn the vite host (port 4101)
//   4. Open the user's default browser at ?bootstrap=silos so App.tsx
//      auto-installs the protocol — no console paste required.

const PKG_ROOT = path.resolve(import.meta.dirname, "..", "..");
const HOST_URL = "http://localhost:4101";
const ASSET_URL = "http://localhost:4200";
const SLUG = "silos";

const procs: ChildProcess[] = [];

function shutdown(code: number): never {
	for (const proc of procs) {
		if (!proc.killed) proc.kill("SIGTERM");
	}
	process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function waitForUrl(url: string, timeoutMs = 30_000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			await fetch(url);
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 200));
		}
	}
	throw new Error(`Timeout waiting for ${url}`);
}

function runOnce(command: string, args: readonly string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd: PKG_ROOT, stdio: "inherit" });
		child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
		child.on("error", reject);
	});
}

function spawnLong(command: string, args: readonly string[], label: string): ChildProcess {
	const child = spawn(command, args, { cwd: PKG_ROOT, stdio: "inherit" });
	procs.push(child);
	child.on("exit", (code) => {
		if (code !== 0 && code !== null) {
			process.stderr.write(`\n${label} exited unexpectedly (code ${code}).\n`);
			shutdown(1);
		}
	});
	return child;
}

async function main(): Promise<void> {
	process.stdout.write("Preparing protocol bundle...\n");
	await runOnce("pnpm", ["exec", "tsx", "e2e/scripts/bootstrap-host.ts", "e2e/data/silos.netcanvas", SLUG]);

	process.stdout.write("\nStarting asset server (4200) and vite host (4101)...\n");
	spawnLong("pnpm", ["exec", "tsx", "e2e/helpers/assetServer.ts"], "asset server");
	spawnLong("pnpm", ["exec", "vite", "--config", "e2e/host/vite.config.ts"], "vite host");

	// Hit a known-404 path on the asset server so it returns a real response
	// rather than crashing on the directory-as-file read it does for `/`.
	await waitForUrl(`${ASSET_URL}/${SLUG}/bootstrap.json`);
	await waitForUrl(HOST_URL);

	const url = `${HOST_URL}/?bootstrap=${SLUG}`;
	const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	spawn(opener, [url], { stdio: "ignore", detached: true }).unref();

	process.stdout.write(`\nOpened ${url}\nPress Ctrl+C to stop both servers.\n`);
}

await main();
