import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { defineMessage } from '@codaco/app-i18n/messages';

import { localeLeaks } from '../../testing/localeSweep.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import BuilderSection from '../BuilderSection.tsx';
import FormFieldsSection from '../FormFieldsSection.tsx';
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
 * Every prop through which a family hands a shared section one of its own
 * sentences.
 *
 * THREE surfaces, not five. `SubjectSection` and `PageContentSection` are
 * named alongside these in the same rule, and take no such prop: their
 * sentences are chosen from a table inside the section, keyed on the entity or
 * the variant. The rule still holds for them — a placeholder in one of those
 * tables renders the same way — but what would break it there is an edit to
 * this package's own catalog, which the locale sweep's unformatted-placeholder
 * check sees on every surface it mounts. What only a test can reach is the
 * seam: a descriptor arriving from OUTSIDE, from a family this package's
 * catalogs know nothing about.
 *
 * `SectionCapability.confirmClear` is a prop of `BuilderSection` rather than
 * of one named section, so it is exercised where it is declared.
 */
const SURFACES: readonly Readonly<{
  name: string;
  stageId: string;
  sections: ReactNode;
  /** Reaches the state that renders the sentence, where it is not at rest. */
  open?: (harness: StageEditorHarness) => Promise<void>;
}>[] = [
  {
    name: 'PromptsSection description',
    stageId: 'name-generator-1',
    sections: (
      <PromptsSection
        PromptEditor={TestPromptEditor}
        PromptPreview={TestPromptPreview}
        requiresSubject={false}
        description={NEEDS_A_VALUE}
      />
    ),
  },
  {
    name: 'FormFieldsSection description',
    stageId: 'alter-form-1',
    sections: <FormFieldsSection subject="node" description={NEEDS_A_VALUE} />,
  },
  {
    name: 'SectionCapability confirmClear',
    stageId: 'name-generator-1',
    // `form` is populated on this stage, so the capability opens switched ON
    // and the switch below is a switch-OFF — which is the only state that puts
    // these three sentences on screen.
    sections: (
      <BuilderSection
        title="Add a person"
        description="A capability with a family’s own confirmation."
        capability={{
          fields: ['form'],
          confirmClear: {
            title: NEEDS_A_VALUE,
            description: NEEDS_A_VALUE,
            confirmLabel: NEEDS_A_VALUE,
          },
        }}
      >
        <span>Nothing to configure.</span>
      </BuilderSection>
    ),
    open: async (harness) => {
      await harness.user.click(
        await screen.findByRole('switch', { name: 'Add a person' }),
      );
    },
  },
];

/**
 * The sentences a shared section takes from a family are
 * `MessageDescriptor`s the section formats with NO VALUES.
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
 *
 * Read on every seam rather than on one, because the mistake is per-prop: a
 * new section taking a descriptor it formats WITH a value would be caught by
 * nothing a single-family example says.
 */
describe('a named descriptor prop that needs a value', () => {
  it.each(SURFACES)(
    'renders its pattern through $name, and says so through react-intl’s own reporter',
    async ({ stageId, sections, open }) => {
      // `makeOnError` restores react-intl's default reporting when no host
      // handler is configured, and the harness mounts no provider without a
      // locale — so the console IS the report, and this reads it.
      const reported = vi.spyOn(console, 'error').mockImplementation(() => {});

      const harness = renderStageEditor({ stageId, sections });
      await open?.(harness);

      await waitFor(() =>
        expect(
          screen.getAllByText('Ask about {relative} in this order.').length,
        ).toBeGreaterThan(0),
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
    },
  );
});
