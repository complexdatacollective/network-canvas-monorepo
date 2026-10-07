import { render, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { createStageDraftProbe } from '../form/__tests__/stageDraftProbe.tsx';
import StageEditorShell from '../form/StageEditorShell.tsx';
import { getInterfaceTemplate } from '../interfaces/templates.ts';
import { ProtocolBuilder } from '../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../resources/client.tsx';
import { StageEditSession } from '../stageEdit.tsx';
import { createInMemoryHost } from '../testing/host/createInMemoryHost.ts';
import {
  fixtureLocalization,
  fixtureProtocolSections,
} from '../testing/protocolFixture.ts';

const SETTINGS = sectionId({ kind: 'settings' });

describe('a stage being created', () => {
  it('starts from its template’s copy when the protocol’s languages arrive after the editor opens', async () => {
    const host = createInMemoryHost({ sections: fixtureProtocolSections() });
    const settingsRead = Promise.withResolvers<void>();
    const adapter = host.adapterWith({
      GetSection: (input) =>
        input.sectionId === SETTINGS
          ? Effect.flatMap(host.handle.GetSection(input), (section) =>
              Effect.as(
                Effect.promise(() => settingsRead.promise),
                section,
              ),
            )
          : host.handle.GetSection(input),
    });
    const { probe, draft } = createStageDraftProbe();

    render(
      <DialogProvider>
        <ProtocolBuilder adapter={adapter} protocolId={host.protocolId}>
          <ResourceClientProvider>
            <StageEditSession
              target={{ stageType: 'FamilyPedigree', position: 0 }}
            >
              <StageEditorShell>{probe}</StageEditorShell>
            </StageEditSession>
          </ResourceClientProvider>
        </ProtocolBuilder>
      </DialogProvider>,
    );
    settingsRead.resolve();

    await waitFor(() =>
      expect(draft()).toMatchObject({
        introScreen: getInterfaceTemplate(
          'FamilyPedigree',
          fixtureLocalization(),
        ).introScreen,
      }),
    );
  });
});
