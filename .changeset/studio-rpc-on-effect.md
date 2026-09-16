---
'@codaco/studio-client': minor
'@codaco/studio-server': minor
---

Studio's own API now runs on Effect's RPC transport. The server serves the
researcher-facing procedures at `/rpc`, and the web client calls them through a
typed client built from the same contract, so the two halves can no longer
disagree about what a procedure takes or returns: a mistake that used to
surface as a runtime error in a browser is now a compile error.

What a researcher notices is the error messages. Each procedure declares the
refusals it can actually produce, and the client branches on those rather than
on an HTTP status code, so a refusal arrives with its reason intact. The
clearest case: inviting someone whose invitation is already being sent now says
so, instead of reporting a conflict. A request whose shape is wrong is refused
at the boundary rather than part-way through a handler, and a refusal the
server issues before it reaches a procedure — a rate limit, a maintenance
window, a request from the wrong origin — reaches the client as that refusal
rather than as an empty response.

The tab identity both transports use to own an editing lease now travels in a
header on the fetch plane and is rewritten into the same header on the
WebSocket upgrade, so one rule describes it everywhere. The protocol editor
keeps its existing socket transport.
