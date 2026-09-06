import { act, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { buildUpdateVariableRequest } from '../../codebook/editing.ts';
import RichTextField from '../../fields/RichTextField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useResourceGateway } from '../../resources/context.tsx';
import BuilderSection from '../../sections/BuilderSection.tsx';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type { CompoundEditResult } from '../../session.ts';
import type {
  StageEditorComponent,
  StageEditorProps,
} from '../../stage-editor-contract.ts';
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

/**
 * A section that asks the gateway what is INSIDE a data file, the way a roster
 * stage's card, sort and search sections do: the columns they offer a
 * researcher are the roster's own attribute names, and nothing but the file
 * can supply them. Seeded with a placeholder body instead, every one of those
 * sections would test its "this file cannot be read" state rather than itself.
 */
function RosterColumnsSection({
  resourceId,
}: Readonly<{ resourceId: string }>) {
  const gateway = useResourceGateway();
  const [columns, setColumns] = useState<readonly string[]>([]);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    let current = true;
    const readColumns = async () => {
      const result = await gateway.inspect(resourceId);
      if (!current) return;
      if (result.status === 'ok') setColumns(result.data.variableNames ?? []);
      else setUnreadable(true);
    };
    void readColumns();
    return () => {
      current = false;
    };
  }, [gateway, resourceId]);

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

/**
 * A section that reads a map LAYER, the way a geospatial stage's target-feature
 * section does: the properties it offers a researcher are the layer's own, and
 * only the file has them. Seeded with a placeholder body — valid JSON with no
 * features in it — this section would offer nothing at all and say the layer
 * cannot be read.
 */
function LayerFeaturesSection({
  resourceId,
  property,
}: Readonly<{ resourceId: string; property: string }>) {
  const gateway = useResourceGateway();
  const [features, setFeatures] = useState<readonly string[]>([]);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    let current = true;
    const readFeatures = async () => {
      const result = await gateway.download(resourceId);
      if (!current) return;
      const layer =
        result.status === 'ok'
          ? (JSON.parse(new TextDecoder().decode(result.data.bytes)) as unknown)
          : undefined;
      const collection =
        typeof layer === 'object' && layer !== null && 'features' in layer
          ? layer.features
          : undefined;
      if (!Array.isArray(collection) || collection.length === 0) {
        setUnreadable(true);
        return;
      }
      setFeatures(
        collection.map((feature: unknown) => {
          const properties =
            typeof feature === 'object' &&
            feature !== null &&
            'properties' in feature
              ? feature.properties
              : undefined;
          const value =
            typeof properties === 'object' && properties !== null
              ? (properties as Record<string, unknown>)[property]
              : undefined;
          return typeof value === 'string' ? value : '';
        }),
      );
    };
    void readFeatures();
    return () => {
      current = false;
    };
  }, [gateway, property, resourceId]);

  return (
    <BuilderSection title="Target feature">
      <p>
        {unreadable
          ? 'That layer could not be read as GeoJSON.'
          : `Features: ${features.join(', ')}`}
      </p>
    </BuilderSection>
  );
}

describe('the stage-editor test harness', () => {
  it('opens a stage of the shared protocol over a real session', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: commonSections,
    });

    expect(harness.seeded.type).toBe('Information');
    expect(harness.session.getSnapshot().editedSection.fields).toMatchObject({
      title: expect.any(String) as unknown as string,
    });
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
    harness.setReadOnly();

    expect(await harness.submit()).toBeNull();
    await expect(harness.roundTrip({ unowned })).rejects.toThrow(
      /did not save/,
    );
  });

  it('hands editing away and takes it back', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: commonSections,
    });

    harness.setReadOnly();
    expect(harness.session.getSnapshot().access.mode).toBe('readOnly');
    expect(await harness.submit()).toBeNull();

    harness.setReadOnly(false);
    expect(harness.session.getSnapshot().access.mode).toBe('editable');
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
      <ProtocolField<typeof RichTextField>
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
 * The protocol's asset manifest and the resource gateway are two halves of one
 * fact: a stage may reference a resource only if the manifest lists it AND the
 * host holds its bytes. The harness seeds both from the same manifest, so a
 * stage seeded with a reference is one a host would accept — and a section that
 * reads a data file gets the file, not a placeholder.
 */
