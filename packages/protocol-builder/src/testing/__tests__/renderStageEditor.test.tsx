import { act, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import RichTextField from '../../fields/RichTextField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useResourceClient } from '../../resources/client.tsx';
import type { ResourceDescriptor } from '../../resources/types.ts';
import BuilderSection from '../../sections/BuilderSection.tsx';
import InterviewerGuidanceSection from '../../sections/interviewer-guidance/InterviewerGuidanceSection.tsx';
import SkipLogicSection from '../../sections/skip-logic/SkipLogicSection.tsx';
import StageNameSection from '../../sections/stage-heading/StageNameSection.tsx';
import SubjectSection from '../../sections/subject-picker/SubjectSection.tsx';
import type {
  StageEditorComponent,
  StageEditorProps,
} from '../../stage-editor-contract.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import { fixtureStageIds, loadFixtureStage } from '../protocolFixture.ts';
import {
  renderStageEditor,
  type RenderStageEditorOptions,
  type StageEditorHarness,
} from '../renderStageEditor.tsx';

const commonSections = (
  <>
    <StageNameSection />
    <SkipLogicSection />
    <InterviewerGuidanceSection />
  </>
);

/** The text of a `data:` URL, which is how the contract delivers a file. */
const previewText = (url: string): string => {
  const comma = url.indexOf(',');
  if (comma === -1) throw new Error(`"${url}" is not a data URL`);
  const payload = url.slice(comma + 1);
  return url.slice(0, comma).endsWith(';base64')
    ? new TextDecoder().decode(
        Uint8Array.from(
          atob(payload),
          (character) => character.codePointAt(0) ?? 0,
        ),
      )
    : decodeURIComponent(payload);
};

/**
 * A section that reads what is INSIDE a data file, the way a roster stage's
 * card, sort and search sections do: the columns they offer a researcher are
 * the roster's own attribute names, and nothing but the file can supply them.
 * Seeded with a placeholder body instead, every one of those sections would
 * test its "this file cannot be read" state rather than itself.
 *
 * The contract has no download, so the file arrives as the URL a preview
 * resolves to — which is what `AssetPickerField` reads one through.
 */
function RosterColumnsSection({
  resourceId,
}: Readonly<{ resourceId: string }>) {
  const resources = useResourceClient();
  const [columns, setColumns] = useState<readonly string[]>([]);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    let current = true;
    const readColumns = async () => {
      const result = await resources.resolvePreview(resourceId);
      if (!current) return;
      if (result.status !== 'ok') {
        setUnreadable(true);
        return;
      }
      const roster = JSON.parse(previewText(result.data.url)) as unknown;
      const nodes =
        typeof roster === 'object' && roster !== null && 'nodes' in roster
          ? roster.nodes
          : undefined;
      const names = new Set<string>();
      for (const node of Array.isArray(nodes) ? nodes : []) {
        const attributes =
          typeof node === 'object' && node !== null && 'attributes' in node
            ? node.attributes
            : undefined;
        if (typeof attributes === 'object' && attributes !== null) {
          for (const name of Object.keys(attributes)) names.add(name);
        }
      }
      if (names.size === 0) setUnreadable(true);
      else setColumns([...names].toSorted());
    };
    void readColumns();
    return () => {
      current = false;
    };
  }, [resources, resourceId]);

  return (
    <BuilderSection title="Card details">
      <p>
        {unreadable || columns.length === 0
          ? 'That roster could not be read.'
          : `Columns: ${columns.join(', ')}`}
      </p>
    </BuilderSection>
  );
}

