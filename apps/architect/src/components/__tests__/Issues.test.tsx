import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedToolbar } from '@codaco/fresco-ui/SegmentedToolbar';

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

function IssuesHarness() {
  const { segment } = useIssuesToolbarSegment();
  return segment ? (
    <SegmentedToolbar label="Stage editor actions" items={[segment]} />
  ) : null;
}

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

      // The label harvest only sees rows that are already mounted, and Base UI
      // mounts the popover's portal after the pass that opened it. Re-emitting
      // the errors (as re-validating after an edit would) runs the harvest
      // against the mounted rows.
      setErrors();

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
