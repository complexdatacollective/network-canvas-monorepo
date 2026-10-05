/**
 * The `id` `SiteNavigation`'s skip link jumps to, unless a host overrides it
 * with `skipToId`. This is the whole contract between the header and the page
 * around it: whatever renders the header must carry this `id` on the element
 * where its content starts, or the skip link has nothing to land on.
 *
 * It lives in its own module, away from the component, so a page can mark its
 * target with the same value the header links to — rather than a literal that
 * can drift from it — without importing the header itself. Several of the
 * website's tests isolate a hero section from the real navigation, and pulling
 * the component in just to read a string would defeat that.
 */
export const SITE_NAVIGATION_SKIP_TARGET_ID = 'main-content';
