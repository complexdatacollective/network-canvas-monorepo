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
  getInterface: (type: string) => ({
    name: `Interface:${type}`,
    documentation: undefined,
  }),
}));

import StageHeading from './StageHeading';

describe('StageHeading', () => {
  it('reads the stage type from the committed stage', () => {
    mockUseStageInitialValue.mockImplementation((path: string) =>
      path === 'type' ? 'NameGenerator' : undefined,
    );

    render(<StageHeading stageNumber={1} totalStages={3} isNewStage={false} />);

    expect(screen.getByText('Interface:NameGenerator')).toBeInTheDocument();
  });

  it('renders nothing when the stage type is absent', () => {
    mockUseStageInitialValue.mockReturnValue(undefined);

    const { container } = render(
      <StageHeading stageNumber={1} totalStages={3} isNewStage={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
