import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  editorProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock('~/components/Form/ValidatedFieldArray', () => ({
  default: ({
    componentProps,
  }: {
    componentProps?: { editorProps?: Record<string, unknown> };
  }) => {
    captured.editorProps = componentProps?.editorProps;
    return <div data-testid="prompt-list" />;
  },
}));

vi.mock('~/components/enhancers/withSubject', () => ({
  default:
    (WrappedComponent: ComponentType<Record<string, unknown>>) =>
    (props: Record<string, unknown>) => (
      <WrappedComponent {...props} entity="node" type="person" />
    ),
}));

vi.mock('~/components/enhancers/withDisabledSubjectRequired', () => ({
  default:
    (WrappedComponent: ComponentType<Record<string, unknown>>) =>
    (props: Record<string, unknown>) => <WrappedComponent {...props} />,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import NameGeneratorPrompts from '../NameGeneratorPrompts';

it('passes the outer stage form to prompt attribute editors', () => {
  captured.editorProps = undefined;
  render(
    <NameGeneratorPrompts
      form="edit-stage"
      stagePath={null}
      stagePosition={0}
      interfaceType="NameGenerator"
    />,
  );

  expect(screen.getByTestId('prompt-list')).toBeInTheDocument();
  expect(captured.editorProps).toMatchObject({
    entity: 'node',
    type: 'person',
    stageForm: 'edit-stage',
  });
});
