import { afterEach, describe, expect, it } from 'vitest';

import {
  SectionOutlineStore,
  sectionOutlineStatus,
  type OutlineSection,
  type SectionFieldReader,
  type SectionValidationIssue,
} from '../outlineStore.ts';

afterEach(() => {
  document.body.replaceChildren();
});

function mountSection(id: string): HTMLElement {
  const element = document.createElement('section');
  element.id = id;
  document.body.append(element);
  return element;
}

describe('SectionOutlineStore', () => {
  it('follows the page when sections change places', () => {
    const store = new SectionOutlineStore();
    const first = mountSection('first');
    const second = mountSection('second');
    store.registerSection({ id: 'first', title: 'First' });
    store.registerSection({ id: 'second', title: 'Second' });
    store.setSectionElement('first', first);
    store.setSectionElement('second', second);

    expect(store.getSnapshot().map((section) => section.title)).toEqual([
      'First',
      'Second',
    ]);

    // Moved without registering, being renamed, or changing availability —
    // nothing the store is told about. The outline still has to agree with
    // the reading order a researcher now sees.
    document.body.prepend(second);

    expect(store.getSnapshot().map((section) => section.title)).toEqual([
      'Second',
      'First',
    ]);
  });

  it('hands back the same snapshot while nothing has moved', () => {
    const store = new SectionOutlineStore();
    const element = mountSection('only');
    store.registerSection({ id: 'only', title: 'Only' });
    store.setSectionElement('only', element);

    // Identity has to hold, or `useSyncExternalStore` would re-render forever.
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});

/**
 * A reader for a form where nothing is wrong and nothing is empty, so the
 * status these tests read can only have come from a session issue.
 */
const CONTENTED_FORM: SectionFieldReader = {
  getFieldState: () => ({
    value: 'something',
    meta: {
      isValidating: false,
      isTouched: true,
      isBlurred: true,
      isDirty: false,
      isValid: true,
    },
  }),
  getFieldErrors: () => null,
};

/** A form where every field is empty, so a required one reads as unanswered. */
const EMPTY_FORM: SectionFieldReader = {
  getFieldState: () => undefined,
  getFieldErrors: () => null,
};

function storeWith(
  fields: Readonly<Record<string, readonly string[]>>,
  required = false,
): SectionOutlineStore {
  const store = new SectionOutlineStore();
  for (const [sectionId, names] of Object.entries(fields)) {
    const element = mountSection(sectionId);
    store.registerSection({ id: sectionId, title: sectionId });
    store.setSectionElement(sectionId, element);
    for (const name of names) {
      store.registerField(sectionId, { name, label: name, required });
    }
  }
  return store;
}

/**
 * An issue the outline passes through in the words it was given.
 *
 * `custom` is the code every cross-reference rule in the protocol schema
 * raises, and its messages are written about the protocol rather than about a
 * shape, so they are the outline's own words already. The attribution tests
 * below are about WHICH section hears an issue, so they use the one code whose
 * message survives being reported.
 */
const said = (
  path: readonly (string | number)[],
  message: string,
): SectionValidationIssue => ({
  path,
  code: 'custom',
  message,
  absent: false,
});

const sectionNamed = (
  store: SectionOutlineStore,
  id: string,
): OutlineSection => {
  const section = store.getSnapshot().find((candidate) => candidate.id === id);
  if (section === undefined) throw new Error(`no section "${id}"`);
  return section;
};

/**
 * A session issue is addressed by a path in the stage document, and the only
 * thing that can turn one into a place on the page is the fields the sections
 * registered. Getting that wrong in either direction is a real cost: an
 * unclaimed issue leaves every section reading "Finished" over a stage that
 * cannot be saved, and a wrongly claimed one sends the researcher to a
 * section where there is nothing to fix.
 */
describe('session issues in the outline', () => {
  it('claims an issue at a field, inside it, and at the container above it', () => {
    const store = storeWith({ search: ['searchOptions.fuzziness'] });

    store.setValidationIssues([
      said(['searchOptions', 'fuzziness'], 'at the field'),
      said(['searchOptions', 'fuzziness', 0], 'inside it'),
      said(['searchOptions'], 'the container around it'),
    ]);

    expect(sectionNamed(store, 'search').issues).toEqual([
      'at the field',
      'inside it',
      'the container around it',
    ]);
    expect(
      sectionOutlineStatus(sectionNamed(store, 'search'), CONTENTED_FORM),
    ).toBe('error');
  });

  it('leaves an issue about a sibling key alone', () => {
    const store = storeWith({ search: ['searchOptions.fuzziness'] });

    // Same container, different value. Nothing mounted here edits it, so
    // there is nothing for a researcher sent to this section to do.
    store.setValidationIssues([
      said(['searchOptions', 'matchProperties', 0], 'a sibling'),
    ]);

    expect(sectionNamed(store, 'search').issues).toEqual([]);
    expect(
      sectionOutlineStatus(sectionNamed(store, 'search'), CONTENTED_FORM),
    ).toBe('complete');
  });

  it('gives the issue to the section that edits the exact value', () => {
    const store = storeWith({
      card: ['cardOptions'],
      labels: ['cardOptions.additionalProperties'],
    });

    store.setValidationIssues([
      said(
        ['cardOptions', 'additionalProperties', 0, 'variable'],
        'a column that is not there',
      ),
    ]);

    // Both sections reach it — one owns the whole container — and the deeper
    // registration wins, because that is the control the researcher changes.
    expect(sectionNamed(store, 'card').issues).toEqual([]);
    expect(sectionNamed(store, 'labels').issues).toEqual([
      'a column that is not there',
    ]);
  });

  it('gives a tie to the section that comes first on the page', () => {
    const store = storeWith({ first: ['behaviours'], second: ['behaviours'] });

    store.setValidationIssues([
      said(['behaviours', 'minNodes'], 'a limit that cannot hold'),
    ]);

    // Two sections reach the value equally well, so the researcher is sent to
    // the one they meet first rather than to whichever registered last.
    expect(sectionNamed(store, 'first').issues).toEqual([
      'a limit that cannot hold',
    ]);
    expect(sectionNamed(store, 'second').issues).toEqual([]);
  });

  it('stops reporting an issue that is no longer in the set', () => {
    const store = storeWith({ search: ['searchOptions.fuzziness'] });
    store.setValidationIssues([said(['searchOptions'], 'a problem')]);
    expect(sectionNamed(store, 'search').issues).toEqual(['a problem']);

    store.setValidationIssues([]);

    expect(sectionNamed(store, 'search').issues).toEqual([]);
    expect(
      sectionOutlineStatus(sectionNamed(store, 'search'), CONTENTED_FORM),
    ).toBe('complete');
  });

  it('says a refusal in the editor’s own words, never the validator’s', () => {
    const store = storeWith({ zoom: ['mapOptions.initialZoom'] });

    store.setValidationIssues([
      {
        path: ['mapOptions', 'initialZoom'],
        code: 'too_big',
        message: 'Too big: expected number to be <=22',
        absent: false,
      },
    ]);

    expect(sectionNamed(store, 'zoom').issues).toEqual([
      'mapOptions.initialZoom holds more than this stage allows.',
    ]);
    expect(
      sectionOutlineStatus(sectionNamed(store, 'zoom'), CONTENTED_FORM),
    ).toBe('error');
  });

  it('says one sentence about a control however many refusals reach it', () => {
    const store = storeWith({ map: ['mapOptions'] });

    // A compound control owning a sub-document claims every refusal inside it.
    // Four repetitions of one sentence is not four things to fix.
    store.setValidationIssues(
      ['style', 'center', 'initialZoom', 'targetFeatureProperty'].map(
        (key) => ({
          path: ['mapOptions', key],
          code: 'invalid_type',
          message: 'Invalid input: expected string, received number',
          absent: false,
        }),
      ),
    );

    expect(sectionNamed(store, 'map').issues).toEqual([
      'mapOptions holds the wrong kind of value.',
    ]);
  });

  /**
   * The schema and a required field are saying the same thing about an empty
   * value, and the field says it in the words the researcher is already
   * reading everywhere else.
   */
  it('leaves a missing value to the required field that owns it', () => {
    const store = storeWith({ config: ['nodeConfig.egoVariable'] }, true);

    store.setValidationIssues([
      {
        path: ['nodeConfig', 'egoVariable'],
        code: 'invalid_type',
        message: 'Invalid input: expected string, received undefined',
        absent: true,
      },
    ]);

    expect(sectionNamed(store, 'config').issues).toEqual([]);
    expect(
      sectionOutlineStatus(sectionNamed(store, 'config'), EMPTY_FORM),
    ).toBe('incomplete');
  });

  /**
   * The other half of that rule. Nothing on the page says a value is needed
   * unless a field says it is required, so a section that stayed quiet here
   * would read "Finished" over a stage the protocol refuses to save.
   */
  it('keeps a missing value no required field speaks for', () => {
    const store = storeWith({ config: ['nodeConfig.egoVariable'] });

    store.setValidationIssues([
      {
        path: ['nodeConfig', 'egoVariable'],
        code: 'invalid_type',
        message: 'Invalid input: expected string, received undefined',
        absent: true,
      },
    ]);

    expect(sectionNamed(store, 'config').issues).toEqual([
      'nodeConfig.egoVariable has no value, and this stage needs one.',
    ]);
    expect(
      sectionOutlineStatus(sectionNamed(store, 'config'), EMPTY_FORM),
    ).toBe('error');
  });

  it('hands back the same snapshot when the issues have not changed', () => {
    const store = storeWith({ search: ['searchOptions.fuzziness'] });
    const issues = [said(['searchOptions'], 'a problem')];
    store.setValidationIssues(issues);
    const snapshot = store.getSnapshot();

    // A fresh array of the same issues arrives on every validation pass, and
    // one that re-notified would re-render the outline forever.
    store.setValidationIssues(issues.map((issue) => ({ ...issue })));

    expect(store.getSnapshot()).toBe(snapshot);
  });
});
