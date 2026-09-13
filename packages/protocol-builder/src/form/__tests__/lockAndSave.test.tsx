import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { selectIsFormDirty } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { ProtocolBuilderClient } from '@codaco/protocol-builder-core/contract';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import {
  ResourceClientProvider,
  useResourceClient,
  useStagedResources,
} from '../../resources/client.tsx';
import BuilderSection from '../../sections/BuilderSection.tsx';
import { StageEditSession } from '../../stageEdit.tsx';
import {
  createInMemoryHost,
  type InMemoryClient,
  type InMemoryHost,
} from '../../testing/host/createInMemoryHost.ts';
import {
  fixtureProtocolSections,
  fixtureStageIds,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import StageEditorShell from '../StageEditorShell.tsx';

const STAGE_ID = 'information-1';
const STAGE_SECTION = sectionId({ kind: 'stage', stageId: STAGE_ID });
const STAGE_ORDER = sectionId({ kind: 'stageOrder' });

/**
 * Whether the stage form holds unsaved work, read from inside it.
 *
 * The same selector Studio's navigation blocker reads
 * (`Editor.tsx`: `useFormStore(selectIsFormDirty)`), so what this reports is
 * what decides whether a researcher is asked before leaving.
 */
function DirtyFlag() {
  const dirty = useFormStore(selectIsFormDirty);
  return <p data-testid="form-dirty">{dirty ? 'dirty' : 'clean'}</p>;
}

/** One section owning one value, so a save can be compared key by key. */
const nameSection = (
  <BuilderSection title="Stage name">
    <Field name="label" label="Stage name" component={InputField} />
  </BuilderSection>
);

describe('a stage somebody else is editing', () => {
  it('opens read-only, and says who has it', async () => {
    renderStageEditor({
      stageId: STAGE_ID,
      sections: nameSection,
      readOnly: true,
    });

    // Awaited, because nothing tells the editor the stage is somebody else's
    // until the host answers its acquire.
    expect(
      await screen.findByText(
        'Robin is editing this stage, so you can read it but not change it.',
      ),
    ).toBeInTheDocument();
  });
});

describe('a stage the protocol has not answered for yet', () => {
  it('is read but not typed into, and says nothing about a holder', async () => {
    const gate = gatedAcquire();
    renderStageEditor({
      stageId: STAGE_ID,
      sections: nameSection,
      client: gate.client,
    });

    const field = await screen.findByRole('textbox', { name: 'Stage name' });
    expect(field).toBeDisabled();
    // Not the read-only banner: nobody else has this stage, and a sentence
    // naming a holder there is not one would be a lie about a collaborator.
    expect(
      screen.queryByText(/editing this stage, so you can read it/),
    ).not.toBeInTheDocument();

    await act(async () => {
      gate.release();
    });

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Stage name' })).toBeEnabled();
    });
  });
});

describe('what a save writes', () => {
  it('hands back the whole section, changed only where the researcher changed it', async () => {
    const seeded = loadFixtureStage(STAGE_ID);
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: nameSection,
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'A renamed page');

    const written = await harness.submit();

    expect(written).not.toBeNull();
    // Every key of the stage, not only the one on screen: a submit that wrote
    // just the mounted field would leave the rest of the section behind.
    expect(written?.stageDocument).toEqual({
      ...seeded.fields,
      id: STAGE_ID,
      type: seeded.type,
      label: 'A renamed page',
    });
    // And nothing the form invented on the way through.
    expect(Object.keys(written?.stageDocument ?? {}).toSorted()).toEqual(
      ['id', 'type', ...Object.keys(seeded.fields)].toSorted(),
    );
  });
});

/**
 * A transport that loses the answer to the first write it carries and sends
 * the identical request again — a socket that drops between the host writing
 * and the client reading it, which is the one case a client cannot tell from
 * a write that never happened.
 *
 * Proxied rather than spread: a contract client's procedures are reached
 * through property access rather than held as own properties, so a spread copy
 * of one has no procedures on it at all.
 */
