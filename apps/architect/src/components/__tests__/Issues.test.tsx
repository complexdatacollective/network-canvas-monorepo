import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';

import ArchitectField from '../Form/ArchitectField';
import IssueAnchor from '../IssueAnchor';
import { useIssuesToolbarSegment } from '../Issues';
import { renderStageForm } from '../StageEditor/__tests__/stageFormTestHarness';

vi.mock('../../utils/scrollTo', () => ({ default: vi.fn() }));
const scrollTo = vi.mocked((await import('../../utils/scrollTo')).default);

const fieldErrors = {
  'foo': ['bar'],
  'baz[0].buzz': ['foo'],
  'baz[0].beep': ['boop'],
};

// The live segment, so a test can read the contract the toolbar is handed
// rather than reaching into Base UI's focus manager.
let capturedSegment: ToolbarSegment | null = null;

function IssuesHarness() {
  const { segment } = useIssuesToolbarSegment();
  capturedSegment = segment;
  return segment ? (
    <SegmentedToolbar label="Stage editor actions" items={[segment]} />
  ) : null;
}

const popoverSegment = () => {
  if (!capturedSegment || capturedSegment.type !== 'popover') {
    throw new Error('the issues popover segment is not rendered');
  }
  return capturedSegment;
};

/**
 * The segment's `finalFocus` as this hook always supplies it — a function, so
 * the answer can follow the researcher's last row click. Narrowed here rather
 * than at each call site: Base UI's prop also admits a boolean and a ref, and
 * an implementation that switched to either would fail this cast rather than
 * silently changing what the popover does on close.
 */
const resolveFinalFocus = (closeType: 'mouse' | 'keyboard') => {
  const { finalFocus } = popoverSegment();
  if (typeof finalFocus !== 'function') {
    throw new Error('finalFocus is expected to be a function');
  }
  return finalFocus(closeType);
};

describe('<Issues />', () => {
  it('renders nothing while the form has no errors', () => {
    const { container } = renderStageForm({ children: <IssuesHarness /> });

    expect(container).toBeEmptyDOMElement();
  });

  it('renders one entry per field error once a submit has failed', async () => {
    const view = renderStageForm({ children: <IssuesHarness /> });

    act(() => {
      view.getStoreApi().getState().setErrors({ formErrors: [], fieldErrors });
      view.getContext().markSubmitFailed();
    });

    // Popover content lives in a portal mounted to document.body, and opens
    // automatically because submitFailed + hasIssues.
    expect(await screen.findAllByTestId('issue')).toHaveLength(3);
  });

  describe('a field that fails several rules', () => {
    // Reachable today via an Introduction Panel / Anonymisation title over 50
    // characters that trims to empty: `required` and `maxLength` both fail, and
    // the form store keeps every message.
    const FIELD = 'introductionPanel.title';
    const LABEL = 'Introduction Panel Title';
    const ANCHOR_ID = 'field_introductionPanel_title';
    const MESSAGES = [
      'This field is required.',
      'Too long. Enter fewer than 50 characters.',
    ];

    const renderTwoMessages = async () => {
      const view = renderStageForm({
        children: (
          <>
            <IssueAnchor fieldName={FIELD} description={LABEL} />
            <IssuesHarness />
          </>
        ),
      });

      const setErrors = () =>
        act(() => {
          view
            .getStoreApi()
            .getState()
            // A fresh object each time: the panel memoises on error identity.
            .setErrors({ formErrors: [], fieldErrors: { [FIELD]: MESSAGES } });
        });

      setErrors();
      act(() => view.getContext().markSubmitFailed());
      await screen.findAllByTestId('issue');

      // Deliberately NO second `setErrors()` here. Base UI mounts the
      // popover's portal after the pass that opened it, so re-emitting the
      // errors used to be the only thing that ran the harvest against mounted
      // rows — which meant these tests could not see that a real first open
      // showed raw field paths. The harvest now happens as each row's ref
      // attaches, so the first open is enough.
      return view;
    };

    const rowParts = () =>
      screen.getAllByTestId('issue').map((row) => {
        const anchor = row.querySelector('a');
        return {
          href: anchor?.getAttribute('href'),
          label: anchor?.querySelector('span')?.textContent,
          text: anchor?.textContent,
        };
      });

    it('renders one row per message, each showing its own message', async () => {
      await renderTwoMessages();

      const rows = rowParts();
      expect(rows).toHaveLength(2);
      expect(rows[0]!.text).toContain(MESSAGES[0]);
      expect(rows[1]!.text).toContain(MESSAGES[1]);
    });

    it('gives every row its own label ref, so none is left showing the raw field path', async () => {
      await renderTwoMessages();

      expect(rowParts().map((row) => row.label)).toEqual([LABEL, LABEL]);
    });

    it('shows the friendly label on the FIRST open, with no re-validation', async () => {
      // Regression: the harvest ran in an effect keyed on `open`, which fires
      // before Base UI mounts the popover's rows — so `issueRefs` was empty and
      // every row kept its raw internal path until something re-emitted the
      // errors. Confirmed in a real browser before the fix: an invalid
      // Information stage listed "title - This field is required." on first
      // open and only read "Title - …" after re-validating.
      await renderTwoMessages();

      for (const { label } of rowParts()) {
        expect(label).toBe(LABEL);
        expect(label).not.toBe(FIELD);
      }
    });

    it('renders the rows without React duplicate-key warnings', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      try {
        await renderTwoMessages();

        const messages = consoleError.mock.calls.map((call) =>
          call.map(String).join(' '),
        );
        expect(
          messages.filter((message) => message.includes('the same key')),
        ).toEqual([]);
      } finally {
        consoleError.mockRestore();
      }
    });

    // Clicking a row closes the popover, so each row gets its own render.
    it.each([0, 1])(
      'scrolls to the field anchor from row %i',
      async (index) => {
        scrollTo.mockClear();
        await renderTwoMessages();

        const anchor = document.getElementById(ANCHOR_ID);
        expect(anchor).not.toBeNull();
        expect(rowParts().map((row) => row.href)).toEqual([
          `#${ANCHOR_ID}`,
          `#${ANCHOR_ID}`,
        ]);

        act(() => {
          screen.getAllByTestId('issue')[index]!.querySelector('a')!.click();
        });

        expect(scrollTo).toHaveBeenCalledExactlyOnceWith(anchor);
      },
    );
  });
});

