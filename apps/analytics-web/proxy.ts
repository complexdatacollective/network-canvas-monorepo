import { clerkClient, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/verification(.*)"]);

export default clerkMiddleware(async (auth, req) => {
	// Restrict admin route to users with specific role
	if (!isPublicRoute(req)) {
		const result = await auth.protect();
		const client = await clerkClient();
		const user = await client.users.getUser(result.userId);
		const isVerified = user.publicMetadata.verified;

		if (!isVerified) {
			return NextResponse.redirect(new URL("/verification", req.nextUrl));
		}
	}
});

// all routes except static files and /api/event
export const config = {
	matcher: ["/", "/((?!api|static|.*\\..*|_next).*)"],
};