function withTheFirstAnswerLost(): Readonly<{
  client: (host: InMemoryHost) => ProtocolBuilderClient;
  resends: () => number;
}> {
  let resends = 0;
  return {
    client: ({ client }) => {
      const resent = new Map<PropertyKey, unknown>();
      const resend = <TArgs extends unknown[], TAnswer>(
        call: (...args: TArgs) => Promise<TAnswer>,
      ) => {
        let lost = false;
        return async (...args: TArgs): Promise<TAnswer> => {
          const answer = await call(...args);
          if (lost) return answer;
          lost = true;
          resends += 1;
          // The first answer never reaches the client, so the very same
          // request goes out again.
          return call(...args);
        };
      };
      resent.set(
        'submit',
        resend((...args: Parameters<InMemoryClient['submit']>) =>
          client.submit(...args),
        ),
      );
      resent.set(
        'create',
        resend((...args: Parameters<InMemoryClient['create']>) =>
          client.create(...args),
        ),
      );
      return new Proxy(client, {
        get: (target, property) =>
          resent.get(property) ?? Reflect.get(target, property),
      });
    },
    resends: () => resends,
  };
}

describe('a save whose answer is lost on the way back', () => {
  it('is written once, however many times the request reaches the host', async () => {
    const lost = withTheFirstAnswerLost();
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: nameSection,
      client: lost.client,
    });
    const before = harness.host.store.read(STAGE_SECTION).revision.sequence;

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'Saved through a dropped socket');

    expect(await harness.submit()).not.toBeNull();

    // The request really was made twice — otherwise this proves nothing about
    // a retry — and the protocol advanced by exactly one revision, because the
    // second attempt was answered with what the first wrote rather than
    // writing a revision of its own that changed nothing.
    expect(lost.resends()).toBe(1);
    expect(harness.host.store.read(STAGE_SECTION).revision.sequence).toBe(
      before + 1n,
    );
    expect(harness.protocolSections()[STAGE_SECTION]).toMatchObject({
      label: 'Saved through a dropped socket',
    });
  });

  it('is a different write from the save the researcher makes next', async () => {
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: nameSection,
    });
    const before = harness.host.store.read(STAGE_SECTION).revision.sequence;

    const field = () => screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field());
    await harness.user.type(field(), 'Saved once');
    expect(await harness.submit()).not.toBeNull();

    await harness.user.clear(field());
    await harness.user.type(field(), 'Saved again');
    expect(await harness.submit()).not.toBeNull();

    // Two revisions, and the protocol holds the second draft. A key shared
    // between the two saves would have the host answer the second with what
    // the first wrote: the editor would report a save that was never made,
    // and the researcher's second draft would be nowhere.
    expect(harness.host.store.read(STAGE_SECTION).revision.sequence).toBe(
      before + 2n,
    );
    expect(harness.protocolSections()[STAGE_SECTION]).toMatchObject({
      label: 'Saved again',
    });
  });

  it('adds a stage once, however many times the request reaches the host', async () => {
    const before = fixtureStageIds();
    const lost = withTheFirstAnswerLost();
    const harness = renderStageEditor({
      create: {
        type: 'Information',
        position: 1,
        fields: loadFixtureStage(STAGE_ID).fields,
      },
      sections: nameSection,
      client: lost.client,
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'Added through a dropped socket');

    const written = await harness.submit();
    expect(written).not.toBeNull();

    // One stage in the order, not two: a create that minted a second section
    // for the retry would leave the protocol holding the stage twice and tell
    // the editor about only one of them, which nothing could then repair.
    expect(lost.resends()).toBe(1);
    const order = orderOf(harness.protocolSections());
    expect(order.length).toBe(before.length + 1);
    expect(order).toContain(written?.sectionId.split(':').at(-1));
  });

  it('adds it once when the researcher, told the add failed, saves again', async () => {
    const before = fixtureStageIds();
    const lost = withTheFirstAnswerSwallowed();
    const harness = renderStageEditor({
      create: {
        type: 'Information',
        position: 1,
        fields: loadFixtureStage(STAGE_ID).fields,
      },
      sections: nameSection,
      client: lost.client,
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'Added through a dropped socket');

    // The host wrote; the researcher is told nothing was added and that they
    // should try again, and the draft is still on screen for them to do it.
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(/This stage could not be added/),
    ).toBeInTheDocument();

    expect(await harness.submit()).not.toBeNull();

    // The same key both times, so the second attempt was answered with the
    // section the first one minted. A key minted per attempt leaves the
    // protocol holding the stage twice, and the editor is told about only one
    // of them.
    expect(new Set(lost.keys()).size).toBe(1);
    expect(lost.keys()).toHaveLength(2);
    expect(orderOf(harness.protocolSections()).length).toBe(before.length + 1);
  });
});

