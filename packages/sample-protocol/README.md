# @codaco/sample-protocol

Compatibility package for the Network Canvas sample protocol.

The canonical source lives in `@codaco/protocols` at `packages/protocols/sample`.
This package intentionally tracks only wrapper metadata; `protocol.json` and
`assets/` are generated from the canonical source during `prepack` so existing
npm consumers can keep importing `@codaco/sample-protocol`.
