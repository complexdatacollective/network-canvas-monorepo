const API_HOST = "us.i.posthog.com";
const ASSET_HOST = "us-assets.i.posthog.com";
const DUMMY_API_KEY = "phc_proxy_mode_placeholder";

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);

	if (url.pathname.startsWith("/static/")) {
		return retrieveStatic(request, url.pathname + url.search, ctx);
	}

	return forwardRequest(request, env, url, ctx);
}

async function retrieveStatic(request: Request, pathname: string, ctx: ExecutionContext): Promise<Response> {
	let response = await caches.default.match(request);
	if (!response) {
		response = await fetch(`https://${ASSET_HOST}${pathname}`);
		ctx.waitUntil(caches.default.put(request, response.clone()));
	}
	return response;
}

async function forwardRequest(request: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
	const ip = request.headers.get("CF-Connecting-IP") || "";
	const originHeaders = new Headers(request.headers);
	originHeaders.delete("cookie");
	originHeaders.set("X-Forwarded-For", ip);

	// Replace dummy API key in URL path (e.g. /array/phc_proxy_mode_placeholder/config)
	const pathname = url.pathname.replaceAll(DUMMY_API_KEY, env.POSTHOG_API_KEY);

	const targetUrl = new URL(`https://${API_HOST}${pathname}`);
	for (const [key, value] of url.searchParams) {
		targetUrl.searchParams.set(key, value);
	}

	let body: BodyInit | null = null;

	if (request.method === "POST" && request.body) {
		const compression = url.searchParams.get("compression");

		if (compression === "gzip-js" || compression === "gzip") {
			body = await decompressAndInject(request.body, env.POSTHOG_API_KEY);
			targetUrl.searchParams.delete("compression");
			originHeaders.set("Content-Type", "application/json");
			originHeaders.delete("Content-Encoding");
		} else if (compression === "base64") {
			body = await decodeBase64AndInject(request, env.POSTHOG_API_KEY);
			targetUrl.searchParams.delete("compression");
			originHeaders.set("Content-Type", "application/json");
		} else {
			try {
				const text = await request.text();
				body = injectApiKey(text, env.POSTHOG_API_KEY);
			} catch {
				body = request.body;
			}
		}
	}

	const response = await fetch(
		new Request(targetUrl.toString(), {
			method: request.method,
			headers: originHeaders,
			body,
			redirect: request.redirect,
		}),
	);

	// Cache config.js responses at the edge
	if (pathname.endsWith("/config.js") || pathname.endsWith("/config")) {
		const cachedResponse = new Response(response.body, response);
		ctx.waitUntil(caches.default.put(request, cachedResponse.clone()));
		return cachedResponse;
	}

	return response;
}

async function decompressAndInject(body: ReadableStream, apiKey: string): Promise<string> {
	const decompressed = body.pipeThrough(new DecompressionStream("gzip"));
	const text = await new Response(decompressed).text();
	return injectApiKey(text, apiKey);
}

async function decodeBase64AndInject(request: Request, apiKey: string): Promise<string> {
	const encoded = await request.text();
	const text = atob(encoded);
	return injectApiKey(text, apiKey);
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