/** A section that lists what the protocol's resources are, as a picker does. */
function ResourceListSection() {
  const resources = useResourceClient();
  const [listed, setListed] = useState<readonly ResourceDescriptor[]>([]);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    let current = true;
    const read = async () => {
      const result = await resources.list();
      if (!current) return;
      if (result.status === 'ok') setListed(result.data);
      else setRefused(true);
    };
    void read();
    return () => {
      current = false;
    };
  }, [resources]);

  return (
    <BuilderSection title="Files">
      {refused && <p>The host refused to list its files.</p>}
      <ul>
        {listed.map((resource) => (
          <li key={resource.id}>
            {`${resource.id}: ${resource.name}, ${resource.kind}, ${resource.status}`}
          </li>
        ))}
      </ul>
    </BuilderSection>
  );
}

describe('the stage-editor test harness', () => {
  it('opens a stage of the shared protocol over a real host', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: commonSections,
    });

    expect(harness.seeded.type).toBe('Information');
    // The fixture's own name, written out rather than read back off the seed:
    // a control showing whatever the seed happens to hold would pass over a
    // form that was never given the document at all.
    expect(harness.seeded.fields.label).toBe('Information');
    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
      'Information',
    );
    expect(screen.getByRole('button', { name: 'Save stage' })).toBeEnabled();
  });

  it('refuses a stage the shared protocol does not contain', () => {
    expect(() => loadFixtureStage('not-a-stage')).toThrow(
      /has no stage "not-a-stage"/,
    );
    expect(fixtureStageIds()).toContain('information-1');
  });

  it('lists the mounted sections, in order, with their states', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: commonSections,
    });

    await expect
      .poll(() => harness.outline().map((section) => section.title))
      .toEqual(['Stage name', 'Skip logic', 'Interviewer guidance']);
    expect(harness.outline().map((section) => section.state)).toEqual([
      'Finished',
      'Switched off',
      'Switched off',
    ]);
  });

  /**
   * The whole point of seeding from the shared protocol: an editor that has no
   * section for one of its interface's keys must not be able to lose it.
   */
  it('round-trips a stage nothing has edited', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: commonSections,
    });

    const request = await harness.roundTrip({
      unowned: ['subject', 'form', 'prompts'],
    });

    expect(Object.keys(request.stageDocument).toSorted()).toEqual(
      ['id', 'type', 'label', 'subject', 'form', 'prompts'].toSorted(),
    );
  });

  it('reports a save the editor refused rather than waiting for one', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'Information',
        fields: { label: '', title: '', items: [] },
      },
      sections: commonSections,
    });

    expect(await harness.submit()).toBeNull();
  });

  /**
   * A key nothing renders survives the round trip untouched, by design, so no
   * comparison can ever see it missing. The editor is simply short a section,
   * and the researcher cannot see or change something their protocol holds.
   */
  it('names the keys no mounted section edits', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <SubjectSection entity="node" />,
    });

    expect(harness.ownedKeys()).toEqual(['subject']);
    await expect(harness.roundTrip()).rejects.toThrow(
      /keys: label, form, prompts/,
    );

    // Declared, the same mount round-trips: the list is a statement an editor
    // makes about itself, not an escape from the check.
    await harness.roundTrip({ unowned: ['label', 'form', 'prompts'] });
  });

  /**
   * A refusal reported as the last request that DID save is a refusal no test
   * can see: `submit()` answers truthfully, and `roundTrip()` compares against
   * a save that never happened.
   */
  it('does not read a refused save as the one before it', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: commonSections,
    });
    const unowned = ['title', 'items'];

    await harness.roundTrip({ unowned });
    // Nothing tells the editor the lock has gone; the next save is refused by
    // the host, and the round trip must not read the earlier save as this one.
    harness.takeOverLock();

    expect(await harness.submit()).toBeNull();
    await expect(harness.roundTrip({ unowned })).rejects.toThrow(
      /did not save/,
    );
  });
});

/**
 * A single-paragraph markdown field, which is what a prompt, a question and a
 * hint are. The stage key is one every stage may carry, so this mounts over
 * the fixture's own stage rather than inventing a schema the save would
 * refuse.
 */
