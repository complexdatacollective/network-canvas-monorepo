import { describe, expect, it } from 'vitest';

import {
  AutomaticLayout,
  Background,
  ComposerEdges,
  ComposerLayoutVariable,
  ComposerNodeForm,
  InterviewScript,
  NodeType,
  QuickAdd,
  SkipLogic,
} from '~/components/sections';

import { INTERFACE_TYPES } from '../../Screens/NewStageScreen/interfaceOptions';
import { getInterface } from '../Interfaces';

describe('NetworkComposer registry', () => {
  it('has an editor config with the correct ordered sections', () => {
    const config = getInterface('NetworkComposer');
    expect(config.sections).toEqual([
      NodeType,
      QuickAdd,
      ComposerLayoutVariable,
      ComposerNodeForm,
      ComposerEdges,
      Background,
      AutomaticLayout,
      SkipLogic,
      InterviewScript,
    ]);
    expect(config.documentation).toContain('http');
  });

  it('has automaticLayout.enabled === false in the template', () => {
    const config = getInterface('NetworkComposer');
    const template = config.template as {
      behaviours: { automaticLayout: { enabled: boolean } };
    };
    expect(template.behaviours.automaticLayout.enabled).toBe(false);
  });

  it('appears in the stage-type picker as a Sociograms entry', () => {
    const entry = INTERFACE_TYPES.find((i) => i.type === 'NetworkComposer');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Sociograms');
  });
});
