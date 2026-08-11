import { STUDIO_VERSION } from './version.ts';

// The domain layer: one implementation of app behaviour that every surface
// adapter calls into — the internal RPC surface (src/rpc.ts), the public data
// API (src/api.ts), and eventually the sync protocol. Per the surface
// separation decided 2026-08-11 on #1248, the surfaces share this layer and
// nothing else: no surface is generated from another. One function for now;
// the shape is the point.

export type InstanceStatus = {
  name: string;
  version: string;
};

export function getInstanceStatus(): InstanceStatus {
  return {
    name: 'Network Canvas Studio',
    version: STUDIO_VERSION,
  };
}