function SingleLineQuestion() {
  return (
    <BuilderSection title="Question">
      <Field<typeof RichTextField>
        name="interviewScript"
        component={RichTextField}
        label="Question text"
        singleLine
      />
    </BuilderSection>
  );
}

const informationAsking = (question: string) => {
  const information = loadFixtureStage('information-1');
  return {
    id: information.id,
    type: information.type,
    fields: { ...information.fields, interviewScript: question },
  };
};

/**
 * The harness types with no wait between keystrokes, which is a saving of real
 * seconds across the suite and must not cost a keystroke. Rich text is where
 * it could: the field is a `contenteditable`, and user-event has no layout to
 * place a caret from.
 */
describe('the harness keyboard', () => {
  it('replaces a single-line rich text answer without losing its first character', async () => {
    const harness = renderStageEditor({
      stage: informationAsking('Who is closest to you?'),
      sections: <SingleLineQuestion />,
    });

    const question = await screen.findByRole('textbox', {
      name: 'Question text',
    });
    await harness.user.clear(question);
    await harness.user.type(question, 'Who else?');

    // The saved markdown, not the text on screen: a lost first character
    // reaches the protocol, and this is the value a researcher's stage keeps.
    const request = await harness.submit();
    expect(request?.stageDocument.interviewScript).toBe('Who else?');
  });

  it('replaces a single-line rich text answer a test selected first', async () => {
    const harness = renderStageEditor({
      stage: informationAsking('Who is closest to you?'),
      sections: <SingleLineQuestion />,
    });

    const question = await screen.findByRole('textbox', {
      name: 'Question text',
    });
    // How a researcher replaces an answer, and how the editors' round-trip
    // tests write one: into the field, select what is there, type over it.
    await harness.user.click(question);
    await harness.user.keyboard('{Control>}a{/Control}');
    await harness.user.type(question, 'Who else?');

    // The whole answer, not the old one with this one after it: a click of the
    // harness's own would collapse the selection to the end of the text.
    const request = await harness.submit();
    expect(request?.stageDocument.interviewScript).toBe('Who else?');
  });

  it('types into an untouched rich text field at the start of its answer', async () => {
    const harness = renderStageEditor({
      stage: informationAsking('Who is closest to you?'),
      sections: <SingleLineQuestion />,
    });

    const question = await screen.findByRole('textbox', {
      name: 'Question text',
    });
    await harness.user.type(question, 'Also: ');

    // Not at the end, which is where a browser opens a field it is clicked
    // into and what a test written for one expects. jsdom lays nothing out, so
    // user-event puts the caret at the start of the text instead, and a test
    // that wants to add to an answer has to select it and type it out whole.
    const request = await harness.submit();
    expect(request?.stageDocument.interviewScript).toBe(
      'Also: Who is closest to you?',
    );
  });

  /**
   * And the same is true of a caret a test placed ITSELF, which is worth
   * pinning because it looks as though it should work: `hasSelectedRangeInside`
   * lets a selection through, so a test could reasonably expect a caret to be
   * one. It is not. The harness's own click moves it to the start of the text,
   * and skipping the click leaves ProseMirror never hearing of it — so a test
   * that needs a position selects a range and types the answer out whole.
   */
  it('types at the start whatever caret a test placed', async () => {
    const harness = renderStageEditor({
      stage: informationAsking('Who is closest to you?'),
      sections: <SingleLineQuestion />,
    });
    const question = await screen.findByRole('textbox', {
      name: 'Question text',
    });

    // Where a click in a browser would leave it: after the first word.
    const text = question.ownerDocument.evaluate(
      './/text()',
      question,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    if (text === null) throw new Error('no text in the editor');
    const selection = question.ownerDocument.defaultView?.getSelection();
    if (selection == null) throw new Error('no selection');
    const range = question.ownerDocument.createRange();
    range.setStart(text, 4);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    await harness.user.type(question, 'exactly ');

    const request = await harness.submit();
    expect(request?.stageDocument.interviewScript).toBe(
      'exactly Who is closest to you?',
    );
  });

  /**
   * The other two ways a test writes into one of these fields, which are NOT
   * wrapped. Each is a top-level call, so ProseMirror gets the turn between
   * them that `type`'s own inner click never gives it, and both write at the
   * selection they were left with rather than placing one.
   */
  it('pastes into a rich text field a test has just emptied', async () => {
    const harness = renderStageEditor({
      stage: informationAsking('Who is closest to you?'),
      sections: <SingleLineQuestion />,
    });
    const question = await screen.findByRole('textbox', {
      name: 'Question text',
    });

    await harness.user.clear(question);
    await harness.user.paste('Who else?');

    const request = await harness.submit();
    expect(request?.stageDocument.interviewScript).toBe('Who else?');
  });

  it('pastes over an answer a test selected', async () => {
    const harness = renderStageEditor({
      stage: informationAsking('Who is closest to you?'),
      sections: <SingleLineQuestion />,
    });
    const question = await screen.findByRole('textbox', {
      name: 'Question text',
    });

    await harness.user.click(question);
    await harness.user.keyboard('{Control>}a{/Control}');
    await harness.user.paste('Who else?');

    const request = await harness.submit();
    expect(request?.stageDocument.interviewScript).toBe('Who else?');
  });
});

/**
 * A stub editor whose only behaviour is one write to the stage draft.
 *
 * Written through `applyOwnCommands` — the same door a list editor commits a
 * row through — rather than by mounting a control that misbehaves, because
 * what is under test is the harness's comparison and not any section: a stub
 * that could only fail by rendering something would prove the check catches
 * that one control, and nothing about the check.
 */
function WritesToTheDraft({
  stageKey,
  value,
}: Readonly<{ stageKey: string; value: unknown }>) {
  const { applyOwnCommands } = useStageEditorForm();

  useEffect(() => {
    applyOwnCommands([{ op: 'set', key: stageKey, value }]);
  }, [applyOwnCommands, stageKey, value]);

  return null;
}

/** The fixture's geospatial stage, with one more setting on its map. */
const geospatialShowingTransit = () => {
  const geospatial = loadFixtureStage('geospatial-1');
  const mapOptions =
    typeof geospatial.fields.mapOptions === 'object' &&
    geospatial.fields.mapOptions !== null
      ? (geospatial.fields.mapOptions as Record<string, unknown>)
      : {};
  return {
    seeded: {
      id: geospatial.id,
      type: geospatial.type,
      fields: {
        ...geospatial.fields,
        mapOptions: { ...mapOptions, showTransit: true },
      },
    },
    /** The same map options with that setting gone, and nothing else moved. */
    withoutTransit: mapOptions,
  };
};

/**
 * A round trip is a claim about the WHOLE stage, in both directions.
 *
 * A key nothing authored is content in the researcher's protocol they did not
 * write — a control's default stamped on a save that was meant to change
 * nothing — and it is invisible to a comparison that only walks the seeded
 * stage. A key nested inside one an editor does render is invisible to a
 * comparison that stops at the top, and `unowned` is not a place it could be
 * declared either: `unowned` is about which sections exist, not about what a
 * save does inside a section that does.
 */
describe('what a round trip refuses', () => {
  it('refuses a stage that came back with a key nobody authored', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: (
        <>
          <StageNameSection />
          <WritesToTheDraft
            stageKey="interviewScript"
            value="Read this aloud."
          />
        </>
      ),
    });

    await expect(
      harness.roundTrip({ unowned: ['title', 'items'] }),
    ).rejects.toThrow(/Added: interviewScript\./);
  });

  it('refuses a stage that came back missing a key nested inside one', async () => {
    const { seeded, withoutTransit } = geospatialShowingTransit();
    const harness = renderStageEditor({
      stage: seeded,
      sections: (
        <>
          <StageNameSection />
          <WritesToTheDraft stageKey="mapOptions" value={withoutTransit} />
        </>
      ),
    });

    // Named by its own path, not as "mapOptions changed": which of the map's
    // eight settings went is the whole of what a reader needs.
    await expect(
      harness.roundTrip({ unowned: ['subject', 'mapOptions', 'prompts'] }),
    ).rejects.toThrow(/Dropped: mapOptions\.showTransit\./);
  });

  /**
   * The same stage, saved by an editor that leaves it alone, still round-trips
   * — so the two refusals above are about what the stub did, not about the
   * stage being unable to survive a save at all.
   */
  it('accepts the same stage from an editor that changes nothing', async () => {
    const { seeded } = geospatialShowingTransit();
    const harness = renderStageEditor({
      stage: seeded,
      sections: <StageNameSection />,
    });

    const request = await harness.roundTrip({
      unowned: ['subject', 'mapOptions', 'prompts'],
    });

    expect(request.stageDocument.mapOptions).toMatchObject({
      showTransit: true,
    });
  });
});