describe('a save the protocol refuses because the lock has gone', () => {
  it('says so, discards the draft, and leaves the stage as it was', async () => {
    const seeded = loadFixtureStage(STAGE_ID);
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: nameSection,
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'Never saved');

    // Nothing tells the editor the lock has gone; it finds out here.
    harness.takeOverLock();
    const written = await harness.submit();

    expect(written).toBeNull();
    expect(
      await screen.findByText(
        /Somebody else is editing this stage now, so nothing was saved/,
      ),
    ).toBeInTheDocument();
    // The draft is gone: the control is back to what the protocol holds.
    const savedLabel = seeded.fields.label;
    expect(typeof savedLabel).toBe('string');
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
        String(savedLabel),
      );
    });
    expect(harness.protocolSections()[STAGE_SECTION]).toEqual({
      id: STAGE_ID,
      type: seeded.type,
      ...seeded.fields,
    });
  });

  /**
   * And the form it puts back is not this researcher's to write.
   *
   * Nothing re-acquires the section — it belongs to whoever holds it now — so
   * an editor left editable is one where every later save is refused the same
   * way, discarding another round of work each time while the page goes on
   * saying it may be written to.
   */
  it('leaves the stage read-only, named to whoever has it now', async () => {
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: nameSection,
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'Never saved');

    harness.takeOverLock();
    expect(await harness.submit()).toBeNull();

    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: 'Stage name' }),
      ).toBeDisabled();
    });
    expect(
      screen.getByText(
        'Robin is editing this stage, so you can read it but not change it.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * And it does not name this researcher when the refusal names nobody.
   *
   * A lease that runs out with no one taking the section publishes no lock
   * event — an acquire that TAKES one publishes its own, and an expiry has
   * nothing to announce — so what this editor's cache still holds is the
   * presence its OWN acquire put there. Left alone, the read-only form the
   * lost lock puts back tells the researcher that they are editing the stage
   * they were just refused, and offers no account of why they cannot write it.
   */
  it('does not name this researcher as the holder when nobody is', async () => {
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: nameSection,
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'Never saved');

    harness.host.store.expireLease(STAGE_SECTION);
    expect(await harness.submit()).toBeNull();

    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: 'Stage name' }),
      ).toBeDisabled();
    });
    expect(
      screen.getByText(
        'Somebody else is editing this stage, so you can read it but not change it.',
      ),
    ).toBeInTheDocument();
  });
});

describe('a save the protocol did not take', () => {
  /**
   * The draft on screen is still unsaved work, and the form has to say so.
   *
   * Dirtiness is what a host asks before letting a researcher leave: Studio
   * blocks navigation on it and asks whether to discard. A form rebased onto a
   * draft the protocol refused reports itself clean, so the researcher walks
   * away from work that was never written and is never asked about it.
   */
  it('leaves the form dirty, so the host still asks before discarding it', async () => {
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: (
        <>
          {nameSection}
          <DirtyFlag />
        </>
      ),
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    expect(screen.getByTestId('form-dirty')).toHaveTextContent('dirty');

    // The schema will not take a stage with no name, so the save never leaves
    // the editor — the commonest refusal there is, and the one a researcher
    // meets while still typing.
    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'Stage name: Stage name has no value, and this stage needs one.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('form-dirty')).toHaveTextContent('dirty');
  });

  it('rebases the form once the protocol takes the save', async () => {
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: (
        <>
          {nameSection}
          <DirtyFlag />
        </>
      ),
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'A renamed page');
    expect(screen.getByTestId('form-dirty')).toHaveTextContent('dirty');

    expect(await harness.submit()).not.toBeNull();

    // Saved work is not unsaved work: a form still reporting itself dirty
    // makes the host ask whether to discard changes the researcher has just
    // watched it save. Read the instant `submit()` resolves rather than
    // through a `waitFor` of its own: `submit()` settles only once the form
    // has (aria-busy clears after the rebase runs), so a later, separate
    // wait here would only be re-deriving that same guarantee — and would
    // pass even if the rebase never ran, as long as *something else*
    // eventually re-rendered the flag correctly.
    expect(screen.getByTestId('form-dirty')).toHaveTextContent('clean');
  });
});

