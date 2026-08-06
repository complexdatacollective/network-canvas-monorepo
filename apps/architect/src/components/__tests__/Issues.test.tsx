import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SegmentedToolbar } from '@codaco/fresco-ui/SegmentedToolbar';

import { useIssuesToolbarSegment } from '../Issues';
import { renderStageForm } from '../StageEditor/__tests__/stageFormTestHarness';

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
});