/**
 * The protocol's asset manifest and the host's resource store are two halves of
 * one fact: a stage may reference a resource only if the manifest lists it AND
 * the host holds its bytes. The harness seeds both from the same manifest, so a
 * stage seeded with a reference is one a host would accept — and a section that
 * reads a data file gets the file, not a placeholder.
 */
describe('the resources a harnessed stage can reach', () => {
  it('hands a section the columns of the roster the fixture ships', async () => {
    renderStageEditor({
      stageId: 'name-generator-roster-1',
      sections: (
        <>
          <RosterColumnsSection resourceId="roster_data" />
          <ResourceListSection />
        </>
      ),
    });

    // The roster's own attributes, read out of the file beside the protocol.
    // A placeholder body would leave the section saying it could not be read.
    expect(await screen.findByText('Columns: age, name')).toBeInTheDocument();
    // And the host holds it as something the protocol already has, rather than
    // as something this edit staged.
    expect(
      await screen.findByText('roster_data: Roster, network, committed'),
    ).toBeInTheDocument();
  });

  it('joins an extra asset to the manifest and the host’s files together', async () => {
    renderStageEditor({
      stageId: 'name-generator-roster-1',
      assets: {
        second_roster: {
          name: 'Another roster',
          type: 'network',
          source: 'roster.json',
        },
      },
      sections: (
        <>
          <RosterColumnsSection resourceId="second_roster" />
          <ResourceListSection />
        </>
      ),
    });

    expect(await screen.findByText('Columns: age, name')).toBeInTheDocument();
    expect(
      await screen.findByText(/^second_roster: Another roster, network,/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/^roster_data: Roster,/),
    ).toBeInTheDocument();
  });
});