describe('a stage the protocol will not open', () => {
  it('says so instead of waiting for a document that is not coming', async () => {
    const host = createInMemoryHost({ sections: fixtureProtocolSections() });

    render(
      <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
        <ResourceClientProvider>
          <StageEditSession
            target={{
              sectionId: sectionId({ kind: 'stage', stageId: 'deleted-stage' }),
            }}
          >
            <StageEditorShell>{nameSection}</StageEditorShell>
          </StageEditSession>
        </ResourceClientProvider>
      </ProtocolBuilder>,
    );

    // The refusal is also the whole of what stops it being an unhandled
    // rejection: the acquire is answered rather than dropped, so vitest's own
    // unhandled-error check is the second half of this assertion.
    expect(
      await screen.findByText(
        /This stage could not be opened\. It may have been deleted/,
      ),
    ).toBeInTheDocument();
  });
});

describe('a stage the protocol does not hold yet', () => {
  it('is registered where the host said it would go', async () => {
    const before = fixtureStageIds();
    const harness = renderStageEditor({
      create: {
        type: 'Information',
        position: 1,
        // A template is not a saveable stage: every interface needs something
        // only a researcher can supply, and the sections of a real editor are
        // what fill that in. One mounted section cannot, so the stage arrives
        // already holding what the schema asks for.
        fields: loadFixtureStage(STAGE_ID).fields,
      },
      sections: nameSection,
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'A new page');
    const written = await harness.submit();

    expect(written).not.toBeNull();
    const order = orderOf(harness.protocolSections());
    const created = written?.stageDocument.id;
    expect(typeof created).toBe('string');
    expect(order[1]).toBe(created);
    expect(order.length).toBe(before.length + 1);
  });
});

/**
 * Imports a file and lists what the edit is holding, so a test can watch the
 * staging land without driving a picker.
 */
function StagedFileProbe() {
  const resources = useResourceClient();
  const { staged } = useStagedResources();
  return (
    <BuilderSection title="Import">
      <button
        type="button"
        onClick={() => {
          void resources.stageUpload({
            requestId: 'probe-request',
            kind: 'network',
            name: 'A roster',
            source: 'roster.csv',
            contentType: 'text/csv',
            bytes: new TextEncoder().encode('{}'),
          });
        }}
      >
        Import a file
      </button>
      <ul>
        {staged.map((descriptor) => (
          <li key={descriptor.id}>{descriptor.name}</li>
        ))}
      </ul>
    </BuilderSection>
  );
}

const stagedProbe = (
  <>
    {nameSection}
    <StagedFileProbe />
  </>
);

describe('a file imported while the stage is open', () => {
  it('is committed in the same revision as the stage that names it', async () => {
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: stagedProbe,
    });
    const before = harness.host.store.read(STAGE_SECTION).revision.sequence;

    await harness.user.click(
      screen.getByRole('button', { name: 'Import a file' }),
    );
    expect(await screen.findByText('A roster')).toBeInTheDocument();

    expect(await harness.submit()).not.toBeNull();

    const manifest = harness.protocolSections()[
      sectionId({ kind: 'assets' })
    ] as Record<string, { name?: unknown }>;
    expect(
      Object.values(manifest).some((entry) => entry.name === 'A roster'),
    ).toBe(true);
    // One revision, not two: the promotion rides the submit, so the manifest
    // entry and the stage naming it are the same write. A separate promotion
    // would leave the manifest at a revision of its own, and a protocol in
    // between the two where the bytes are committed and nothing names them.
    const stageAfter = harness.host.store.read(STAGE_SECTION).revision.sequence;
    const manifestAfter = harness.host.store.read(sectionId({ kind: 'assets' }))
      .revision.sequence;
    expect(stageAfter).toBe(before + 1n);
    expect(manifestAfter).toBe(stageAfter);
  });

  it('leaves the stage and the manifest as they were when it cannot be committed', async () => {
    const seeded = loadFixtureStage(STAGE_ID);
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: stagedProbe,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Import a file' }),
    );
    expect(await screen.findByText('A roster')).toBeInTheDocument();

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'Renamed beside a lost import');

    // The staged file leaves the host behind this editor's back — swept up
    // after a restart, discarded from another window — and nothing tells the
    // edit, which submits still naming it.
    await discardStagedFilesAtTheHost(harness);

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        /The files you imported could not be saved with this stage/,
      ),
    ).toBeInTheDocument();
    // Neither half was written: not the section, and not the manifest.
    expect(harness.protocolSections()[STAGE_SECTION]).toEqual({
      id: STAGE_ID,
      type: seeded.type,
      ...seeded.fields,
    });
    const manifest = harness.protocolSections()[
      sectionId({ kind: 'assets' })
    ] as Record<string, { name?: unknown }>;
    expect(
      Object.values(manifest).some((entry) => entry.name === 'A roster'),
    ).toBe(false);
    // And the draft is still the researcher's to save again: nothing was
    // taken, so there is nothing to start again from.
    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Renamed beside a lost import',
    );
  });

  it('leaves the draft on screen when somebody else is holding the file list', async () => {
    const seeded = loadFixtureStage(STAGE_ID);
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: stagedProbe,
      // The manifest the promotion writes, not the stage: this editor holds
      // the stage, and a save that promotes has to write both.
      heldSections: [
        { sectionId: sectionId({ kind: 'assets' }), displayName: 'Robin' },
      ],
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Import a file' }),
    );
    expect(await screen.findByText('A roster')).toBeInTheDocument();

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'Renamed behind a held manifest');

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        /Robin is editing another part of the protocol that this save needs/,
      ),
    ).toBeInTheDocument();
    // Nothing was written, so there is nothing to start again from: the draft
    // is the researcher's to save once Robin has finished.
    expect(harness.protocolSections()[STAGE_SECTION]).toEqual({
      id: STAGE_ID,
      type: seeded.type,
      ...seeded.fields,
    });
    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Renamed behind a held manifest',
    );
  });

  it('is dropped when the researcher closes the stage without saving', async () => {
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: stagedProbe,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Import a file' }),
    );
    expect(await screen.findByText('A roster')).toBeInTheDocument();

    await harness.cancel();

    const manifest = harness.protocolSections()[
      sectionId({ kind: 'assets' })
    ] as Record<string, { name?: unknown }>;
    expect(
      Object.values(manifest).some((entry) => entry.name === 'A roster'),
    ).toBe(false);
  });
});

