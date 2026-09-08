# @codaco/protocol-builder

The protocol-authoring surface Architect and Studio share: an editing session
over one protocol section, a stage editor for every interface in the schema,
and the host contract that connects them.

It is **private and unpublished**, consumed source-first from this workspace
(`"@codaco/protocol-builder": "workspace:^"`); there is no `dist/`, no npm
tarball, and no changeset may name it.

## What it does not own

No store, no router, no protocol document, no codebook model, no undo stack,
and no validation of the host's own. The session owns all of that. A host that
keeps a second copy of any of it is the thing that will drift.

The package also holds no transport. Every one of the responsibilities below
is a function the host supplies or a method the host calls; nothing here talks
to a server.

## The host contract

Six things, and nothing else. Each is a session option the host passes or a
session method it calls.

<!-- HOST_RESPONSIBILITIES:start -->

1. Open the session on the stage the researcher chose, with the protocol’s
   sections, the revision they were read at, and the access the section lock
   granted.
   — `protocolSections`, `manifestRevision`, `access`
2. Commit each batch of commands in the order it is made, then answer with
   receiveAuthoritativeUpdate and acknowledge under the revision that
   committed it.
   — `onCommands`, `acknowledge`
3. Pass on what changes elsewhere: receiveAuthoritativeUpdate for a newer
   revision, and replaceAuthoritativeStage when the stage itself moved while
   this session was only reading.
   — `receiveAuthoritativeUpdate`, `replaceAuthoritativeStage`
4. Own the section lock: setAccess to read-only the moment it is lost, and
   back to editable when it is regained under its new epoch.
   — `setAccess`
5. Carry a compound edit to the protocol as one atomic change, and answer with
   what it applied, blocked or refused.
   — `onCompoundEdit`
6. Provide the resource gateway, and apply a finish’s stage document and its
   resource manifest in the same revision.
   — `resourceGateway`

<!-- HOST_RESPONSIBILITIES:end -->

That list is generated from `HOST_RESPONSIBILITIES` and
`HOST_RESPONSIBILITY_CALLS` in `@codaco/protocol-builder/testing/hostResponsibilities`;
`src/__tests__/readme.test.ts` regenerates it and fails when the two disagree,
so the contract cannot be changed without this section changing with it.

**The executable version is the proof host.** `src/testing/StudioProofHost.stories.tsx`
is a host that discharges all six with no store, no router and no protocol
document of its own, and drives each of them from a story: a colleague's
codebook change arriving, a section lock lost and regained, a compound edit
refused, a file imported and saved with the stage, an editor closed without
saving. Read it before writing a host of your own.

**Studio, the one real host today, discharges four of the six.**
`apps/studio/client/src/editor/useStudioStageSession.ts` does 1 to 4 and
supplies neither `onCompoundEdit` nor a `resourceGateway`: neither has a Studio
transport yet. So 5 and 6 are proved by the proof host and nowhere else, and
`apps/studio/client/src/editor/__tests__/hostResponsibilities.test.ts` reads
that adapter and fails when the division changes.

## Session and controller

```ts
import { ProtocolBuilderSessionStore, stageDraftFromDocument } from '@codaco/protocol-builder/session';
import { useStageEditorController } from '@codaco/protocol-builder/controller';
```

`stageDraftFromDocument` splits a stored stage into the identity the session
owns (`id`, `type`) and the fields the editor edits. `ProtocolBuilderSessionStore`
takes those, the protocol's other sections, the revision they were read at, and
the access the lock granted; `useStageEditorController` subscribes a React tree
to it and exposes the writes an editor makes — `setField`, `unsetField`,
`insertItem`, `removeItem`, `moveItem`, `applyCommands`, `changeFields`, plus
`undo`, `redo`, `validate`, `requestCompoundEdit`, `finish` and `cancel`.

The stage type is read from the session, never passed as a prop: a host that
could pass a different one could render a sociogram editor over a name
generator's document.

## The registry and `StageEditor`

```tsx
import StageEditor from '@codaco/protocol-builder/StageEditor';

<StageEditor controller={controller} actions={saveChrome} />;
```

`StageEditor` looks the editor up in `stageEditorRegistry` and renders it. The
registry is exhaustive by construction: `stageEditorRegistry` is annotated
`StageEditorRegistry`, which requires an entry for every `StageType`, so a
stage type added to the schema fails **this package's `typecheck`** until an
editor exists for it. There is no "no editor for this interface" state for a
researcher to land in.

A host replacing one interface passes a whole registry, never a subset:

```tsx
<StageEditor
  controller={controller}
  registry={{ ...stageEditorRegistry, Sociogram: hostsOwnSociogramEditor }}
/>
```

`actions` is the host's own save chrome. It is rendered in the editor's action
slot and is handed the form id to submit (`<button form={formId}>`), because a
host reaching an editor through the dispatcher never names the component.

