import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { MarkdownBlockImages } from '@codaco/fresco-ui/RenderMarkdown';
import {
  ConditionsSchema,
  createProtocolObjectId,
  dynamicValueNameFor,
  fieldBlockMarkdown,
  optionCaseKey,
  type Stage,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { testId, testVariableId } from '../../__tests__/testIds';
import {
  DynamicValueEntity,
  StageDynamicValues,
} from '../../dynamicValues/DynamicValueScope';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import { ContentDocument } from '../ContentDocument';

const STATUS = testVariableId('status');
const AGE = testVariableId('age');
const EMPLOYED = testId('option employed');
const STUDENT = testId('option student');
const ADULT = testId('condition adult');
const EMPLOYER_FIELD = testId('field employer');
const NOTES_FIELD = testId('field notes');
const SCHOOL_FIELD = testId('field school');

const status = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: STATUS,
});
const adult = dynamicValueNameFor({ kind: 'condition', conditionId: ADULT });

const stage = {
  id: testId('stage'),
  type: 'Information',
  label: { en: 'About you' },
  content: { en: 'Unused' },
  conditions: ConditionsSchema.parse({
    [ADULT]: {
      rules: [
        {
          type: 'ego',
          id: createProtocolObjectId(),
          options: {
            attribute: AGE,
            operator: 'GREATER_THAN_OR_EQUAL',
            value: 18,
          },
        },
      ],
    },
  }),
} as unknown as Stage;

const store = () =>
  configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: [],
          edges: [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
        codebook: {
          node: {},
          edge: {},
          ego: {
            variables: {
              [STATUS]: {
                name: 'status',
                type: 'categorical',
                options: [
                  {
                    id: EMPLOYED,
                    value: 'employed',
                    label: { en: 'Employed' },
                  },
                  { id: STUDENT, value: 'student', label: { en: 'Student' } },
                ],
              },
              [AGE]: { name: 'age', type: 'number' },
            },
          },
        },
        stages: [stage],
      } as never,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });

/** `content` with the participant's answers as `ego`. */
function Scope({
  ego,
  children,
}: {
  ego: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <DynamicValueEntity attributes={{ ego }}>{children}</DynamicValueEntity>
  );
}

const renderDocument = (
  message: string,
  ego: Record<string, unknown>,
  extra: {
    blockImages?: MarkdownBlockImages;
    renderField?: (id: string) => ReactNode;
  } = {},
) => {
  const reduxStore = store();
  const tree = (answers: Record<string, unknown>) => (
    <TestProtocolLocalization>
      <Provider store={reduxStore}>
        <StageDynamicValues stage={stage}>
          <Scope ego={answers}>
            <ContentDocument
              value={{ en: message }}
              allowedElements={['h1', 'p', 'em', 'strong', 'a']}
              {...(extra.blockImages !== undefined && {
                blockImages: extra.blockImages,
              })}
              {...(extra.renderField !== undefined && {
                renderField: extra.renderField,
              })}
            />
          </Scope>
        </StageDynamicValues>
      </Provider>
    </TestProtocolLocalization>
  );
  const rendered = render(tree(ego));
  return {
    ...rendered,
    answer: (answers: Record<string, unknown>) =>
      rendered.rerender(tree(answers)),
  };
};

const fieldInput = (id: string) => (
  <input aria-label={`field ${id}`} data-field-id={id} />
);