describe('a file imported while a stage is being added', () => {
  it('is committed with the stage, its place in the order, and nothing in between', async () => {
    const harness = renderStageEditor({
      create: {
        type: 'Information',
        position: 1,
        fields: loadFixtureStage(STAGE_ID).fields,
      },
      sections: stagedProbe,
    });
    const orderBefore = harness.host.store.read(STAGE_ORDER).revision.sequence;

    await harness.user.click(
      screen.getByRole('button', { name: 'Import a file' }),
    );
    expect(await screen.findByText('A roster')).toBeInTheDocument();

    const written = await harness.submit();
    if (written === null) {
      throw new Error(
        `The stage was not added, so nothing was committed. The editor is showing: ${document.body.textContent ?? ''}`,
      );
    }

    const manifest = harness.protocolSections()[
      sectionId({ kind: 'assets' })
    ] as Record<string, { name?: unknown }>;
    expect(
      Object.values(manifest).some((entry) => entry.name === 'A roster'),
    ).toBe(true);

    // One revision for all three: the stage, the order that now holds it, and
    // the manifest entry it names. Two would leave a protocol in between where
    // a stage names a file nothing committed, or the bytes are committed and
    // no stage names them.
    const orderAfter = harness.host.store.read(STAGE_ORDER).revision.sequence;
    expect(orderAfter).toBe(orderBefore + 1n);
    expect(harness.host.store.read(written.sectionId).revision.sequence).toBe(
      orderAfter,
    );
    expect(
      harness.host.store.read(sectionId({ kind: 'assets' })).revision.sequence,
    ).toBe(orderAfter);
  });

  it('leaves the protocol without the stage when it cannot be committed', async () => {
    const before = fixtureStageIds();
    const harness = renderStageEditor({
      create: {
        type: 'Information',
        position: 1,
        fields: loadFixtureStage(STAGE_ID).fields,
      },
      sections: stagedProbe,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Import a file' }),
    );
    expect(await screen.findByText('A roster')).toBeInTheDocument();

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'Never added');

    // The staged file leaves the host behind this editor's back, and nothing
    // tells the edit: it creates the stage still naming it.
    await discardStagedFilesAtTheHost(harness);

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText(
        /The files you imported could not be saved with this stage/,
      ),
    ).toBeInTheDocument();
    // Neither half was written: no stage in the order, and no manifest entry.
    expect(orderOf(harness.protocolSections())).toEqual(before);
    const manifest = harness.protocolSections()[
      sectionId({ kind: 'assets' })
    ] as Record<string, { name?: unknown }>;
    expect(
      Object.values(manifest).some((entry) => entry.name === 'A roster'),
    ).toBe(false);
    // And the draft is still the researcher's to add again.
    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Never added',
    );
  });
});

