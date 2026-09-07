import type { Decorator } from '@storybook/react-vite';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import {
  globalTypes,
  initialGlobals,
  withAppI18n,
} from '../../.storybook/i18n.ts';
import { DEFAULT_ITEM_LABEL } from '../form/arrayFields/arrayMessages.ts';

/**
 * The Storybook language control, proved where it can fail cheaply.
 *
 * `useAppIntl()` renders English `defaultMessage`s with no provider mounted,
 * so a decorator that silently did nothing — a global read under the wrong
 * key, a catalog map keyed on the wrong tag, an `AppI18nProvider` handed
 * `undefined` — would leave every story looking exactly as it does now. That
 * is why the Spanish half is the assertion that matters: English is what the
 * package renders whether the switcher works or not.
 *
 * Three layers of the merge are read, because a host merges three and each is
 * a separate way to get it wrong: the package's own `protocolBuilder.*`, the
 * `common.*` verbs it imports rather than redefining, and the `frescoUi.*`
 * copy a shared control says on a section's behalf.
 */

/**
 * The story context the decorator actually reads: `globals`, and nothing else.
 *
 * Cast rather than constructed, because `StoryContext` is Storybook's whole
 * render record — args, argTypes, parameters, the loaded story, the canvas —
 * and building a plausible one would assert a shape this decorator never
 * touches. If it grows a second field it reads, this test fails at that field
 * being `undefined`, which is the failure worth having.
 */
type DecoratorContext = Parameters<Decorator>[1];

const contextWith = (appLocale: string): DecoratorContext =>
  ({
    globals: { ...initialGlobals, appLocale },
  }) as unknown as DecoratorContext;

/** One string from each of the three catalogs a host merges. */
function ThreeCatalogs() {
  const intl = useAppIntl();
  return (
    <>
      <p>{intl.formatMessage(DEFAULT_ITEM_LABEL)}</p>
      <p>{intl.formatMessage(commonMessages.cancel)}</p>
      <UnconnectedField
        name="probe"
        // A label with no words of its own, so the only English or Spanish on
        // screen from this control is the required marker fresco-ui adds.
        label="—"
        required
        component={InputField}
      />
    </>
  );
}

function renderIn(appLocale: string) {
  const Decorated = () => withAppI18n(ThreeCatalogs, contextWith(appLocale));
  render(<Decorated />);
}

/** Only the shape of the toolbar entry this file is responsible for filling. */
type ToolbarGlobal = Readonly<{
  toolbar: Readonly<{ items: readonly Readonly<{ value: string }>[] }>;
}>;

describe('the Storybook language control', () => {
  it('offers every ecosystem locale, and the pseudo-locale', () => {
    // The registry is `ecosystemLocales` rather than the two tags this
    // package happens to translate today, for the reason fresco-ui gives:
    // `protocolBuilder.*` has to be complete for every locale an app ships,
    // so the Storybook that reviews it offers exactly that set. `en-XA` is
    // how a string with no descriptor is spotted before any translation of
    // it exists.
    const offered = (globalTypes.appLocale as ToolbarGlobal).toolbar.items.map(
      (item) => item.value,
    );

    expect(offered).toEqual(['en', 'en-GB', 'es', 'en-XA']);
  });

  it('opens on the source locale, so every existing play and capture is unchanged', () => {
    // The stories were written against the provider-less English fallback and
    // are captured by Chromatic in it. Any other default would rewrite all of
    // them at once, and the rewrite would look like a translation regression.
    expect(initialGlobals.appLocale).toBe('en');
  });

  it('renders the English defaults on that default', () => {
    renderIn(initialGlobals.appLocale);

    expect(screen.getByText('item')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('renders Spanish from all three merged catalogs when the toolbar says es', () => {
    renderIn('es');

    expect(screen.getByText('elemento')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
    expect(screen.getByText('Obligatorio')).toBeInTheDocument();
  });

  it('declares the selected locale on the document, the way a host does', () => {
    // `lang` is what a screen reader switches voice on, and the a11y addon
    // runs `html-has-lang` against this Storybook with `test: 'error'`. A
    // decorator that swapped the copy and left the document in English would
    // be a story no assistive technology could read correctly.
    renderIn('es');

    expect(document.documentElement.lang).toBe('es');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
