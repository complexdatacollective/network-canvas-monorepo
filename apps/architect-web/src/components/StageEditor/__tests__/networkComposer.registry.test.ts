import { describe, expect, it } from 'vitest';

import {
  Background,
  InterviewScript,
  NodeType,
  SkipLogic,
} from '~/components/sections';
import EdgeConfiguration from '~/components/sections/EdgeConfiguration/EdgeConfiguration';
import NodeConfiguration from '~/components/sections/NodeConfiguration/NodeConfiguration';

import { INTERFACE_TYPES } from '../../Screens/NewStageScreen/interfaceOptions';
import { getInterface } from '../Interfaces';

describe('NetworkComposer registry', () => {
  it('has an editor config with the correct ordered sections', () => {
    const config = getInterface('NetworkComposer');
    expect(config.sections).toEqual([
      NodeType,
      NodeConfiguration,
      EdgeConfiguration,
      Background,
      SkipLogic,
      InterviewScript,
    ]);
    expect(config.documentation).toContain('http');
  });

  it('defaults automaticLayout to false in the template', () => {
    const config = getInterface('NetworkComposer');
    const template = config.template as {
      behaviours: { automaticLayout: boolean };
    };
    expect(template.behaviours.automaticLayout).toBe(false);
  });

  it('appears in the stage-type picker as a Sociograms entry', () => {
    const entry = INTERFACE_TYPES.find((i) => i.type === 'NetworkComposer');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Sociograms');
  });
});
