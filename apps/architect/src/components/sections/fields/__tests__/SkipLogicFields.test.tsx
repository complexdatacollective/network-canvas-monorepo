import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/Form/ValidatedField', () => ({
  default: () => null,
}));

vi.mock('~/components/Query', () => ({
  Query: () => null,
  ruleValidator: () => undefined,
  withFieldConnector: (component: unknown) => component,
  withStoreConnector: (component: unknown) => component,
}));

vi.mock('@codaco/fresco-ui/form/fields/RadioGroup', () => ({
  default: () => null,
}));

vi.mock('react-redux', () => ({
  useSelector: () => [],
}));

vi.mock('../SkipLogicDestinationField', () => ({
  default: () => null,
}));

import SkipLogicFields from '../SkipLogicFields';

describe('SkipLogicFields', () => {
  it('anchors issues with single-encoded field ids', () => {
    render(<SkipLogicFields stagePath="stages[0]" stagePosition={0} />);

    expect(document.getElementById('field_skipLogic_action')).not.toBeNull();
    expect(
      document.getElementById('field_skipLogic_destination'),
    ).not.toBeNull();
    expect(document.getElementById('field_skipLogic_filter')).not.toBeNull();

    // Regression: fieldName used to be pre-encoded with getFieldId, which
    // IssueAnchor then encoded again, producing dead `field_field_*` anchors.
    expect(document.getElementById('field_field_skipLogic_action')).toBeNull();
    expect(
      document.getElementById('field_field_skipLogic_destination'),
    ).toBeNull();
    expect(document.getElementById('field_field_skipLogic_filter')).toBeNull();

    expect(
      Array.from(
        document.querySelectorAll<HTMLElement>('[id^="field_skipLogic_"]'),
        ({ id }) => id,
      ),
    ).toEqual([
      'field_skipLogic_action',
      'field_skipLogic_filter',
      'field_skipLogic_destination',
    ]);
  });
});
