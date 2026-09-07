import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { defineMessage } from '@codaco/app-i18n/messages';

import { localeLeaks } from '../../testing/localeSweep.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import PromptsSection from '../PromptsSection.tsx';
import { TestPromptEditor, TestPromptPreview } from './rowFixtures.tsx';

/**
 * A sentence a family might reasonably write for its own prompts, and which
 * the section it hands it to will never supply a value for.
 *
 * Declared outside `defineMessages` on purpose: this is a fixture, and an id
 * under `protocolBuilder.*` would put a message in the namespace that no
 * translator can find. `collectSourceFiles` skips `__tests__`, so extraction
 * never sees it either.
 */
const NEEDS_A_VALUE = defineMessage({
  id: 'fixture.needsAValue',
  defaultMessage: 'Ask about {relative} in this order.',
  description: 'Fixture: a section sentence that carries an argument.',
});

/**
 * The four sentences `PromptsSection` takes — and the equivalents on
 * `FormFieldsSection`, `PageContentSection`, `SubjectSection` and
 * `SectionCapability.confirmClear` — are `MessageDescriptor`s the section
 * formats with NO VALUES.
 *
 * The rule is not expressible in the type system, and this is where that is
 * recorded rather than in a comment nobody re-derives. `extractMessages` only
 * sees `defineMessages`/`defineMessage` calls, and both widen `defaultMessage`
 * to `string` — the literal is gone by the time a prop type could read it, and
 * a `const`-generic helper that kept it would put every section sentence
 * beyond extraction, which is a strictly worse defect than the one it guards.
 *
 * So this test is the guard: it pins what a section actually DOES with such a
 * descriptor (renders the pattern, braces and all), proves react-intl reports
 * it rather than swallowing it, and proves the locale sweep sees it — which is
 * what makes the same mistake fail on any surface a sweep covers.
 */
describe('a named descriptor prop that needs a value', () => {
  it('renders its pattern, and says so through react-intl’s own reporter', async () => {
    // `makeOnError` restores react-intl's default reporting when no host
    // handler is configured, and the harness mounts no provider without a
    // locale — so the console IS the report, and this reads it.
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderStageEditor({
      stageId: 'name-generator-1',
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
          requiresSubject={false}
          description={NEEDS_A_VALUE}
        />
      ),
    });

    await waitFor(() =>
      expect(
        screen.getByText('Ask about {relative} in this order.'),
      ).toBeInTheDocument(),
    );

    expect(
      reported.mock.calls.some(([error]) =>
        String(
          (error as { code?: string; message?: string })?.message,
        ).includes('fixture.needsAValue'),
      ),
      'react-intl reported the unformatted message',
    ).toBe(true);

    // And it is visible to the sweep, which is what turns this from a fact
    // about one prop into a rule enforced across every swept surface.
    expect(localeLeaks()).toContain(
      'unformatted placeholder: Ask about {relative} in this order.',
    );

    reported.mockRestore();
  });
});
