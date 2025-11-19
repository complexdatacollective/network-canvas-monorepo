interface GitHubRelease {
	tag_name: string;
	name: string;
	assets: GitHubAsset[];
}

interface GitHubAsset {
	name: string;
	browser_download_url: string;
}

export default {
	async fetch(request: Request): Promise<Response> {
		// Handle CORS preflight requests
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 200,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
				},
			});
		}

		try {
			// Get all releases from GitHub API
			const releaseResponse = await fetch(
				"https://api.github.com/repos/complexdatacollective/network-canvas-monorepo/releases",
				{
					headers: {
						"User-Agent": "cloudflare-worker",
					},
				},
			);

			if (!releaseResponse.ok) {
				return new Response("Failed to fetch releases", { status: 500 });
			}

			const releases: GitHubRelease[] = await releaseResponse.json();

			// Find all development protocol releases and sort by timestamp
			const developmentReleases = releases
				.filter((release) => release.name?.includes("@codaco/development-protocol-"))
				.sort((a, b) => {
					// Extract timestamp from release name (format: @codaco/development-protocol-YYYYMMDDHHMMSS-SHA)
					const timestampA = a.name.match(/@codaco\/development-protocol-(\d{14})/)?.[1] || "0";
					const timestampB = b.name.match(/@codaco\/development-protocol-(\d{14})/)?.[1] || "0";
					return timestampB.localeCompare(timestampA); // Sort descending (latest first)
				});

			if (developmentReleases.length === 0) {
				return new Response("No development protocol releases found", { status: 404 });
			}

			const release = developmentReleases[0]; // Get the latest development protocol release

			// Find the Development.netcanvas asset
			const developmentAsset = release.assets.find((asset) => asset.name === "Development.netcanvas");

			if (!developmentAsset) {
				return new Response("Development.netcanvas asset not found in latest release", { status: 404 });
			}

			// Fetch the actual asset
			const assetResponse = await fetch(developmentAsset.browser_download_url);

			if (!assetResponse.ok) {
				return new Response("Failed to fetch Development.netcanvas asset", { status: 500 });
			}

			// Create response with CORS headers
			return new Response(assetResponse.body, {
				status: 200,
				headers: {
					"Content-Type": assetResponse.headers.get("Content-Type") || "application/octet-stream",
					"Content-Disposition": 'attachment; filename="Development.netcanvas"',
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
					"Cache-Control": "public, max-age=300", // Cache for 5 minutes
				},
			});
		} catch (error) {
			console.error("Error fetching Development.netcanvas:", error);
			return new Response("Internal server error", { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;
