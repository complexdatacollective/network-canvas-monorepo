const API_HOST = "us.i.posthog.com";
const ASSET_HOST = "us-assets.i.posthog.com";

async function handleRequest(request: Request, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);
	const pathname = url.pathname;
	const search = url.search;
	const pathWithParams = pathname + search;

	if (pathname.startsWith("/static/")) {
		return retrieveStatic(request, pathWithParams, ctx);
	}
	return forwardRequest(request, pathWithParams);
}

async function retrieveStatic(request: Request, pathname: string, ctx: ExecutionContext): Promise<Response> {
	let response = await caches.default.match(request);
	if (!response) {
		response = await fetch(`https://${ASSET_HOST}${pathname}`);
		ctx.waitUntil(caches.default.put(request, response.clone()));
	}
	return response;
}

async function forwardRequest(request: Request, pathWithSearch: string): Promise<Response> {
	const ip = request.headers.get("CF-Connecting-IP") || "";
	const originHeaders = new Headers(request.headers);
	originHeaders.delete("cookie");
	originHeaders.set("X-Forwarded-For", ip);

	const originRequest = new Request(`https://${API_HOST}${pathWithSearch}`, {
		method: request.method,
		headers: originHeaders,
		body: request.body,
		redirect: request.redirect,
	});

	return await fetch(originRequest);
}

export default {
	async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
		return handleRequest(request, ctx);
	},
} satisfies ExportedHandler<Env>;
