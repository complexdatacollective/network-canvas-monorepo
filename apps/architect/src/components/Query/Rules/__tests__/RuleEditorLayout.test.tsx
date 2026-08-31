import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('~/components/DialogForm/DialogForm', () => ({
  default: ({ open, layoutId }: { open: boolean; layoutId?: string }) => (
    <dialog open={open} data-layout-id={layoutId} />
  ),
}));

import RuleEditor from '../RuleEditor';

it('forwards the ArrayField row identity to the dialog', () => {
  render(
    <RuleEditor
      open
      seed={{ id: 'rule-1', type: '', options: {} }}
      ruleTypes={[]}
      codebook={{}}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      layoutId="rule-1"
    />,
  );

  expect(screen.getByRole('dialog')).toHaveAttribute(
    'data-layout-id',
    'rule-1',
  );
});