/**
 * Holds every answer to `acquireLock` until the test lets it through, which is
 * every host for as long as it takes to answer.
 *
 * Proxied rather than spread: a contract client's procedures are reached
 * through property access rather than held as own properties, so a spread copy
 * of one has no procedures on it at all.
 */
function gatedAcquire(): Readonly<{
  client: (host: InMemoryHost) => ProtocolBuilderClient;
  release: () => void;
}> {
  const gates: (() => void)[] = [];
  return {
    client: ({ client }) =>
      new Proxy(client, {
        get: (target, property) =>
          property === 'acquireLock'
            ? async (...args: Parameters<InMemoryClient['acquireLock']>) => {
                const answer = await client.acquireLock(...args);
                await new Promise<void>((open) => gates.push(open));
                return answer;
              }
            : Reflect.get(target, property),
      }),
    release: () => {
      for (const open of gates.splice(0)) open();
    },
  };
}

/**
 * Everything this edit is holding staged, dropped at the host.
 *
 * Through the contract rather than through the editor's own client: the point
 * is that the edit does NOT know, and goes on to submit a promotion for bytes
 * the host no longer has. The edit is named because that is the only way to
 * reach its staging at all — one edit's files are not another's to drop — so
 * this stands in for the host losing them rather than for a collaborator
 * taking them.
 */
async function discardStagedFilesAtTheHost(
  harness: Readonly<{ host: InMemoryHost; editId: string }>,
): Promise<void> {
  const discarded = await harness.host.client.resources.discard({
    protocolId: harness.host.protocolId,
    editId: harness.editId,
  });
  expect(discarded.status).toBe('ok');
}

function orderOf(sections: Readonly<Record<string, unknown>>): string[] {
  const order = sections[sectionId({ kind: 'stageOrder' })];
  const stages =
    typeof order === 'object' && order !== null
      ? Reflect.get(order, 'stages')
      : undefined;
  return Array.isArray(stages)
    ? stages.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/**
 * A host that WRITES and whose answer never arrives — the socket dropped
 * between the write and the reply, and the transport rejected the call in
 * flight rather than resending it.
 *
 * What the researcher then does is the retry: they are told the add failed and
 * they press Save again, over a socket that has come back. Only the request id
 * tells the host that this is the same intent as the write it already made.
 */
function withTheFirstAnswerSwallowed(): Readonly<{
  client: (host: InMemoryHost) => ProtocolBuilderClient;
  keys: () => readonly string[];
}> {
  const keys: string[] = [];
  let swallowed = false;
  return {
    keys: () => keys,
    client: (host) => {
      const create = async (
        ...args: Parameters<InMemoryClient['create']>
      ): Promise<Awaited<ReturnType<InMemoryClient['create']>>> => {
        const [input] = args;
        keys.push(input.requestId);
        const answer = await host.client.create(...args);
        if (swallowed) return answer;
        swallowed = true;
        throw new Error('the socket dropped before the answer arrived');
      };
      return new Proxy(host.client, {
        get: (target, property) =>
          property === 'create' ? create : Reflect.get(target, property),
      });
    },
  };
}