/** The interview the fixture describes, in order, as the researcher sees it. */
const fixtureStageLabels = (): string[] =>
  fixtureStageIds().map((id) => {
    const label = loadFixtureStage(id).fields.label;
    return typeof label === 'string' ? label : '';
  });

/** Where `information-1` sits in that interview. */
const INFORMATION_INDEX = fixtureStageIds().indexOf('information-1');

const stageNameInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

const switchSkipLogicOn = async (
  harness: ReturnType<typeof renderStageEditor>,
): Promise<void> => {
  await harness.user.click(screen.getByRole('switch', { name: 'Skip logic' }));
};

const destinationOptions = (): string[] => {
  const select = screen.getByRole('combobox', {
    name: 'When this stage is skipped',
  });
  return [...select.querySelectorAll('option')].map(
    (option) => option.textContent ?? '',
  );
};

/** The stages the interview may continue at, as the researcher will see them. */
const stagesFrom = (index: number, displaced: number): string[] =>
  fixtureStageLabels()
    .slice(index)
    .map(
      (label, offset) => `Stage ${index + offset + 1 + displaced} — ${label}`,
    );

/** Long enough for a proposal that is still armed to have written the field. */
const settle = () =>
  act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      }),
  );

/**
 * A stage being created differs from every other stage in two ways an editor
 * cannot work out for itself: its name may be proposed, and it has no place in
 * the stage order to read its position from. Both come from the open edit, which
 * the host opened saying so — the sections below are mounted with no props at
 * all, which is how a family editor mounts them.
 */
