import { composeStories, type Decorator } from '@storybook/react-vite';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';

import { initialGlobals, withAppI18n } from '../../.storybook/i18n.ts';
import { censusAndBinStageEditors } from '../editors/censusAndBinStageEditors.ts';
import { formStageEditors } from '../editors/formStageEditors.ts';
import { nameGeneratorStageEditors } from '../editors/nameGeneratorStageEditors.ts';
import { networkStageEditors } from '../editors/networkStageEditors.ts';
import { pedigreeAndAnonymisationStageEditors } from '../editors/pedigreeAndAnonymisationStageEditors.ts';
import { STAGE_TYPES } from '../stage-types.ts';
import * as dispatcherStories from '../StageEditor.stories.tsx';

const composed = composeStories(dispatcherStories);

/** Every family, by the name a reader of the registry would call it. */
const FAMILIES: Readonly<Record<string, Partial<Record<StageType, unknown>>>> =
  {
    censusAndBin: censusAndBinStageEditors,
    form: formStageEditors,
    nameGenerator: nameGeneratorStageEditors,
    network: networkStageEditors,
    pedigreeAndAnonymisation: pedigreeAndAnonymisationStageEditors,
  };

const familyClaiming = (stageType: StageType): string => {
  const family = Object.entries(FAMILIES).find(
    ([, part]) => part[stageType] !== undefined,
  );
  if (family === undefined) {
    throw new Error(`No family claims "${stageType}".`);
  }
  return family[0];
};

/**
 * The story context the language decorator reads: `globals`, and nothing else.
 *
 * Cast rather than constructed, for the reason `storybookLocaleSwitcher.test`
 * gives — `StoryContext` is Storybook's whole render record, and building a
 * plausible one would assert a shape this decorator never touches.
 */
type DecoratorContext = Parameters<Decorator>[1];

const inLocale = (appLocale: string): DecoratorContext =>
  ({
    globals: { ...initialGlobals, appLocale },
  }) as unknown as DecoratorContext;

describe('the dispatcher’s stories', () => {
  /**
   * One per editor family, and every family. Derived from the parts rather
   * than from a list beside the stories, so a sixth family arriving with no
   * story of its own fails here — the dispatcher's page is the only one in the
   * Storybook that is about the composition rather than about one editor, and
   * a family missing from it is a family nobody looks at through it.
   */
  it('open on one interface from each editor family', () => {
    const defaults = Object.values(composed).map(
      (story) => story.args.type as StageType,
    );

    expect(defaults.map(familyClaiming).toSorted()).toEqual(
      Object.keys(FAMILIES).toSorted(),
    );
  });

  /**
   * And the control reaches the rest. Read out of the story's own `argTypes`,
   * because that is what a reviewer's dropdown is built from: a control listing
   * some of the interfaces would leave the others with no page in this
   * Storybook that opens them through the dispatcher at all.
   */
  it('offer every interface in the schema on the type control', () => {
    expect(dispatcherStories.default.argTypes.type.options?.toSorted()).toEqual(
      [...STAGE_TYPES].toSorted(),
    );
  });

  /**
   * Each story, mounted and played, because Storybook builds a story that
   * throws on mount just as happily as one that works and nothing in this
   * package's gates opens the built pages.
   */
  it.each(Object.entries(composed))(
    'render and play %s',
    async (name, Story) => {
      const { container } = render(<Story />);
      const { play } = Story;

      // Thrown rather than skipped: a story with no play is a page nothing
      // checks, and this sweep would report it as passing.
      if (play === undefined) {
        throw new Error(
          `The ${name} story has no play, so nothing here reads its page.`,
        );
      }
      await play({ canvasElement: container });
    },
  );

  /**
   * The switcher, over the DISPATCHED editor.
   *
   * `useAppIntl()` renders English `defaultMessage`s with no provider mounted,
   * so every story here reads correctly in English whether the wiring works or
   * not — which is why the Spanish half is the assertion that matters. What it
   * proves is specific to this page: the editor the registry chose is inside
   * the language the toolbar set, rather than mounted beside it by a host that
   * reached for the component itself.
   *
   * Three layers deep, because that is where a dispatched editor's copy comes
   * from: the shared stage heading, the interface's own researcher-facing
   * name, and the link the named editor points at its documentation.
   */
  it('render the editor the registry chose in the toolbar’s language', () => {
    const Forms = composed.Forms;
    const Spanish = () => withAppI18n(() => <Forms />, inLocale('es'));

    render(<Spanish />);

    expect(
      screen.getByRole('textbox', { name: 'Nombre de la etapa' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Información')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Documentación' }),
    ).toBeInTheDocument();
  });
});
