const API_HOST = "us.i.posthog.com";
const ASSET_HOST = "us-assets.i.posthog.com";

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);

	if (url.pathname.startsWith("/static/")) {
		return retrieveStatic(request, url.pathname + url.search, ctx);
	}

	return forwardRequest(request, env, url);
}

async function retrieveStatic(request: Request, pathname: string, ctx: ExecutionContext): Promise<Response> {
	let response = await caches.default.match(request);
	if (!response) {
		response = await fetch(`https://${ASSET_HOST}${pathname}`);
		ctx.waitUntil(caches.default.put(request, response.clone()));
	}
	return response;
}

async function forwardRequest(request: Request, env: Env, url: URL): Promise<Response> {
	const ip = request.headers.get("CF-Connecting-IP") || "";
	const originHeaders = new Headers(request.headers);
	originHeaders.delete("cookie");
	originHeaders.set("X-Forwarded-For", ip);

	const targetUrl = new URL(`https://${API_HOST}${url.pathname}`);
	for (const [key, value] of url.searchParams) {
		targetUrl.searchParams.set(key, value);
	}

	let body: BodyInit | null = null;

	if (request.method === "POST" && request.body) {
		const compression = url.searchParams.get("compression");

		if (compression === "gzip-js" || compression === "gzip") {
			try {
				const decompressed = request.body.pipeThrough(new DecompressionStream("gzip"));
				const text = await new Response(decompressed).text();
				body = injectApiKey(text, env.POSTHOG_API_KEY);
				targetUrl.searchParams.delete("compression");
				originHeaders.set("Content-Type", "application/json");
				originHeaders.delete("Content-Encoding");
			} catch {
				body = request.body;
			}
		} else {
			try {
				const text = await request.text();
				body = injectApiKey(text, env.POSTHOG_API_KEY);
			} catch {
				body = request.body;
			}
		}
	}

	return await fetch(
		new Request(targetUrl.toString(), {
			method: request.method,
			headers: originHeaders,
			body,
			redirect: request.redirect,
		}),
	);
}

function injectApiKey(text: string, apiKey: string): string {
	try {
		const data = JSON.parse(text);
		if (typeof data === "object" && data !== null) {
			if ("api_key" in data) data.api_key = apiKey;
			if ("token" in data) data.token = apiKey;
			return JSON.stringify(data);
		}
	} catch {
		// Not valid JSON — return unmodified
	}
	return text;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return handleRequest(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