describe('ContentDocument', () => {
  it('shows the version of a logic block that the answers choose, read again as they change', () => {
    const message = [
      '# About you',
      `{${status}, select, missing {Tell us what you do.} ${optionCaseKey(EMPLOYED)} {Tell us about your work.} other {Tell us about your days.}}`,
    ].join('\n\n');
    const { answer } = renderDocument(message, {});

    expect(screen.getByRole('heading', { name: 'About you' })).toBeVisible();
    expect(screen.getByText('Tell us what you do.')).toBeVisible();

    answer({ [STATUS]: ['employed'] });
    expect(screen.getByText('Tell us about your work.')).toBeVisible();
    expect(screen.queryByText('Tell us what you do.')).toBeNull();

    answer({ [STATUS]: ['student'] });
    expect(screen.getByText('Tell us about your days.')).toBeVisible();
  });

  it('places the fields of the version shown, and no others', () => {
    const message = [
      `{${status}, select, missing {} ${optionCaseKey(EMPLOYED)} {${fieldBlockMarkdown(EMPLOYER_FIELD)}} other {${fieldBlockMarkdown(SCHOOL_FIELD)}}}`,
      fieldBlockMarkdown(NOTES_FIELD),
    ].join('\n\n');
    const { answer } = renderDocument(message, {}, { renderField: fieldInput });

    const shown = () =>
      screen
        .queryAllByRole('textbox')
        .map((input) => input.getAttribute('data-field-id'));
    expect(shown()).toEqual([NOTES_FIELD]);

    answer({ [STATUS]: ['employed'] });
    expect(shown()).toEqual([EMPLOYER_FIELD, NOTES_FIELD]);

    answer({ [STATUS]: ['student'] });
    expect(shown()).toEqual([SCHOOL_FIELD, NOTES_FIELD]);
  });

  it('keeps a field, and what is typed in it, when a logic block before it shows another version', () => {
    const message = [
      `{${adult}, select, true {Grown up.\n\n${fieldBlockMarkdown(SCHOOL_FIELD)}} other {Young.}}`,
      fieldBlockMarkdown(NOTES_FIELD),
    ].join('\n\n');
    const { answer } = renderDocument(
      message,
      { [AGE]: 12 },
      { renderField: fieldInput },
    );
    const input = screen.getByRole('textbox', {
      name: `field ${NOTES_FIELD}`,
    });
    act(() => {
      input.focus();
    });
    (input as HTMLInputElement).value = 'typed';

    answer({ [AGE]: 40 });
    expect(screen.getByText('Grown up.')).toBeVisible();
    // A field now comes before it, and it is the same element: not drawn
    // again, so its text and focus stay.
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: `field ${NOTES_FIELD}` })).toBe(
      input,
    );
    expect(input).toHaveValue('typed');
    expect(input).toHaveFocus();
  });

  it('reads logic blocks inside the versions of a logic block', () => {
    const message = `{${adult}, select, true {Grown up.\n\n{${status}, select, missing {} ${optionCaseKey(EMPLOYED)} {And working.} other {}}} other {Young.}}`;
    const { answer } = renderDocument(message, { [AGE]: 40 });
    expect(screen.getByText('Grown up.')).toBeVisible();
    expect(screen.queryByText('And working.')).toBeNull();

    answer({ [AGE]: 40, [STATUS]: ['employed'] });
    expect(screen.getByText('And working.')).toBeVisible();

    answer({ [AGE]: 9, [STATUS]: ['employed'] });
    expect(screen.getByText('Young.')).toBeVisible();
    expect(screen.queryByText('And working.')).toBeNull();
  });

  it('shows the number where a version of a number block has `#`, formatted for the language', () => {
    const age = dynamicValueNameFor({
      kind: 'attribute',
      role: 'ego',
      variableId: AGE,
    });
    // A quoted `#` is text, and so is one in a logic block inside the
    // version, as ICU reads a `#` in a select inside a plural.
    const message = `{${age}, select, missing {No age.} other {{${age}, plural, one {# year: '#'1} other {# years.\n\n{${status}, select, missing {Unknown, #.} other {Known.}}}}}}`;
    const { answer, container } = renderDocument(message, { [AGE]: 1 });
    const paragraphs = () =>
      [...container.querySelectorAll('p')].map((p) => p.textContent);
    expect(paragraphs()).toEqual(['1 year: #1']);

    answer({ [AGE]: 1200 });
    expect(paragraphs()).toEqual(['1,200 years.', 'Unknown, #.']);
    // Never a heading, which `#` at the start of a line would be.
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('shows an asset block inside the version of a logic block that is shown', () => {
    const blockImages: MarkdownBlockImages = {
      matches: (url) => url.startsWith('asset:'),
      Block: ({ url }) => <figure aria-label={`asset ${url}`} />,
    };
    const message = `{${adult}, select, true {Watch this.\n\n![](asset:video)} other {Nothing to watch.}}`;
    const { answer } = renderDocument(message, { [AGE]: 9 }, { blockImages });
    expect(screen.queryByRole('figure')).toBeNull();

    answer({ [AGE]: 40 });
    expect(
      screen.getByRole('figure', { name: 'asset asset:video' }),
    ).toBeVisible();
  });

  it('tells screen reader users when the answers show or hide questions', () => {
    const message = `{${status}, select, missing {} ${optionCaseKey(EMPLOYED)} {${fieldBlockMarkdown(EMPLOYER_FIELD)}} other {}}`;
    const { answer } = renderDocument(message, {}, { renderField: fieldInput });
    const announcement = screen.getByRole('status');
    expect(announcement).toHaveTextContent('');

    answer({ [STATUS]: ['employed'] });
    expect(announcement).toHaveTextContent('A new question is shown.');

    answer({ [STATUS]: ['student'] });
    expect(announcement).toHaveTextContent('A question is no longer shown.');
  });

  it('announces each question shown, even when two in a row are announced alike', async () => {
    const message = [
      `{${status}, select, missing {} ${optionCaseKey(EMPLOYED)} {${fieldBlockMarkdown(EMPLOYER_FIELD)}} other {}}`,
      `{${adult}, select, true {${fieldBlockMarkdown(SCHOOL_FIELD)}} other {}}`,
    ].join('\n\n');
    const { answer } = renderDocument(message, {}, { renderField: fieldInput });
    const announcement = screen.getByRole('status');
    // A status region reads out what is added to it.
    const additions: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          additions.push(node.textContent ?? '');
        }
      }
    });
    observer.observe(announcement, { childList: true, subtree: true });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    answer({ [STATUS]: ['employed'] });
    await flush();
    answer({ [STATUS]: ['employed'], [AGE]: 30 });
    await flush();
    observer.disconnect();

    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(additions).toEqual([
      'A new question is shown.',
      'A new question is shown.',
    ]);
  });

  it('announces nothing when the language changes the questions shown', () => {
    const english = `{${status}, select, missing {} other {}}\n\n${fieldBlockMarkdown(NOTES_FIELD)}`;
    const spanish = `${english}\n\n${fieldBlockMarkdown(SCHOOL_FIELD)}`;
    const reduxStore = store();
    const tree = (locale: string) => (
      <TestProtocolLocalization
        localization={{ defaultLocale: 'en', locales: ['en', 'es'] }}
        locale={locale}
      >
        <Provider store={reduxStore}>
          <StageDynamicValues stage={stage}>
            <ContentDocument
              value={{ en: english, es: spanish }}
              renderField={fieldInput}
            />
          </StageDynamicValues>
        </Provider>
      </TestProtocolLocalization>
    );
    const { rerender } = render(tree('en'));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    rerender(tree('es'));

    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('finds a link’s reference definition in another run of the document', () => {
    const message = [
      'Read [the study’s page][page] first.',
      fieldBlockMarkdown(NOTES_FIELD),
      `{${status}, select, missing {} other {See [our page][page] again.}}`,
      '[page]: https://example.com/study',
    ].join('\n\n');
    renderDocument(
      message,
      { [STATUS]: ['employed'] },
      { renderField: fieldInput },
    );

    expect(
      screen.getByRole('link', { name: 'the study’s page' }),
    ).toHaveAttribute('href', 'https://example.com/study');
    expect(screen.getByRole('link', { name: 'our page' })).toHaveAttribute(
      'href',
      'https://example.com/study',
    );
    expect(screen.queryByText(/\[page\]/)).toBeNull();
  });

  it('has no status message for a document without logic', () => {
    renderDocument(
      fieldBlockMarkdown(NOTES_FIELD),
      {},
      { renderField: fieldInput },
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});
