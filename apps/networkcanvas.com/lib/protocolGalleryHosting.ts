// The gallery is exported as a route of this site and *also* served from its
// own subdomain, which is a Netlify domain alias of the same deploy. The edge
// function maps gallery-host paths onto these exported routes, so both the app
// and the edge runtime need the same two facts.
export const protocolGalleryHost = 'protocolgallery.networkcanvas.com';
export const protocolGalleryOrigin = `https://${protocolGalleryHost}`;
export const protocolGalleryPathPrefix = '/protocol-gallery';
