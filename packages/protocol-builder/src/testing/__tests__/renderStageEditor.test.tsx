import { act, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { useResourceGateway } from '../../resources/context.tsx';
import BuilderSection from '../../sections/BuilderSection.tsx';
import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import type {
  StageEditorComponent,
  StageEditorProps,
} from '../../stage-editor-contract.ts';
import { fixtureStageIds, loadFixtureStage } from '../protocolFixture.ts';
import {
  renderStageEditor,
  type RenderStageEditorOptions,
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