## Buffering hosts and live-applying hosts

The difference is one option, `onCommands`.

- **Buffering** (no `onCommands`): the session holds every batch and the host
  receives the whole stage document at `finish`. This is the shape Architect
  will take — one atomic write when the researcher saves.
- **Live-applying** (`onCommands` supplied): each batch is handed over as it is
  made. **A batch handed over is the host's**: supplying the option says the
  host applies what it is given, in the order it is given it, and before it
  answers anything else the session asks. This is Studio's shape.

A live-applying host owes an answer to each batch: `receiveAuthoritativeUpdate`
with the revision that committed it, then `acknowledge` through that batch id.
Until both arrive the batch stays in `snapshot.pendingCommands`, so nothing
looks saved that is not.

**Never echo the host's own commit back as an authoritative change from
elsewhere.** `receiveAuthoritativeUpdate` for a session's own committed batch
carries that batch's revision and nothing more; an update that also re-sends
the stage as a collaborator's edit makes the session retire the researcher's
unsaved work.

One batch is withheld on purpose: one that puts a resource this session has
staged into the draft. Its bytes are not in the protocol until `finish`
promotes them, so that batch and every batch after it stay pending and reach
the host in the finish apply, alongside the manifest commands from the same
promotion.

## Compound edits

An edit that changes the stage and the codebook together — creating the node
type a stage needs, adding the attribute a prompt asks about, encrypting a
variable — goes through `controller.requestCompoundEdit`, and the host answers
`onCompoundEdit`. The host must apply it as **one atomic change** against the
revision the request names, and answer with what it applied, blocked or
refused (`CompoundEditResult`). A request built on a base the host has moved
past is refused as stale, which is why a live-applying host must not let a
compound edit overtake a commit still in flight.

`@codaco/protocol-builder/compound-edit/InMemoryCompoundHost` is a working
implementation with a lease, revisions and a validator, for a host's own tests.

## Resources

Data files, images, media and API keys are protocol resources, reached through
a port the host provides:

```ts
import type { ProtocolBuilderResourceGateway } from '@codaco/protocol-builder/resources/gateway';
```

The gateway stages an upload or a secret, lists and inspects what the protocol
holds, previews it, and promotes what the finished stage still references.
Staging lives exactly as long as the edit session: `finish` promotes what the
draft still references and `cancel` discards the rest. The host applies the
promoted manifest and the stage document **in the same revision**, or the
protocol briefly holds a stage referencing a resource it does not have.

- `@codaco/protocol-builder/resources/InMemoryResourceGateway` is a complete
  in-memory implementation, with fault injection, for tests and stories.
- `@codaco/protocol-builder/resources/gatewayContract` exports
  `describeResourceGatewayContract`, a shared vitest suite a host runs against
  its own gateway.

## Locales

```ts
import { protocolBuilderCatalogs } from '@codaco/protocol-builder/locales';
```

The package declares its own researcher copy under `protocolBuilder.*` ids and
ships a catalog per non-source ecosystem locale (`en-GB`, `es`). A host merges
the ones it supports into its own catalog, common first:
`apps/studio/client/src/locales/catalogs.ts` is the worked example. English is
the runtime fallback — every descriptor renders its own `defaultMessage` with
no provider mounted, which is why the Spanish half of a test is the half that
proves anything.

After adding or changing a message, run `pnpm --filter @codaco/protocol-builder
i18n:extract`; `src/locales/__tests__/catalogs.test.ts` runs the same
extraction and fails when `src/locales/en.json` is stale, when an id escapes
the namespace, or when a locale's catalog is incomplete.

## Styles

```css
@import '@codaco/tailwind-config/fresco.css';
@import '@codaco/fresco-ui/styles.css';
@import '@codaco/protocol-builder/styles.css';
```

The third import is a Tailwind v4 `@source` declaration and nothing else: it
tells the host's scanner where this package's modules are, so the utilities the
editors reference — the container queries the section outline and the form
layout are built on — are generated. Without it a host gets the components
laid out in a single narrow column at every width.

## Testing a host

`@codaco/protocol-builder/testing/renderStageEditor` mounts a real editing
session over the shared all-interfaces fixture protocol and returns a harness:

```ts
const harness = renderStageEditor({ stageId: 'sociogram-1' });
const committed = await harness.submit();
```

It can mount a named editor, the dispatcher's registry, or a list of sections;
open a configured fixture stage, a stage document you build, or a stage being
created; open read-only, in a locale, with sections another editor holds, and
over a buffering or a live-applying host (`applyLive`). It exposes what the
host was asked to commit, what a live host was actually given, the pending
batches, the codebook as the host holds it, and codebook changes arriving from
elsewhere.
