/**
 * How tall the area every route is drawn in is, as a CSS custom property on
 * the document root.
 *
 * It is the window less the notices stacked above the routes (the install
 * prompt, the protocol-lock banner), which come and go and wrap. Something
 * bounded to the room a route has must read this rather than `100dvh`, or it
 * runs a notice's height past the foot of the window. Measured in `App`; read
 * with `100dvh` as the fallback for the moment before the first measurement.
 */
export const ROUTE_HEIGHT_VARIABLE = '--architect-route-height';
