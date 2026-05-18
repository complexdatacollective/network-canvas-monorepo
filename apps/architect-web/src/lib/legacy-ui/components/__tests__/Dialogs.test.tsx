import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Dialog } from '../Dialogs';
import { Dialogs } from '../Dialogs';

vi.mock('../../utils/CSSVariables');

const warningDialog = (): Dialog => ({
  id: String(Math.random()),
  type: 'Warning',
  title: 'Warning!',
  message: 'Something happened',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
});

const confirmDialog = (): Dialog => ({
  id: String(Math.random()),
  type: 'Confirm',
  title: 'Do you want to confirm the thing?',
  message: 'We might have more details here',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
});

const noticeDialog = (): Dialog => ({
  id: String(Math.random()),
  type: 'Notice',
  title: 'Hi',
  message: 'Notice me',
  onConfirm: vi.fn(),
});

const makeDialogs = () => [warningDialog(), confirmDialog(), noticeDialog()];

const makeProps = () => ({
  closeDialog: vi.fn(),
});

describe('<Dialogs />', () => {
  it('Renders nothing when dialogs empty', () => {
    const { container } = render(<Dialogs {...makeProps()} />);
    expect(container.firstChild).toBeNull();
  });

  it('It renders dialogs', () => {
    const { getByText } = render(
      <Dialogs {...makeProps()} dialogs={makeDialogs()} />,
    );
    expect(getByText('Warning!')).toBeInTheDocument();
    expect(getByText('Do you want to confirm the thing?')).toBeInTheDocument();
    expect(getByText('Hi')).toBeInTheDocument();
  });
});