describe('a stage being created', () => {
  it('proposes a name, and stops as soon as the researcher types one', async () => {
    const harness = renderStageEditor({
      create: { type: 'Information', position: INFORMATION_INDEX },
      sections: <StageNameSection />,
    });

    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    expect(stageNameInput().value).toMatch(/^Information/);
    // Unique in the interview: the fixture already contains a stage called
    // "Information", so a proposal equal to it would be a second one.
    expect(stageNameInput()).not.toHaveValue('Information');

    await harness.user.clear(stageNameInput());
    await harness.user.type(stageNameInput(), 'Consent and welcome');
    await settle();
    expect(stageNameInput()).toHaveValue('Consent and welcome');
  });

  /**
   * And it saves. A stage the protocol does not hold yet is not in the stage
   * order either, so validating it means putting it where it is going first —
   * without that, assembling the candidate fails on a stage the order does not
   * name and nothing about a new stage can ever be saved.
   */
  it('validates and saves where the host is about to put it', async () => {
    const harness = renderStageEditor({
      create: {
        type: 'Information',
        position: INFORMATION_INDEX,
        fields: {
          label: 'A new page',
          title: 'A new page',
          items: [],
          // A destination its insertion position allows, so the schema's rule
          // about skipping forwards is judged against the interview it joins.
          skipLogic: {
            action: 'SKIP',
            filter: {
              rules: [
                {
                  id: 'rule-a',
                  type: 'ego',
                  options: { attribute: 'ego_name', operator: 'EXISTS' },
                },
              ],
            },
            destination: { type: 'stage', stageId: 'geospatial-1' },
          },
        },
      },
      sections: commonSections,
    });

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'Information',
      label: 'A new page',
    });
    // Under an id the edit minted, in the section the host answered with: the
    // stage is in the protocol now, which is what saving a new one means.
    expect(request?.sectionId).toBe(
      sectionId({ kind: 'stage', stageId: String(request?.stageDocument.id) }),
    );
    expect(harness.protocolSections()[String(request?.sectionId)]).toEqual(
      request?.stageDocument,
    );
  });

  it('offers the destinations its insertion position allows', async () => {
    const harness = renderStageEditor({
      create: { type: 'Information', position: INFORMATION_INDEX },
      sections: <SkipLogicSection />,
    });

    await switchSkipLogicOn(harness);

    // Everything from the insertion point onwards, including the stage this
    // one displaces — numbered as the interview will be once it exists.
    expect(destinationOptions()).toEqual([
      'Next available stage',
      ...stagesFrom(INFORMATION_INDEX, 1),
      'End the interview',
    ]);
  });
});

/**
 * The same two sections, mounted the same way, over a stage the interview
 * already contains. Neither behaviour applies: the name is the researcher's,
 * empty or not, and the position is read from the stage order.
 */
describe('a stage the interview already contains', () => {
  it('leaves an empty name empty', async () => {
    renderStageEditor({
      stage: {
        id: 'information-1',
        type: 'Information',
        fields: { label: '', title: 'A page', items: [] },
      },
      sections: <StageNameSection />,
    });

    await settle();
    expect(stageNameInput()).toHaveValue('');
  });

  it('offers only the stages that come after it', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: <SkipLogicSection />,
    });

    await switchSkipLogicOn(harness);

    expect(destinationOptions()).toEqual([
      'Next available stage',
      ...stagesFrom(INFORMATION_INDEX + 1, 0),
      'End the interview',
    ]);
  });
});

