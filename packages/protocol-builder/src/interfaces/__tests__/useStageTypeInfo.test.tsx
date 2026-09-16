import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  fixtureStageIds,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { stageTypeDocumentationUrl } from '../documentation.ts';
import { interfaceDisplayName } from '../interfaceNames.ts';
import { useStageTypeInfo } from '../useStageTypeInfo.ts';

/**
 * What the hook answers, written out where a test can read it.
 *
 * Rendered rather than returned through a ref: what a host does with these is
 * put them on screen, and the three are only useful together — the type the
 * picture is drawn from, the name the badge carries, and where the link goes.
 */
function TypeInfo() {
  const { stageType, interfaceName, documentationUrl } = useStageTypeInfo();

  return (
    <dl>
      <dt>type</dt>
      <dd data-testid="stage-type">{stageType}</dd>
      <dt>name</dt>
      <dd data-testid="interface-name">{interfaceName}</dd>
      <dt>documentation</dt>
      <dd data-testid="documentation-url">{documentationUrl}</dd>
    </dl>
  );
}

/**
 * What kind of stage is open, read from the open EDIT rather than from a prop.
 *
 * Asked of every interface the fixture protocol holds, because the answer is
 * supposed to differ for each: a hook that had settled on one interface — or
 * that read a type handed to it rather than the stage's own — would agree with
 * a fixed expectation on one stage and disagree on the other eighteen.
 */
describe('what kind of stage is open', () => {
  it.each(fixtureStageIds())('answers for %s', (stageId) => {
    const { type } = loadFixtureStage(stageId);
    renderStageEditor({ stageId, sections: <TypeInfo /> });

    expect(screen.getByTestId('stage-type'), stageId).toHaveTextContent(type);
    expect(screen.getByTestId('documentation-url'), stageId).toHaveTextContent(
      stageTypeDocumentationUrl(type),
    );
  });

  /**
   * The interface's NAME is copy, so it is asked of the copy catalogue rather
   * than of a string written here — but it still has to be this stage's.
   */
  it.each(fixtureStageIds())('names the interface %s uses', (stageId) => {
    const { type } = loadFixtureStage(stageId);
    renderStageEditor({ stageId, sections: <TypeInfo /> });

    const expected = interfaceDisplayName(type);
    expect(typeof expected, `${type} has no display name`).toBe('string');
    expect(screen.getByTestId('interface-name'), stageId).toHaveTextContent(
      expected as string,
    );
  });
});
