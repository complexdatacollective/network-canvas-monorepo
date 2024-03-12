import { authMiddleware, clerkClient, redirectToSignIn } from '@clerk/nextjs';
import { NextResponse } from 'next/server';

// This example protects all routes including api/trpc routes
// Please edit this to allow other routes to be public as needed.
// See https://clerk.com/docs/references/nextjs/auth-middleware for more information about configuring your Middleware
export default authMiddleware({
  publicRoutes: ['/verification'],
  ignoredRoutes: ['/api/event'],
  async afterAuth(auth, req, _) {
    // handle users who aren't authenticated
    if (!auth.userId && !auth.isPublicRoute) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return redirectToSignIn({ returnBackUrl: req.url });
    }

    // handle users who aren't verified
    if (auth.userId) {
      const user = await clerkClient.users.getUser(auth.userId);
      const isVerified = user?.publicMetadata?.verified;

      if (!isVerified && req.nextUrl.pathname !== '/verification') {
        return NextResponse.redirect(new URL('/verification', req.nextUrl));
      }
    }
  },
});

// all routes except static files and /api/event
export const config = {
  matcher: ['/', '/((?!api|static|.*\\..*|_next).*)'],
};
