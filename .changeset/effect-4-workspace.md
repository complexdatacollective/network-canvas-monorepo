---
'@codaco/network-exporters': major
'fresco': minor
'@codaco/interviewer': minor
---

Effect 4.

`@codaco/network-exporters` is built against Effect 4 and no longer bundles or
depends on Effect itself: `effect` is now a **peer dependency**
(`^4.0.0-rc.115`). Install it alongside the package, or the package will not
resolve at runtime. Effect 4 has no stable release yet, so ask for the release
candidate by tag — `npm install effect@rc`. A plain `effect@^4` matches
nothing, because a caret range with no prerelease component does not match a
prerelease. The peer is what guarantees one Effect copy, and so one fiber
runtime, in an application that also uses Effect directly.

Two pieces of the package's public surface change shape with the major:

- The three service tags — `InterviewRepository`, `ProtocolRepository` and
  `Output` — are `Context.Service` classes rather than `Context.Tag` classes.
  Providing them is unchanged (`Layer.succeed(Output, impl)` still works); only
  the declaration form differs, which matters if you were extending or
  re-declaring one.
- `Fiber.RuntimeFiber` collapsed into `Fiber.Fiber` in Effect 4, so the sink
  handle that `makeZipOutput` carries is typed `Fiber.Fiber<OutputResult,
OutputError>`.

Error classes are unchanged: they remain `Data.TaggedError`, so nothing in the
package's public types pulls in Effect Schema.

Fresco and Interviewer move to Effect 4 with it, and each picks up a fix to a
drain that Effect 4 made visible:

- Fresco's batch export flushes its remaining progress events by ending the
  queue and taking what is buffered. Effect 4's `Queue.takeAll` suspends on an
  open empty queue instead of returning nothing, and an empty queue at that
  point is the ordinary case, so the old line would have hung the export's
  response open indefinitely.
- Interviewer's export runner now ends its event queue and joins the drain
  fiber before finishing, so every progress event has reached the UI callback
  before the export resolves. Previously the last events were delivered only
  because the pipeline happened to yield to the scheduler between them, and
  were dropped when it did not.
