import { composeStories } from '@storybook/react-vite';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { EnclosingHeadingLevel } from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import * as entityEditorStories from '../codebook/components/CodebookEntityEditor.stories.tsx';
import CodebookEntityEditor from '../codebook/components/CodebookEntityEditor.tsx';
import * as variableEditorStories from '../codebook/components/VariableEditor.stories.tsx';
import VariableEditor from '../codebook/components/VariableEditor.tsx';
import * as validationEditorStories from '../codebook/validation/CodebookVariableValidationEditor.stories.tsx';
import CodebookVariableValidationEditor from '../codebook/validation/CodebookVariableValidationEditor.tsx';
import type { CodebookWriteOutcome } from '../codebook/writes.ts';
import * as alterEdgeFormStories from '../editors/alter-edge-form/AlterEdgeFormStageEditor.stories.tsx';
import * as alterFormStories from '../editors/alter-form/AlterFormStageEditor.stories.tsx';
import * as egoFormStories from '../editors/ego-form/EgoFormStageEditor.stories.tsx';
import * as familyPedigreeEditorStories from '../editors/family-pedigree/FamilyPedigreeStageEditor.stories.tsx';
import * as informationStories from '../editors/information/InformationStageEditor.stories.tsx';
import * as nameGeneratorStories from '../editors/name-generator/NameGeneratorStageEditor.stories.tsx';
import { nameGeneratorStageEditors } from '../editors/nameGeneratorStageEditors.ts';
import * as shellStories from '../form/StageEditorShell.stories.tsx';
import StageEditorShell from '../form/StageEditorShell.tsx';
import type { ProtocolBuilderProtocolContext } from '../protocol-context.ts';
import { ResourceClientProvider } from '../resources/client.tsx';
import ContentBlockEditor from '../sections/content-blocks/ContentBlockEditor.tsx';
import ContentBlockPreview from '../sections/content-blocks/ContentBlockPreview.tsx';
import { contentBlockSlots } from '../sections/content-blocks/contentBlockTypes.ts';
import PageContentSection from '../sections/page-content/PageContentSection.tsx';
import StageNameSection from '../sections/stage-heading/StageNameSection.tsx';
import { StageEditSession } from '../stageEdit.tsx';
import { renderStageEditor } from '../testing/renderStageEditor.tsx';
import * as storyHostStories from '../testing/StageEditorStoryHost.stories.tsx';
import { StageEditorStoryHost } from '../testing/StageEditorStoryHost.tsx';

const SUBJECT = { entity: 'node', type: 'person' } as const;
const EMPTY_CONTEXT: ProtocolBuilderProtocolContext = {
  codebook: { node: {}, edge: {} },
  assets: {},
  orderedStages: [],
  issues: [],
};
/** A host that refuses, which is what raises an editor's own alert. */
const REFUSED = async (): Promise<CodebookWriteOutcome> => ({
  status: 'refused',
  message: 'the test host does not persist changes',
  refusal: { kind: 'unexplained' },
});

const personDocument = (
  variables: Record<string, unknown> = {},
): SectionDoc => ({
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables,
});

/**
 * Every heading in the document, as `level: text`, in the order a reader
 * navigating by headings meets them.
 *
 * The whole document rather than the render container: a `Dialog` portals its
 * content out, so a ladder read from the container alone would be missing the
 * half of it under test.
 *
 * A `root` narrows it to one subtree, for a surface that is only ever met
 * inside a page with a ladder of its own — a dialog opened over a stage
 * editor. What is asked of those is where their own headings sit relative to
 * the heading they were opened under, and spelling out the whole page as well
 * would make the answer change every time a section is added to an editor
 * that is not what the test is about. A skip anywhere is still caught:
 * `expectHeadingOrder` reads the whole document either way.
 */
const headingLadder = (root: ParentNode = document): string[] =>
  Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(
    (heading) =>
      `${heading.tagName.toLowerCase()}: ${heading.textContent?.trim() ?? ''}`,
  );

/**
 * axe's own `heading-order` rule, over everything on screen.
 *
 * The rule exempts the first heading it meets and then refuses any jump of
 * more than one level, which is exactly the failure a component that writes a
 * heading without saying so produces. Run here rather than left to the story
 * a11y configuration because nothing in this package's test lane replays the
 * stories.
 *
 * The count is asserted as well as the violations: axe reports a document with
 * no headings in it as inapplicable, with no violations to show, so a rendered
 * surface that quietly stopped writing headings would otherwise pass this.
 * `incomplete` nodes are asserted empty and excluded from that count: they are
 * headings axe could not judge either way, so counting them toward the total
 * would let an inconclusive verdict through as a pass.
 */