describe('the resources a harnessed stage can reach', () => {
  it('hands a section the columns of the roster the fixture ships', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-roster-1',
      sections: <RosterColumnsSection resourceId="roster_data" />,
    });

    // The roster's own attributes, read out of the file beside the protocol.
    expect(await screen.findByText('Columns: age, name')).toBeInTheDocument();
    // And the gateway holds it as something the protocol already has, rather
    // than as something this session staged.
    const listed = await harness.gateway.list();
    if (listed.status !== 'ok') throw new Error('the gateway refused to list');
    expect(
      listed.data.find((resource) => resource.id === 'roster_data'),
    ).toMatchObject({ name: 'Roster', kind: 'network', status: 'committed' });
  });

  /**
   * The same claim for the OTHER file the protocol ships. A layer seeded with
   * a placeholder parses as JSON and holds no features, so every geospatial
   * section that reads it shows its unreadable state — which is what the whole
   * interface's tests and stories were doing.
   */
  it('hands a section the features of the map layer the fixture ships', async () => {
    const harness = renderStageEditor({
      stageId: 'geospatial-1',
      sections: <LayerFeaturesSection resourceId="geo_data" property="name" />,
    });

    // The layer's own regions, named by the property `geospatial-1` targets.
    expect(
      await screen.findByText('Features: Downtown, Uptown'),
    ).toBeInTheDocument();
    const listed = await harness.gateway.list();
    if (listed.status !== 'ok') throw new Error('the gateway refused to list');
    expect(
      listed.data.find((resource) => resource.id === 'geo_data'),
    ).toMatchObject({ name: 'Regions', kind: 'geojson', status: 'committed' });
  });

  it('joins an extra asset to the manifest and the gateway together', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-roster-1',
      assets: {
        second_roster: {
          name: 'Another roster',
          type: 'network',
          source: 'roster.json',
        },
      },
      sections: <RosterColumnsSection resourceId="second_roster" />,
    });

    expect(await screen.findByText('Columns: age, name')).toBeInTheDocument();
    const listed = await harness.gateway.list();
    if (listed.status !== 'ok') throw new Error('the gateway refused to list');
    expect(listed.data.map((resource) => resource.id)).toEqual(
      expect.arrayContaining(['roster_data', 'second_roster']),
    );
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
 * the stage order to read its position from. Both come from the session, which
 * the host opened saying so — the sections below are mounted with no props at
 * all, which is how a family editor mounts them.
 */