/**
 * A family's editor is written for the one interface it edits, so its props are
 * narrower than the dispatcher's. Component props are contravariant, which made
 * a narrow editor unassignable to a slot typed for every stage type — so
 * families mounted theirs through `registry` instead, testing the dispatcher on
 * the way past. The slot is now typed for the stage the call opens.
 */
describe('the harness editor slot', () => {
  const InformationEditor: StageEditorComponent<'Information'> = ({
    stageType,
  }: StageEditorProps<'Information'>) => <p>{stageType} editor</p>;

  const EgoFormEditor: StageEditorComponent<'EgoForm'> = () => null;

  it('mounts a narrowly typed named editor over a stage of its interface', () => {
    const options: RenderStageEditorOptions<'Information'> = {
      stageId: 'information-1',
      editor: InformationEditor,
    };

    expect(
      renderStageEditor(options).getByText('Information editor'),
    ).toBeInTheDocument();
  });

  /**
   * And refuses one written for another interface, at compile time: the
   * `@ts-expect-error` below fails `tsc` the day this assignment starts being
   * allowed, which is the day the slot has widened back and stopped saying
   * anything.
   */
  it('does not accept an editor written for a different interface', () => {
    const mismatched: RenderStageEditorOptions<'Information'> = {
      stage: { type: 'Information', fields: { label: '' } },
      // @ts-expect-error an EgoForm editor cannot edit an Information stage
      editor: EgoFormEditor,
    };

    expect(mismatched.editor).toBe(EgoFormEditor);
  });
});

/**
 * The harness seeds a codebook change the way a collaborator makes one: it
 * reaches the protocol itself, so the revision travels the same channel every
 * other change does and every subscribed component re-renders with it.
 *
 * It used to reach the editor alone, under a revision the harness made up, so
 * the protocol's own copy of the entity was still what it held before — and a
 * test could seed an attribute, watch a section offer it, and be looking at
 * something no host would ever have sent.
 */
describe('a codebook change the harness seeds', () => {
  const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });
  const NICKNAME = Object.freeze({
    name: 'nickname',
    type: 'text',
    component: 'Text',
  });

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  /**
   * The fixture's `person` type with one more attribute on it.
   *
   * Refuses an id the fixture already carries: seeding an attribute that was
   * there anyway would let every assertion below pass without the seeding
   * having done anything.
   */
  const personWithNickname = (harness: StageEditorHarness): SectionDoc => {
    const person = harness.protocolSections()[PERSON_SECTION];
    if (person === undefined) {
      throw new Error('the fixture has no "person" node type');
    }
    const variables = isRecord(person.variables) ? person.variables : {};
    if (Object.hasOwn(variables, 'nickname')) {
      throw new Error(
        'the fixture already gives "person" a "nickname" attribute, so seeding one proves nothing',
      );
    }
    return { ...person, variables: { ...variables, nickname: NICKNAME } };
  };

  /** A section reading the codebook, the way every attribute picker does. */
  function PersonAttributesSection() {
    const { codebook } = useProtocolContext();
    const names = Object.keys(codebook.node?.person?.variables ?? {});
    return (
      <BuilderSection title="Person attributes">
        <p>{`Attributes: ${names.toSorted().join(', ')}`}</p>
      </BuilderSection>
    );
  }

  it('reaches a subscribed section, and the protocol it came from', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: (
        <>
          {commonSections}
          <PersonAttributesSection />
        </>
      ),
    });
    const before = await screen.findByText(/^Attributes: /);
    expect(before).not.toHaveTextContent('nickname');

    harness.receiveCodebookUpdate({
      node: { person: personWithNickname(harness) },
    });

    // The revision reaches the section over the channel, which is a microtask.
    expect(
      await screen.findByText(/^Attributes: .*\bnickname\b/),
    ).toBeInTheDocument();
    expect(
      harness.hostCodebook().node?.person?.variables?.nickname,
    ).toMatchObject({ name: 'nickname' });
  });
});