async function expectHeadingOrder(judgedAtLeast: number): Promise<void> {
  const results = await axe.run(document.body, {
    runOnly: { type: 'rule', values: ['heading-order'] },
  });

  expect(
    results.violations.flatMap((violation) =>
      violation.nodes.map((node) => node.html),
    ),
  ).toEqual([]);
  expect(
    results.incomplete.flatMap((result) =>
      result.nodes.map((node) => node.html),
    ),
  ).toEqual([]);
  expect(
    results.passes.flatMap((result) => result.nodes).length,
  ).toBeGreaterThanOrEqual(judgedAtLeast);
}

describe('an editor opened in a dialog', () => {
  /**
   * The dialog's title is the heading above the editor's own, and the editor's
   * own is the heading above every alert it raises. Read from the enclosing
   * statement rather than written out, because a hand-written level is only
   * ever right in one of the places a reusable editor is opened: an `h3` here
   * was a peer of the alerts below it, and an `h2` in the two editors beside
   * it was a peer of the dialog's own title.
   */
  it('puts a variable editor under the dialog title and its alerts under itself', async () => {
    const user = userEvent.setup();

    render(
      <Dialog open title="Create attribute" closeDialog={() => undefined}>
        <VariableEditor
          openId="open-1"
          mode="create"
          subject={SUBJECT}
          authoritativeDocument={personDocument()}
          variableId="new-variable"
          initialDraft={{
            name: 'choice',
            type: 'categorical',
            options: [{ label: 'Yes', value: 'yes' }],
          }}
          protocolContext={EMPTY_CONTEXT}
          title="Define allowed values"
          onSubmitDocument={REFUSED}
          onComplete={() => undefined}
        />
      </Dialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Create attribute' }));
    await screen.findByRole('alert');

    expect(headingLadder()).toEqual([
      'h2: Create attribute',
      'h3: Define allowed values',
      'h4: Attribute not saved',
    ]);
    await expectHeadingOrder(3);
  });

  it('puts an entity editor under the dialog title and its alerts under itself', async () => {
    const user = userEvent.setup();

    render(
      <Dialog open title="Create node type" closeDialog={() => undefined}>
        <CodebookEntityEditor
          mode="create"
          sessionKey="open-1"
          subject={SUBJECT}
          initialDraft={{
            name: 'Person',
            color: 'node-color-seq-1',
            icon: 'add-a-person',
            shape: { default: 'circle' },
          }}
          existingEntityNames={[]}
          onSubmit={REFUSED}
          onApplied={() => undefined}
        />
      </Dialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Save entity' }));
    await screen.findByRole('alert');

    expect(headingLadder()).toEqual([
      'h2: Create node type',
      'h3: Create node type',
      'h4: Could not save this entity',
    ]);
    await expectHeadingOrder(3);
  });

  it('puts a validation editor under the dialog title and its alerts under itself', async () => {
    render(
      <Dialog open title="Edit validation" closeDialog={() => undefined}>
        <CodebookVariableValidationEditor
          openId="open-1"
          subject={SUBJECT}
          variableId="age"
          // The attribute the editor was opened for is not in the entity data
          // it was given, which is the alert this surface raises on its own.
          authoritativeEntityDocument={personDocument()}
          allSubjectVariables={{}}
          onSubmitDocument={REFUSED}
        />
      </Dialog>,
    );

    expect(headingLadder()).toEqual([
      'h2: Edit validation',
      'h3: Edit validation for age',
      'h4: Attribute unavailable',
    ]);
    await expectHeadingOrder(3);
  });
});

describe('the stage editor shell', () => {
  const editor = (
    <StageEditorStoryHost
      stageId="information-1"
      renderEditor={({ target, formId, onSaved, actions }) => (
        <ResourceClientProvider>
          <StageEditSession target={target} formId={formId} onSaved={onSaved}>
            <StageEditorShell actions={actions}>
              <StageNameSection />
              <PageContentSection
                ItemEditor={ContentBlockEditor}
                ItemPreview={ContentBlockPreview}
                slots={contentBlockSlots}
              />
            </StageEditorShell>
          </StageEditSession>
        </ResourceClientProvider>
      )}
    />
  );

  /**
   * The stage's name is the page's heading, and every section configures part
   * of the stage that name belongs to — so a section is one below it, not
   * beside it. Nothing on screen can carry that heading (the visible one is
   * the name field, which is a control), so the section states it invisibly
   * and the shell says what it is.
   */
  it('opens at the stage name, with each section one below it', async () => {
    render(editor);
    // The host answers the acquire over a promise, so the form is drawn a turn
    // after the story mounts.
    await screen.findByRole('heading', { name: 'Page content' });

    expect(headingLadder()).toEqual(['h2: Stage name', 'h3: Page content']);
    await expectHeadingOrder(2);
  });

  /**
   * The whole ladder moves down together when a host mounts the editor under
   * a heading of its own. Read from the host's statement rather than fixed, so
   * the sections are subsections of the stage rather than peers of whatever
   * the host's page calls itself.
   */
  it('counts from a heading the host states, when there is one', async () => {
    render(
      <div>
        <h2>Prompt configuration</h2>
        <EnclosingHeadingLevel level="h2">{editor}</EnclosingHeadingLevel>
      </div>,
    );
    await screen.findByRole('heading', { name: 'Page content' });

    expect(headingLadder()).toEqual([
      'h2: Prompt configuration',
      'h3: Stage name',
      'h4: Page content',
    ]);
    await expectHeadingOrder(3);
  });
});

describe('a row of a stage editor list, opened in its dialog', () => {
  /** The one editor that offers both of the lists asked about here. */
  const openNameGenerator = () =>
    renderStageEditor({
      stageId: 'name-generator-1',
      registry: nameGeneratorStageEditors,
    });

  /**
   * The dialog is a page of its own: its title is the heading above the
   * sections that configure the row, and those sections are one below it —
   * however deep the card behind the overlay happens to sit.
   *
   * That depth is exactly what a section used to count from. `DialogPopup`
   * restarts the Surface ladder inside the overlay, so a first-level section
   * in one of these dialogs was an `h4` under the dialog's `h2` title: a skip
   * axe reports, and for a reader navigating by headings a subsection of
   * something that is not there. Both lists are reached only by opening a
   * row, so no story of the editor renders either of them.
   */
  it('puts a panel row’s sections under the dialog title', async () => {
    const harness = openNameGenerator();

    await harness.user.click(
      screen.getByRole('switch', { name: 'Side panels' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new panel' }),
    );

    expect(headingLadder(await screen.findByRole('dialog'))).toEqual([
      'h2: Create panel',
      'h3: Panel',
      'h3: Panel filter',
    ]);
    await expectHeadingOrder(3);
  });

  it('puts a prompt row’s sections under the dialog title', async () => {
    const harness = openNameGenerator();

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create new prompt' }),
    );

    expect(headingLadder(await screen.findByRole('dialog'))).toEqual([
      'h2: Create prompt',
      'h3: Participant prompt',
      'h3: Additional attributes',
    ]);
    await expectHeadingOrder(3);
  });
});

/**
 * The stories are the surfaces a reviewer looks at and the ones Chromatic and
 * the Storybook a11y addon replay, so the rule is run over them here too —
 * this package's test lane does not mount them otherwise.
 */
describe('every story of a surface that writes its own heading', () => {
  /**
   * Named by the surface as well as the story, because two of these modules
   * both export an `Editing` and a `Spectating`: gathered into one object by
   * story name alone, the last module read silently replaced them and two
   * stories were swept by nothing.
   */
  const from = (
    surface: string,
    composed: Record<string, () => ReactNode>,
  ): [string, () => ReactNode][] =>
    Object.entries(composed).map(([name, Story]) => [
      `${surface}/${name}`,
      Story,
    ]);

  const stories = [
    ...from('VariableEditor', composeStories(variableEditorStories)),
    ...from('CodebookEntityEditor', composeStories(entityEditorStories)),
    ...from(
      'CodebookVariableValidationEditor',
      composeStories(validationEditorStories),
    ),
    ...from('StageEditorShell', composeStories(shellStories)),
    ...from('StageEditorStoryHost', composeStories(storyHostStories)),
    // Every stage editor that has landed. An editor writes no heading of its
    // own — it composes the shared name heading and shared sections — so what
    // is asked of each is that the sections IT chose, and the alerts they
    // raise, land where the composition says they do. A whole editor is also
    // the only surface that puts both depths on screen at once, which is where
    // a section actually sits inside another one: a heading written at a fixed
    // level is right at the depth its author happened to be looking at and
    // wrong one rung down.
    ...from('AlterEdgeFormStageEditor', composeStories(alterEdgeFormStories)),
    ...from('AlterFormStageEditor', composeStories(alterFormStories)),
    ...from('EgoFormStageEditor', composeStories(egoFormStories)),
    ...from(
      'FamilyPedigreeStageEditor',
      composeStories(familyPedigreeEditorStories),
    ),
    ...from('InformationStageEditor', composeStories(informationStories)),
    ...from('NameGeneratorStageEditor', composeStories(nameGeneratorStories)),
  ];

  it.each(stories)('has no heading skip in %s', async (_name, Story) => {
    render(<Story />);
    // A stage editor's story mounts over a host that answers the acquire over
    // a promise, so it writes no heading at all on its first pass. Judged then,
    // axe would report a document it found nothing to judge in — which
    // `expectHeadingOrder` refuses, but only after the wait it needs anyway.
    await screen.findAllByRole('heading');

    await expectHeadingOrder(1);
  });
});
