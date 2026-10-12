# @codaco/protocol-builder-core

The half of the protocol builder that has no host and no user interface: the
Effect rpc group a protocol-authoring host serves, the schemas its procedures
validate against, the typed errors it refuses with, and the host-session
middleware every procedure runs behind. Architect's in-process host, Studio's
server and the Studio RPC boundary all speak this contract
without depending on `@codaco/protocol-builder`, which holds the React editors
and therefore `@codaco/fresco-ui` — a package boundary rather than a
convention, because turbo invalidates consumers through the dependency graph
regardless of which exports they import.
