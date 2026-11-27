import { act, screen, waitFor } from '@testing-library/react';
import { NodeSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';

import { setLogicBlock } from '../richText/logicBlockNode';
import {
  branch,
  doc,
  field,
  json,
  logic,
  paragraph,
  renderSections,
  text,
} from './sectionEditor';

const IF_ELSE = { kind: 'conditions' };

describe('a logic block', () => {
  it('is put in by the insert tools with one empty branch for each case, selected', async () => {
    const view = renderSections({ value: doc(paragraph(text('Intro'))) });
    const editor = await view.editor();
    act(() => {
      editor.commands.setTextSelection(3);
    });

    let element: HTMLElement | null = null;
    act(() => {
      element = view.commands().insertLogicBlock(IF_ELSE, [
        { key: 'if', meta: { condition: 'c1' } },
        { key: 'otherwise', meta: null },
      ]);
    });

    expect(element).toBeInstanceOf(HTMLElement);
    expect(json(editor)).toEqual(
      doc(
        paragraph(text('Intro')),
        logic(
          IF_ELSE,
          {
            type: 'logicBranch',
            attrs: { key: 'if', meta: { condition: 'c1' } },
            content: [paragraph()],
          },
          branch('otherwise'),
        ),
        paragraph(),
      ),
    );
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  });

  it('draws its branches with the consumer’s labels, and says what an empty branch shows', async () => {
    const view = renderSections({
      value: doc(
        logic(
          IF_ELSE,
          branch('if', paragraph(text('Your work'))),
          branch('otherwise'),
        ),
      ),
    });
    const textbox = await view.textbox();

    const labels = [
      ...textbox.querySelectorAll('[data-testid="branch-label"]'),
    ].map((label) => label.textContent);
    expect(labels).toEqual(['if', 'otherwise']);
    const empty = textbox.querySelector(
      '[data-logic-branch-view][data-key="otherwise"]',
    );
    expect(empty).toHaveAttribute('data-empty');
    expect(empty?.querySelector('p')).toHaveAttribute(
      'data-placeholder',
      'Nothing is shown.',
    );
    expect(
      textbox
        .querySelector('[data-logic-branch-view][data-key="if"] p')
        ?.hasAttribute('data-placeholder'),
    ).toBe(false);
  });

  it('holds any blocks in its branches, fields and other logic blocks included', async () => {
    const nested = doc(
      logic(
        IF_ELSE,
        branch(
          'if',
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [text('Your work')],
          },
          field('f1', 'employer', 'Who is your employer?'),
          logic(
            { kind: 'answers' },
            branch('missing'),
            branch('other', field('f2', 'hours', 'How many hours?')),
          ),
        ),
        branch('otherwise', paragraph(text('Thank you.'))),
      ),
    );
    const view = renderSections({ value: nested });
    const editor = await view.editor();

    expect(json(editor)).toEqual(nested);
  });

  it('changes its branches in one undoable edit, keeping the content of those it keeps', async () => {
    const view = renderSections({
      value: doc(
        logic(
          IF_ELSE,
          branch('if', paragraph(text('Shown if'))),
          branch('otherwise', paragraph(text('Shown otherwise'))),
        ),
      ),
    });
    const editor = await view.editor();

    act(() => {
      setLogicBlock(editor, 0, { kind: 'answers' }, [
        { key: 'missing', meta: null },
        { key: 'if', meta: { renamed: true } },
      ]);
    });
    expect(json(editor)).toEqual(
      doc(
        logic({ kind: 'answers' }, branch('missing'), {
          type: 'logicBranch',
          attrs: { key: 'if', meta: { renamed: true } },
          content: [paragraph(text('Shown if'))],
        }),
      ),
    );

    act(() => {
      editor.commands.undo();
    });
    expect(json(editor)).toEqual(
      doc(
        logic(
          IF_ELSE,
          branch('if', paragraph(text('Shown if'))),
          branch('otherwise', paragraph(text('Shown otherwise'))),
        ),
      ),
    );
  });

  it('cannot stand inside a list item, a heading or a paragraph', async () => {
    const view = renderSections();
    const editor = await view.editor();
    const { nodes } = editor.schema;
    const blockType = nodes.logicBlock;
    const fieldType = nodes.fieldBlock;
    if (blockType === undefined || fieldType === undefined) {
      throw new Error('no sections');
    }

    for (const container of ['listItem', 'heading', 'paragraph']) {
      const match = nodes[container]?.contentMatch;
      expect(match?.matchType(blockType) ?? null, container).toBe(null);
      expect(match?.matchType(fieldType) ?? null, container).toBe(null);
    }
    expect(nodes.logicBranch?.contentMatch.matchType(fieldType)).not.toBe(null);
    expect(
      editor.schema.topNodeType.contentMatch.matchType(blockType),
    ).not.toBe(null);
  });
});

describe('the branches of a logic block that show something', () => {
  it('are read from the document as it is now', async () => {
    const view = renderSections({
      value: doc(
        logic(
          IF_ELSE,
          branch('if', paragraph(text('Shown if'))),
          branch('otherwise'),
          branch('missing', field('in', 'a')),
        ),
      ),
    });
    const editor = await view.editor();
    const withContent = () =>
      JSON.parse(
        screen.getByTestId('logic').dataset.branchesWithContent ?? 'null',
      ) as unknown;

    await waitFor(() => expect(withContent()).toEqual(['if', 'missing']));

    act(() => {
      setLogicBlock(editor, 0, IF_ELSE, [
        { key: 'otherwise', meta: null },
        { key: 'missing', meta: null },
      ]);
    });
    await waitFor(() => expect(withContent()).toEqual(['missing']));
  });
});

describe('the fields that a logic block sees', () => {
  it('are told apart by whether they are inside the block, in another version of a block around it, or elsewhere', async () => {
    const inner = logic(
      { kind: 'inner' },
      branch('if', field('in1', 'a')),
      branch(
        'otherwise',
        paragraph(),
        logic({ kind: 'deepest' }, branch('if', field('in2', 'b'))),
      ),
    );
    renderSections({
      value: doc(
        field('before', 'c'),
        logic(
          { kind: 'outer' },
          branch('if', paragraph(text('Shown')), inner),
          branch('otherwise', field('other', 'd')),
        ),
        field('after', 'e'),
      ),
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('logic')).toHaveLength(3);
    });
    const scopeOf = (kind: string) => {
      const view = screen
        .getAllByTestId('logic')
        .find((element) => element.dataset.meta === JSON.stringify({ kind }));
      return JSON.parse(view?.dataset.fieldScope ?? 'null') as unknown;
    };
    expect(scopeOf('outer')).toEqual({
      inside: ['in1', 'in2', 'other'],
      otherVersions: [],
      outside: ['before', 'after'],
    });
    expect(scopeOf('inner')).toEqual({
      inside: ['in1', 'in2'],
      otherVersions: ['other'],
      outside: ['before', 'after'],
    });
    // The nearest block's other version first, then the outer block's.
    expect(scopeOf('deepest')).toEqual({
      inside: ['in2'],
      otherVersions: ['in1', 'other'],
      outside: ['before', 'after'],
    });
  });
});
