import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockUseStageInitialValue } = vi.hoisted(() => ({
  mockUseStageInitialValue: vi.fn(),
}));

vi.mock('./stageFormHooks', () => ({
  useStageInitialValue: (path: string) =>
    mockUseStageInitialValue(path) as unknown,
}));

vi.mock('../Form/ArchitectField', () => ({
  default: () => null,
}));

vi.mock('./autoStageName/useAutoStageName', () => ({
  useAutoStageName: () => ({ onLabelBlur: vi.fn() }),
}));

vi.mock('@codaco/protocol-builder/interfaces/StageTypeImage', () => ({
  default: () => null,
}));

vi.mock('./Interfaces', () => ({
  getInterface: () => ({
    documentation: undefined,
  }),
}));

import StageHeading from './StageHeading';

describe('StageHeading', () => {
  it.each([
    ['NameGenerator', 'Name Generator (using forms)'],
    ['Sociogram', 'Sociogram'],
  ])('reads the committed %s stage type and displays %s', (type, label) => {
    mockUseStageInitialValue.mockImplementation((path: string) =>
      path === 'type' ? type : undefined,
    );

    render(<StageHeading stageNumber={1} totalStages={3} isNewStage={false} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText('Stage 1 of 3')).toBeInTheDocument();
  });

  it('renders nothing when the stage type is absent', () => {
    mockUseStageInitialValue.mockReturnValue(undefined);

    const { container } = render(
      <StageHeading stageNumber={1} totalStages={3} isNewStage={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
