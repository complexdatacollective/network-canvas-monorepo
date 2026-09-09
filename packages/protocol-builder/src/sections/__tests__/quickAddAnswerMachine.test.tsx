import { cleanup, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { FinishRequest } from '../../session.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import QuickAddSection from '../QuickAddSection.tsx';
import SubjectSection from '../SubjectSection.tsx';
import { changeSubjectTo } from './changeSubject.ts';
import { holdTheHost } from './holdTheHost.ts';

/**
 * Quick add's two codebook round trips, as one machine.
 *
 * Both of this section's writes — inventing the attribute quick add fills in,
 * and adding "must be answered" to the one it already fills in — are answered
 * by the host after a delay the researcher can act inside. Codex has now
 * reviewed this file's component four times, and rounds two, three and four
 * were all the same question asked of a different interleaving: what does the
 * section say, and what may the stage commit, while an answer is on its way or
 * once it has landed somewhere other than where it was asked from?
 *
 * So the machine is written down rather than patched one cell at a time. The
 * row is the `quickAdd` field; the request is whichever round trip is out; the
 * answer is where it belongs by the time it arrives.
 *
 * ```
 * ROW (quickAdd)      REQUEST          ANSWER           what is true afterwards
 * ------------------- ---------------- ---------------- ----------------------------------------------
 * unset               none             —                the picker is empty; a save is refused (fieldRequired)
 * unset               create pending   applied here     the created attribute is selected, nothing is said
 * unset               create pending   landed elsewhere the notice names the created attribute, until the row names it
 * unset               create pending   refused/failed   nothing is created, the refusal is on screen, the box keeps the name
 * existing attribute  none             —                the offer to require an answer stands while it may be left empty
 * existing attribute  create pending   applied here     the created attribute replaces what the row named
 * existing attribute  create pending   landed elsewhere the row keeps the researcher's newer choice; the notice says so
 * existing attribute  require pending  applied here     the in-place confirmation is said and focus returns to the picker
 * existing attribute  require pending  landed elsewhere the elsewhere confirmation names the attribute that was required
 * existing attribute  require pending  refused/failed   nothing is required, the refusal stands outside the offer
 * just-created        none             —                indistinguishable from any other existing attribute
 * just-created        require pending  applied here     as above; a created attribute already carries the rule
 * ```
 *
 * The events that move between those cells, and what each one must leave true:
 *
 * ```
 * EVENT                              while a request is out            once the answer has landed
 * ---------------------------------- --------------------------------- ------------------------------------------
 * picks another attribute            the row moves; the answer lands    the notice about the answer stands
 *                                    "beside another attribute"
 * picks the created/required one     (same)                             the notice is forgotten: the researcher
 *                                                                       has answered the question it asked
 * types in the name box              held: the box is disabled          starts a different create; notice forgotten
 * presses Create again               held: the button is disabled       a second, independent create
 * presses the shell's Save           REFUSED while a compound edit is   commits the row as it now stands
 *                                    in flight (session.finish)
 * host answers success               the answer is applied where it     —
 *                                    was asked from, or said elsewhere
 * host answers refused / throws      the refusal is on screen and       —
 *                                    nothing was written
 * collaborator repoints the subject  the answer lands "on another type" the notice is forgotten on the way back
 * lease lost                         the session refuses the write and  every control is read-only
 *                                    the refusal says so
 * the attribute is removed           the offer and the in-place         the elsewhere notice still stands: it is
 *                                    confirmation go with it            about a write that did land
 * ```
 *
 * The last of those events has a mirror image the section cannot reach from
 * here: a create or a require asked for AFTER a save has begun. The save reads
 * the stage once, before it validates, so an answer applied inside that window
 * is created in the codebook and referenced by nothing. The rule is the same
 * one — the two may not overlap in either order — and it is stated where a
 * host can be made slow enough to reach it, in `session.test.ts`; this
 * harness's host answers a finish within the click.
 *
 * The invariants below are what that table asserts, and they are asserted over
 * random interleavings as well as over the four cells a review found.
 */
const CREATED_NOT_SELECTED =
  '“nickname” was added to the codebook. You have chosen a different attribute here since you asked for it, so it has not been selected.';
const CREATED_ON_ANOTHER_TYPE =
  '“nickname” was added to the type this stage was about when you asked for it. This stage is about a different type now, so it has not been selected here.';
const REQUIRED_ELSEWHERE =
  '“name” now has to be answered, everywhere the protocol uses it. It is not the attribute this stage fills in any more.';
const REQUIRED_HERE =
  'This attribute now has to be answered, everywhere the protocol uses it.';
const SAVE_HELD_FOR_CODEBOOK =
  'This stage was not saved: a change to the codebook it asked for is still being made. Wait for it to finish, then save again.';

type Harness = ReturnType<typeof renderStageEditor>;

const openEditor = (): Harness =>
  renderStageEditor({
    stageId: 'name-generator-quick-add-1',
    sections: (
      <>
        <SubjectSection entity="node" />
        <QuickAddSection />
      </>
    ),
  });

const picker = (): HTMLSelectElement =>
  screen.getByRole('combobox', {
    name: /Attribute filled in/,
  }) as HTMLSelectElement;

const nameBox = (): HTMLElement =>
  screen.getByRole('textbox', { name: /Create a new attribute/ });

const createButton = (): HTMLElement =>
  screen.getByRole('button', { name: 'Create the attribute' });

/** The attributes the host's codebook holds for the fixture's person type. */
const personVariables = (
  harness: Harness,
): Readonly<Record<string, { name: string }>> =>
  (harness.hostCodebook().node?.person?.variables ?? {}) as Readonly<
    Record<string, { name: string }>
  >;

/** The record key the codebook gave a person attribute, or nothing. */
const personVariableNamed = (
  harness: Harness,
  name: string,
): string | undefined =>
  Object.entries(personVariables(harness)).find(
    ([, variable]) => variable.name === name,
  )?.[0];

/** Whether the host's copy of a person attribute has to be answered. */
const isRequired = (harness: Harness, variableId: string): boolean => {
  const variable: unknown = personVariables(harness)[variableId];
  if (typeof variable !== 'object' || variable === null) return false;
  const validation: unknown = Reflect.get(variable, 'validation');
  return (
    typeof validation === 'object' &&
    validation !== null &&
    Reflect.get(validation, 'required') === true
  );
};

/** What the stage the session holds says it fills in. */
const draftQuickAdd = (harness: Harness): unknown =>
  harness.session.getSnapshot().editedSection.fields.quickAdd;

const onScreen = (sentence: string): boolean =>
  screen.queryByText(sentence) !== null;

/**
 * Four interleavings a review reached, each written as the researcher reaches
 * it. Every one of them failed on aef6f071c.
 */
describe('a quick-add answer that lands somewhere other than where it was asked', () => {
  it('stops saying an attribute is required elsewhere once the stage fills it in again', async () => {
    const harness = openEditor();
    const settle = holdTheHost(harness);

    await screen.findByText('This attribute can be left empty');
    await harness.user.click(
      screen.getByRole('button', { name: 'Require an answer' }),
    );
    await harness.user.selectOptions(picker(), 'relationship_to_ego');
    await settle();

    expect(onScreen(REQUIRED_ELSEWHERE)).toBe(true);

    // The researcher goes back to the attribute they had it made required
    // for, so the sentence's own claim — that this stage does not fill it in
    // any more — has stopped being true of what is on screen.
    await harness.user.selectOptions(picker(), 'name');

    expect(onScreen(REQUIRED_ELSEWHERE)).toBe(false);
  });

  it('stops saying a created attribute was not selected once the researcher selects it', async () => {
    const harness = openEditor();
    const settle = holdTheHost(harness);

    await harness.user.type(nameBox(), 'nickname');
    await harness.user.click(createButton());
    await harness.user.selectOptions(picker(), 'relationship_to_ego');
    await settle();

    expect(onScreen(CREATED_NOT_SELECTED)).toBe(true);

    const created = personVariableNamed(harness, 'nickname');
    expect(created).toBeDefined();
    await harness.user.selectOptions(picker(), created ?? '');

    expect(onScreen(CREATED_NOT_SELECTED)).toBe(false);
  });

  it('refuses to save the stage while the attribute it asked for is still being created', async () => {
    const harness = openEditor();
    const settle = holdTheHost(harness);

    await harness.user.type(nameBox(), 'nickname');
    await harness.user.click(createButton());

    // The Create button and the name box are held, but the host's Save is not
    // this component's to disable — so the save has to be refused where every
    // host's save is decided.
    expect(await harness.submit()).toBeNull();
    expect(onScreen(SAVE_HELD_FOR_CODEBOOK)).toBe(true);

    await settle();
    const created = personVariableNamed(harness, 'nickname');
    expect(created).toBeDefined();
    expect(picker()).toHaveValue(created);

    // And once it has settled, the save commits the stage WITH what it asked
    // for, which is what pressing Create promised.
    const request = await harness.submit();
    expect(request?.stageDocument.quickAdd).toBe(created);
  });

  it('refuses to save the stage while the rule it asked for is still being added', async () => {
    const harness = openEditor();
    const settle = holdTheHost(harness);

    await screen.findByText('This attribute can be left empty');
    await harness.user.click(
      screen.getByRole('button', { name: 'Require an answer' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(onScreen(SAVE_HELD_FOR_CODEBOOK)).toBe(true);

    await settle();
    expect(isRequired(harness, 'name')).toBe(true);
    const request = await harness.submit();
    expect(request?.stageDocument.quickAdd).toBe('name');
  });
});

/**
 * The same machine, driven at random.
 *
 * A deterministic test per interleaving is one cell of the table; four rounds
 * of review found four of them one at a time. This walks the table instead:
 * every seed starts one round trip, does up to two things inside it, answers
 * it one of three ways, and then does up to two more things — and asserts the
 * invariants the whole table exists to state. A seed is the only input, so a
 * failure is reproducible from the number the message prints.
 */
type Step = Readonly<{
  what: string;
  /** Closes over the seed's own harness, which is the only one mounted. */
  run: () => Promise<void>;
}>;

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Selects an option only where the picker is offering it. */
const selectIfOffered = async (
  harness: Harness,
  value: string | undefined,
): Promise<void> => {
  if (value === undefined) return;
  const offered = [...picker().options].some(
    (option) => option.value === value,
  );
  if (!offered) return;
  await harness.user.selectOptions(picker(), value);
};

/**
 * A collaborator deletes the attribute the stage started out filling in,
 * leaving everything else — including anything this session created — where it
 * was.
 */
const removeTheAttribute = (harness: Harness): void => {
  const person = harness.hostCodebook().node?.person;
  if (person === undefined) return;
  const { name: _dropped, ...kept } = person.variables ?? {};
  harness.receiveCodebookUpdate({
    node: { person: { ...person, variables: kept } },
  });
};

/**
 * One seed: open the editor, start a round trip, act inside it, answer it,
 * act again, then read the invariants off what is on screen.
 */
const walk = async (seed: number, script: string[]): Promise<void> => {
  const random = mulberry32(seed);
  const choose = <T,>(options: readonly T[]): T =>
    options[Math.floor(random() * options.length)] as T;

  const harness = openEditor();
  await screen.findByRole('combobox', { name: /Attribute filled in/ });

  /** Every save this seed asked for, and what the host was handed. */
  const committed: FinishRequest[] = [];
  let subjectRepointed = false;
  let leaseLost = false;
  let attributeRemoved = false;

  const save: Step = {
    what: 'presses Save',
    run: async () => {
      const finished = await harness.submit();
      if (finished !== null) committed.push(finished);
    },
  };
  const pickAnother: Step = {
    what: 'picks another attribute',
    run: () => selectIfOffered(harness, 'relationship_to_ego'),
  };
  const typeAnotherName: Step = {
    what: 'types another name in the box',
    run: async () => {
      if ((nameBox() as HTMLInputElement).disabled) return;
      await harness.user.type(nameBox(), 'alias');
    },
  };
  const pressCreateAgain: Step = {
    what: 'presses Create again',
    run: async () => {
      await harness.user.click(createButton());
    },
  };
  const repoint: Step = {
    what: 'the subject is repointed',
    run: async () => {
      if (subjectRepointed) return;
      subjectRepointed = true;
      await changeSubjectTo(harness.user, 'family member');
    },
  };
  const loseLease: Step = {
    what: 'the lease is lost',
    run: async () => {
      leaseLost = true;
      harness.setReadOnly(true);
    },
  };
  const removeIt: Step = {
    what: 'a collaborator removes the attribute',
    run: async () => {
      attributeRemoved = true;
      removeTheAttribute(harness);
      await waitFor(() => expect(picker()).toBeInTheDocument());
    },
  };

  const request = choose(['create', 'require'] as const);
  const settle = holdTheHost(harness);
  script.push(`asks for a ${request}`);
  if (request === 'create') {
    await harness.user.type(nameBox(), 'nickname');
    await harness.user.click(createButton());
  } else {
    await screen.findByText('This attribute can be left empty');
    await harness.user.click(
      screen.getByRole('button', { name: 'Require an answer' }),
    );
  }

  const during: readonly Step[] = [
    pickAnother,
    typeAnotherName,
    pressCreateAgain,
    save,
    repoint,
    loseLease,
    removeIt,
  ];
  for (let i = Math.floor(random() * 3); i > 0; i -= 1) {
    const step = choose(during);
    script.push(step.what);
    await step.run();
  }

  // Nothing may be committed while the answer this section is waiting on is
  // still out: a stage saved here is a stage saved without what the
  // researcher just asked for.
  const committedInFlight = committed.length;

  const answer = choose(['applies', 'refuses', 'throws'] as const);
  script.push(`the host ${answer}`);
  await settle(answer);

  const created = personVariableNamed(harness, 'nickname');
  const after: readonly Step[] = [
    pickAnother,
    {
      what: 'picks the attribute the answer was about',
      run: () =>
        selectIfOffered(harness, request === 'create' ? created : 'name'),
    },
    typeAnotherName,
    save,
  ];
  for (let i = Math.floor(random() * 3); i > 0; i -= 1) {
    const step = choose(after);
    script.push(step.what);
    await step.run();
  }

  const fillsIn = picker().value;

  // (b) The save waits: nothing was committed while the answer was out.
  expect(committedInFlight).toBe(0);

  // (b) And nothing committed names an attribute the codebook does not hold.
  for (const finished of committed) {
    const quickAdd: unknown = finished.stageDocument.quickAdd;
    if (typeof quickAdd !== 'string') continue;
    const subject: unknown = finished.stageDocument.subject;
    const type =
      typeof subject === 'object' && subject !== null
        ? Reflect.get(subject, 'type')
        : undefined;
    const held = harness.hostCodebook().node?.[String(type)]?.variables ?? {};
    expect(Object.keys(held)).toContain(quickAdd);
  }

  // (c) One press, one attribute: whatever happened around it, the codebook
  // was never written twice for one press of Create.
  const createdCopies = Object.values(personVariables(harness)).filter(
    (variable) => variable.name === 'nickname',
  ).length;
  expect(createdCopies).toBeLessThanOrEqual(1);
  // And it WAS written once, where nothing gave the session a reason to refuse
  // the request: a collaborator moving the codebook under it and a lost lease
  // are both refusals, whatever the host would have answered.
  if (
    request === 'create' &&
    answer === 'applies' &&
    !attributeRemoved &&
    !leaseLost
  ) {
    expect(createdCopies).toBe(1);
  }

  // (a) A notice on screen is true of the draft on screen.
  if (onScreen(CREATED_NOT_SELECTED)) {
    expect(created).toBeDefined();
    expect(fillsIn).not.toBe(created);
    expect(subjectRepointed).toBe(false);
  }
  if (onScreen(CREATED_ON_ANOTHER_TYPE)) {
    expect(created).toBeDefined();
    expect(subjectRepointed).toBe(true);
  }
  if (onScreen(REQUIRED_ELSEWHERE)) {
    expect(fillsIn).not.toBe('name');
  }
  if (onScreen(REQUIRED_HERE)) {
    expect(fillsIn).toBe('name');
    expect(isRequired(harness, 'name')).toBe(true);
  }

  // (d) A lease lost before the answer writes nothing into the stage, and
  // the researcher is told rather than left looking at a control that did
  // nothing. The codebook is the HOST's, and it answers a request it was
  // already handed; what this section owns is the draft and the sentence.
  if (leaseLost) {
    expect(draftQuickAdd(harness)).toBe('name');
    expect(screen.queryAllByRole('alert').length).toBeGreaterThan(0);
  }
};

describe('the quick-add answer machine, over random interleavings', () => {
  /** How many seeds one run walks. Every seed is printed on a failure. */
  const SEEDS = 200;

  it('says only what is true of the draft on screen, and never commits over a pending answer', async () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const script: string[] = [];
      try {
        await walk(seed, script);
      } catch (error: unknown) {
        throw new Error(
          `seed ${seed}: ${script.join(' → ')}\n\n${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      } finally {
        cleanup();
      }
    }
  }, 600_000);
});