/**
 * An issue row is a promise to take the researcher to the thing they have to
 * correct. Before this it only scrolled: the scroll target is an `sr-only`
 * anchor with no control in it, so Base UI's popover handed focus straight
 * back to the "Issues (n)" button, and a keyboard or screen-reader user was
 * left exactly where they started with the invalid control somewhere below.
 */
describe('<Issues /> focus', () => {
  const TITLE = 'introductionPanel.title';
  const TEXT = 'introductionPanel.text';

  const renderTwoInvalidFields = async () => {
    const view = renderStageForm({
      children: (
        <>
          <ArchitectField
            name={TITLE}
            label="Introduction Panel Title"
            component={InputField}
            initialValue=""
            validation={{ required: true }}
          />
          <ArchitectField
            name={TEXT}
            label="Introduction Panel Text"
            component={InputField}
            initialValue=""
            validation={{ required: true }}
          />
          <IssuesHarness />
        </>
      ),
    });

    act(() => {
      view
        .getStoreApi()
        .getState()
        .setErrors({
          formErrors: [],
          fieldErrors: {
            [TITLE]: ['This field is required.'],
            [TEXT]: ['This field is required.'],
          },
        });
      view.getContext().markSubmitFailed();
    });
    await screen.findAllByTestId('issue');
    return view;
  };

  const controlFor = (fieldName: string) =>
    document.querySelector(`[data-field-name="${fieldName}"] input`);

  const clickRow = (index: number) => {
    act(() => {
      screen.getAllByTestId('issue')[index]!.querySelector('a')!.click();
    });
  };

  it.each([
    [0, TITLE],
    [1, TEXT],
  ])('focuses the control the row at index %i names', async (index, field) => {
    await renderTwoInvalidFields();

    clickRow(index);

    expect(document.activeElement).toBe(controlFor(field));
  });

  it('focuses the row that was clicked, not the one an invalid submit chose', async () => {
    // The panel auto-opens on a failed save, with focus already on whatever
    // `focusFirstError` picked — the FIRST invalid control. Clicking the
    // second issue used to restore that first control on close, so the
    // researcher was silently sent to a different problem than the one they
    // asked for.
    await renderTwoInvalidFields();
    act(() => {
      (controlFor(TITLE) as HTMLElement).focus();
    });

    clickRow(1);

    expect(document.activeElement).toBe(controlFor(TEXT));
    expect(document.activeElement).not.toBe(controlFor(TITLE));
  });

  it('still scrolls, and to the field it focused', async () => {
    scrollTo.mockClear();
    await renderTwoInvalidFields();

    clickRow(1);

    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(controlFor(TEXT));
  });

  it('returns focus to the trigger when the panel is merely dismissed', async () => {
    // `finalFocus` is a live ref, so a row click leaves it pointing at that
    // row's control. Opening the panel again and dismissing it (Escape, a
    // click outside) must NOT drop the researcher back on a control they did
    // not ask for — every open clears the ref, and `true` is Base UI's own
    // "restore the default", which is the trigger.
    await renderTwoInvalidFields();

    clickRow(1);
    expect(resolveFinalFocus('mouse')).toBe(controlFor(TEXT));

    act(() => {
      popoverSegment().onOpenChange(true);
    });

    expect(resolveFinalFocus('keyboard')).toBe(true);
  });

  it('falls back to the anchor when the errored field has no control on screen', async () => {
    // A field inside a collapsed section is not mounted, so there is nothing
    // to focus — the row must still scroll rather than doing nothing at all.
    const view = renderStageForm({
      children: (
        <>
          <IssueAnchor fieldName="prompts" description="Prompts" />
          <IssuesHarness />
        </>
      ),
    });
    act(() => {
      view
        .getStoreApi()
        .getState()
        .setErrors({ formErrors: [], fieldErrors: { prompts: ['Required'] } });
      view.getContext().markSubmitFailed();
    });
    await screen.findAllByTestId('issue');
    scrollTo.mockClear();

    clickRow(0);

    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(
      document.getElementById('field_prompts'),
    );
  });
});
