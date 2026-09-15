---
'@codaco/protocol-validation': major
'@codaco/architect': minor
'@codaco/interviewer': patch
'fresco': patch
---

Open a protocol whose resources are missing, and never write one that is

A protocol whose archive was missing one of its files could not be opened at
all, in any version of Architect. Architect now opens it, says which resources
are missing, and offers to add the files from Resources — every stage, prompt
and variable in it stays exactly as it was. Interviewer and Fresco still refuse
such a protocol, because a resource that never loads would surface to a
participant mid-interview.

Downloading a protocol whose resources cannot all be read is now refused rather
than quietly producing a file without them. That file could not be opened
anywhere: dropping a resource left the stages that used it pointing at nothing.
Nothing is lost by refusing — the protocol stays in your library exactly as it
was, and the message names the files to restore.

A protocol archive whose contents are damaged is now described as damaged,
instead of falling back to "could not be opened". The message shown when a
protocol refers to a file it does not contain names the resource as you named
it, rather than its internal filename.

Opening a protocol that turns out to be damaged, unreadable, or too old to
upgrade is no longer recorded as an application error by Architect or Fresco.
Those are answers about the file, and recording them buried the failures that
are real faults; the kind of problem is recorded instead, which also keeps your
own resource names out of analytics.

Fresco now reads archives through the shared reader, so the limit that protects
against a maliciously compressed protocol applies to its imports too, and its
media is resolved against the manifest that shipped inside the archive.
Interviewer reads a pending protocol's name under the same limit.

**Breaking (`@codaco/protocol-validation`):** `extractProtocol` and
`extractProtocolFromZip` no longer throw when the manifest names a file the
archive does not contain. They return it in a new `missingAssets` array and
leave the policy to the host; call `missingAssetsError` to raise the refusal
runtimes share. Also adds `createNetcanvasReader`, for hosts that read
`protocol.json` and the media separately under one shared inflation limit,
exports `getProtocolFileErrorKind` for classifying a failure without formatting
a message, and adds `unreadable-entry` to `MalformedNetcanvasReason`.