describe('a stage the session is creating', () => {
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
      id: harness.seeded.id,
      type: 'Information',
      label: 'A new page',
    });
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
 * The harness seeds a codebook the way a collaborator changes one, and both
 * ends of the session have to hear about it: the editor under test, which
 * reads the session, and the host, which is what a later compound edit is
 * judged against.
 *
 * They used to hear different stories. The seeded attribute reached the
 * session alone, under a revision the harness made up, so the host's copy of
 * the entity still hashed to what it held before — and the next compound edit
 * touching that entity, built (correctly) on what the session was shown, was
 * refused as `stale-base`. A family test that needed an existing attribute had
 * to create one through the dialog instead of seeding it, and "nothing reached
 * the codebook" could only be asserted as "the host's type never gained it",
 * which nothing could seed in the first place.
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

  /** The fixture's `person` type, as the session currently holds it. */
  const personDocument = (harness: StageEditorHarness): SectionDoc => {
    const person =
      harness.session.getSnapshot().protocolSections[PERSON_SECTION];
    if (person === undefined) {
      throw new Error('the fixture has no "person" node type');
    }
    return person;
  };

  /**
   * The fixture's `person` type with one more attribute on it.
   *
   * Refuses an id the fixture already carries: seeding an attribute that was
   * there anyway would let every assertion below pass without the seeding
   * having done anything.
   */
  const personWithNickname = (harness: StageEditorHarness): SectionDoc => {
    const person = personDocument(harness);
    const variables = isRecord(person.variables) ? person.variables : {};
    if (Object.hasOwn(variables, 'nickname')) {
      throw new Error(
        'the fixture already gives "person" a "nickname" attribute, so seeding one proves nothing',
      );
    }
    return { ...person, variables: { ...variables, nickname: NICKNAME } };
  };

  const seededHarness = (): StageEditorHarness => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: commonSections,
    });
    harness.receiveCodebookUpdate({
      node: { person: personWithNickname(harness) },
    });
    return harness;
  };

  /** The rename a codebook editor sends when the researcher renames one. */
  const renameNickname = async (
    harness: StageEditorHarness,
  ): Promise<CompoundEditResult> => {
    const request = buildUpdateVariableRequest({
      requestId: 'rename-the-seeded-attribute',
      description: 'Rename an attribute',
      subject: { entity: 'node', type: 'person' },
      // What an editor builds its edit from: the entity the SESSION showed it.
      authoritativeDocument: personDocument(harness),
      variableId: 'nickname',
      draft: { name: 'preferred_name' },
    });
    let result: CompoundEditResult | undefined;
    await act(async () => {
      result = await harness.session.requestCompoundEdit(request);
    });
    if (result === undefined)
      throw new Error('the compound edit never settled');
    return result;
  };

  it('reaches the host as well as the session', () => {
    const harness = seededHarness();

    expect(
      harness.hostCodebook().node?.person?.variables?.nickname,
    ).toMatchObject({ name: 'nickname' });
    expect(harness.session.getSnapshot().manifestRevision).toEqual(
      harness.host.getSnapshot().manifestRevision,
    );
  });

  it('is a base a later compound edit is accepted against', async () => {
    const harness = seededHarness();

    await expect(renameNickname(harness)).resolves.toMatchObject({
      status: 'applied',
    });
    expect(
      harness.hostCodebook().node?.person?.variables?.nickname,
    ).toMatchObject({ name: 'preferred_name' });
  });

  /**
   * The escape hatch, and the reason it stays: a session whose base has moved
   * out from under the host is a real state, and nothing else can produce it
   * now that seeding keeps the two in step.
   */
  it('can be fabricated for the session alone, leaving the host behind', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: commonSections,
    });
    harness.receiveConflictingCodebookUpdate({
      node: { person: personWithNickname(harness) },
    });

    expect(personDocument(harness).variables).toHaveProperty('nickname');
    expect(harness.hostCodebook().node?.person?.variables).not.toHaveProperty(
      'nickname',
    );
    await expect(renameNickname(harness)).resolves.toMatchObject({
      status: 'failed',
      reason: 'stale-base',
    });
  });

  /**
   * The harness's `onFinish` records the save rather than applying it, so the
   * host is deliberately a save behind on the edited stage's own section.
   * Seeding hands the session the host's whole snapshot, which would carry
   * that lag back in: the editor would go on describing the stage as it was
   * before the researcher saved it, because a collaborator added an attribute
   * somewhere else entirely.
   */
  it('does not put the host’s older stage back into the session', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-roster-1',
      sections: (
        <>
          <StageNameSection />
          <SubjectSection entity="node" />
        </>
      ),
    });
    const name = await screen.findByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(name);
    await harness.user.type(name, 'Renamed roster');
    const request = await harness.submit();
    expect(request?.stageDocument.label).toBe('Renamed roster');

    const stageKey = sectionId({
      kind: 'stage',
      stageId: 'name-generator-roster-1',
    });
    const labelNow = () =>
      harness.session.getSnapshot().protocolSections[stageKey]?.label;
    // Reported as a pair, so a save the session never took is told apart from
    // a seeding that undid one.
    const beforeSeeding = labelNow();

    harness.receiveCodebookUpdate({
      node: {
        place: { name: 'Place', color: 'sea-green', variables: {} },
      },
    });

    expect({ beforeSeeding, afterSeeding: labelNow() }).toEqual({
      beforeSeeding: 'Renamed roster',
      afterSeeding: 'Renamed roster',
    });
  });

  /**
   * And says so rather than dropping the next arrival in silence: a session
   * already past the host refuses every revision the host issues after it, and
   * `receiveAuthoritativeUpdate` refuses without a word.
   */
  it('refuses to seed a session a fabricated arrival has taken past the host', () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: commonSections,
    });
    harness.receiveConflictingCodebookUpdate({
      node: { person: personWithNickname(harness) },
    });

    expect(() =>
      harness.receiveCodebookUpdate({
        node: { person: personDocument(harness) },
      }),
    ).toThrow(/did not take the seeded codebook change/);
  });
});
