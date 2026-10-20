'use client';

import UIPrompts from './Prompts/Prompts';
import { usePrompts } from './Prompts/usePrompts';

const Prompts = ({
  small,
  id,
  onExitComplete,
}: {
  small?: boolean;
  id?: string;
  /** Called once an outgoing prompt has finished leaving. */
  onExitComplete?: () => void;
}) => {
  const { prompt, prompts } = usePrompts();

  return (
    <UIPrompts
      currentPromptId={prompt.id}
      prompts={prompts}
      small={small}
      id={id}
      onExitComplete={onExitComplete}
    />
  );
};

export default Prompts;
