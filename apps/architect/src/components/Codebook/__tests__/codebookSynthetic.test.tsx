import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';

import { analyseSyntheticFeasibility } from '@codaco/protocol-utilities';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import {
  STAGE_SECTION_SYNTHETIC,
  stageSectionHref,
} from '~/components/StageEditor/deepLink';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import Codebook from '../Codebook';
import { codebookHref } from '../deepLink';
import {
  FIXTURE_DOCUMENT,
  PAIR_CEILING_DOCUMENT,
  parseFixture,
} from './fixtureProtocol';

/**
 * The Codebook as the home of synthetic data (spec revision 2, item 6): the
 * protocol-wide verdict at the top, what generation would produce for each
 * attribute beside it, and the authoring of those parameters in the table
 * itself.
 *
 * Nothing is mocked. The protocol goes into the editing buffer as a DOCUMENT —
 * which is what the buffer really holds — every summary is resolved by the real
 * schema, and the verdict comes from the same pre-seed analysis
 * `generateInterviews` refuses with. The refusal is asserted against that
 * analysis's own output rather than a copied string, so a reworded engine
 * refusal updates the expectation while a PARAPHRASED one fails.
 */

type TestStore = ReturnType<typeof createStore>;

const createStore = () =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

const renderCodebook = (
  document: unknown,
  path = '/protocol/codebook',
): TestStore => {
  window.history.replaceState(null, '', path);
  const store = createStore();
  // Through `unknown` on purpose: the editing buffer is typed as parse output
  // for the editors' convenience but holds the stored document, which is what
  // "authored" is legible in at all.
  store.dispatch(setActiveProtocol(document as CurrentProtocol));

  render(
    <Provider store={store}>
      <Codebook />
    </Provider>,
  );
  return store;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * One attribute as the SAVED codebook holds it.
 *
 * Walked as untyped data and throwing when the path is not there: the
 * assertions below are about which keys the protocol carries, and a reader that
 * resolved a missing attribute to `undefined` would compare undefined to
 * undefined and pass while measuring nothing.
 */
const savedVariable = (
  store: TestStore,
  path: readonly string[],
): Record<string, unknown> => {
  const protocol: unknown = getProtocol(store.getState());
  let cursor: unknown = isRecord(protocol) ? protocol.codebook : undefined;
  for (const key of path) {
    if (!isRecord(cursor)) {
      throw new Error(`nothing at codebook.${path.join('.')}`);
    }
    cursor = cursor[key];
  }
  if (!isRecord(cursor)) {
    throw new Error(`no attribute at codebook.${path.join('.')}`);
  }
  return cursor;
};

/**
 * The disclosure for one attribute, matched on its title AND the resolved
 * summary beside it.
 *
 * `\s*` rather than a literal space because the two are separate elements
 * inside the trigger: a browser's accessible-name computation separates them
 * (the flex children are block-level, so Chromium inserts a space — which is
 * why the e2e page object anchors on `^title\s`), while jsdom has no layout and
 * concatenates. Both are the same name; only the separator is a rendering
 * detail, and the assertion is about the two halves being there.
 */
const disclosureFor = (title: string, summary: RegExp): RegExp =>
  new RegExp(`^${title}\\s*${summary.source}`);

const EGO_AGE = ['ego', 'variables', 'egoAge'] as const;
const PERSON_TRUST = ['node', 'person', 'variables', 'personTrust'] as const;
const FRIEND_STRENGTH = [
  'edge',
  'friend',
  'variables',
  'friendStrength',
] as const;

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('the protocol verdict', () => {
  it('says it is still checking, then that generation is possible', async () => {
    renderCodebook(FIXTURE_DOCUMENT);

    expect(screen.getByText('Checking this protocol…')).toBeVisible();
    expect(await screen.findByText('Generation is possible')).toBeVisible();
  });

  it("renders the engine's refusal verbatim instead", async () => {
    const conflicts = analyseSyntheticFeasibility(
      parseFixture(PAIR_CEILING_DOCUMENT),
    );
    const reason = conflicts[0]?.reason;
    // Guards the fixture: a feasible protocol would make everything below pass
    // by saying nothing.
    expect(reason).toBeDefined();
    expect(reason).toContain('stage "Every pair"');

    renderCodebook(PAIR_CEILING_DOCUMENT);

    expect(
      await screen.findByText('Synthetic data cannot be generated'),
    ).toBeVisible();
    expect(screen.getByText(reason as string)).toBeVisible();
    expect(screen.queryByText('Generation is possible')).toBeNull();

    // "…or open the stage it names" is what the verdict tells the researcher
    // to do, and a link is what lets it mean that: the conflict carries the
    // owning stage structurally, so the route needs no prose parsed.
    const stageId = conflicts[0]?.stageId;
    expect(stageId).toBeDefined();
    expect(
      screen.getByRole('link', { name: /^Open the stage/ }),
    ).toHaveAttribute(
      'href',
      stageSectionHref(stageId as string, STAGE_SECTION_SYNTHETIC),
    );
  });

  it('reports a draft that does not parse rather than a verdict', async () => {
    renderCodebook({
      ...FIXTURE_DOCUMENT,
      // A stage type the schema has never heard of: the codebook is intact, so
      // the screen still has rows to show, but there is nothing to analyse.
      stages: [{ id: 'broken', type: 'NotAStageType' }],
    });

    expect(
      await screen.findByText('This protocol cannot be checked yet'),
    ).toBeVisible();
    expect(screen.queryByText('Generation is possible')).toBeNull();
  });
});

describe('what each attribute row says', () => {
  it('summarises what generation would produce for an attribute nobody authored', async () => {
    renderCodebook(FIXTURE_DOCUMENT);

    // The disclosure's accessible name opens with the attribute's own name and
    // continues with the RESOLVED values — the window here comes from the
    // attribute's declared validation, so this cannot be a hardcoded default.
    expect(
      await screen.findByRole('button', {
        name: disclosureFor('age', /uniform\(min 18, max 90\)/),
      }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('summarises an authored attribute as the author wrote it', async () => {
    renderCodebook(FIXTURE_DOCUMENT);

    expect(
      await screen.findByRole('button', {
        name: disclosureFor(
          'trust',
          /normal\(mean 0\.5, sd 0\.2\), missing 10%/,
        ),
      }),
    ).toBeVisible();
  });

  it('states an interface-implied rule as a whole sentence', async () => {
    renderCodebook(FIXTURE_DOCUMENT);

    expect(
      await screen.findByText(
        'Always answered: “Quick add friends” cannot leave this attribute blank.',
      ),
    ).toBeVisible();
  });

  it('says so rather than leaving an empty cell where nothing is generated', async () => {
    renderCodebook(FIXTURE_DOCUMENT);

    // `personLayout`: generation derives a position rather than drawing a
    // value, so there is no summary and nothing to author — which the row says
    // instead of showing a blank.
    expect(
      await screen.findByText(
        'Nothing is generated for this attribute — its values are derived rather than drawn.',
      ),
    ).toBeVisible();
    // And only there: every other attribute in the fixture has a sub-editor.
    expect(
      screen.getAllByText(
        'Nothing is generated for this attribute — its values are derived rather than drawn.',
      ),
    ).toHaveLength(1);
  });
});

describe('editing in the table', () => {
  it('authors option weights and saves them into the protocol', async () => {
    const store = renderCodebook(FIXTURE_DOCUMENT);

    expect(savedVariable(store, FRIEND_STRENGTH).synthetic).toBeUndefined();

    fireEvent.click(
      await screen.findByRole('button', {
        name: disclosureFor('strength', /options drawn evenly/),
      }),
    );
    const commit = (option: string, value: string) => {
      const box = screen.getByRole('spinbutton', {
        name: `Weight for ${option}`,
      });
      fireEvent.change(box, { target: { value } });
      fireEvent.blur(box);
    };
    commit('1', '1');
    commit('2', '4');

    // Keyed by the option's own VALUE, in the variable's `synthetic` block
    // rather than on the option objects — exactly as the type editor writes it.
    await waitFor(() => {
      expect(savedVariable(store, FRIEND_STRENGTH).synthetic).toEqual({
        optionWeights: [
          { value: 1, weight: 1 },
          { value: 2, weight: 4 },
        ],
      });
    });
    // The summary is resolved from the block that was just saved, so it moves
    // with it — a summary that stayed put would be describing a stale parse.
    expect(
      screen.getByRole('button', {
        name: disclosureFor('strength', /options drawn by weight/),
      }),
    ).toBeVisible();
  });

  it('authors an EGO attribute, which has no entity-type editor of its own', async () => {
    // A node or edge attribute is also reachable through the type editor its
    // entity type opens; ego has no entity type and no such editor, so this
    // table is the whole of ego's synthetic authoring — and it has to write
    // through to the same place (spec revision 2, item 6).
    const store = renderCodebook(FIXTURE_DOCUMENT);

    fireEvent.click(
      await screen.findByRole('button', {
        name: disclosureFor('egoAge', /constant/),
      }),
    );

    const missing = screen.getByRole('spinbutton', {
      name: 'Chance of no answer',
    });
    fireEvent.change(missing, { target: { value: '0.25' } });
    fireEvent.blur(missing);

    await waitFor(() => {
      expect(savedVariable(store, EGO_AGE).synthetic).toEqual({
        distribution: 'constant',
        value: 40,
        missingProbability: 0.25,
      });
    });
  });

  it('resets an authored attribute back to the schema default', async () => {
    const store = renderCodebook(FIXTURE_DOCUMENT);

    expect(savedVariable(store, PERSON_TRUST).synthetic).toBeDefined();

    // The reset affordance renders beside the collapsed row while the block is
    // authored, named by its own label plus the attribute it belongs to.
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reset to default trust' }),
    );

    await waitFor(() => {
      expect(savedVariable(store, PERSON_TRUST)).not.toHaveProperty(
        'synthetic',
      );
    });
    // Not merely emptied: a `synthetic: {}` would be a key the schema refuses,
    // and would read as authored to every surface that asks (spec rule 4).
    expect(Object.keys(savedVariable(store, PERSON_TRUST))).not.toContain(
      'synthetic',
    );
  });
});

describe('opening the codebook at an attribute', () => {
  it("opens that attribute's generation settings", async () => {
    renderCodebook(
      FIXTURE_DOCUMENT,
      codebookHref({ entity: 'node', type: 'person' }, 'personContact'),
    );

    const targeted = await screen.findByRole('button', {
      name: disclosureFor('contactType', /1 selection/),
    });
    await waitFor(() => {
      expect(targeted).toHaveAttribute('aria-expanded', 'true');
    });
    // Only the attribute the link named: every other row is still collapsed,
    // so this is the link's doing rather than a screen that opens everything.
    expect(
      screen.getByRole('button', {
        name: disclosureFor('age', /uniform/),
      }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('leaves every row collapsed when the link names no attribute', async () => {
    renderCodebook(FIXTURE_DOCUMENT, '/protocol/codebook');

    const contact = await screen.findByRole('button', {
      name: disclosureFor('contactType', /1 selection/),
    });
    expect(contact).toHaveAttribute('aria-expanded', 'false');
  });
});
