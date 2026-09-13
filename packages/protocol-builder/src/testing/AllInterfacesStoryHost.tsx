import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { INTERFACE_NAMES } from '../interfaces/interfaceNames.ts';
import { ProtocolBuilder } from '../ProtocolBuilder.tsx';
import StageEditor from '../StageEditor.tsx';
import { createInMemoryHost } from './host/createInMemoryHost.ts';
import {
  fixtureAssetContentFor,
  fixtureAssetManifest,
  fixtureProtocolSections,
  fixtureStageIds,
  loadFixtureStage,
} from './protocolFixture.ts';

/**
 * The stages this host offers, and what to call each of them.
 *
 * `fixtureStageIds()` is the whole list. Written out here it would be a list
 * that agrees with itself — nineteen names in this file opening nineteen
 * editors and saying nothing about the twentieth interface somebody adds —
 * whereas the fixture holds exactly one stage per `StageType`, which is a fact
 * `protocolFixture.test.ts` keeps true.
 */
const openableStages = (): Readonly<{ stageId: string; name: string }>[] =>
  fixtureStageIds().map((stageId) => ({
    stageId,
    // Named for its interface rather than its stage id, because the question a
    // reader has on this page is which interfaces are covered.
    name: INTERFACE_NAMES[loadFixtureStage(stageId).type],
  }));

/**
 * One `<ProtocolBuilder>`, one protocol, and a way to open a stage of every
 * interface in it.
 *
 * The editor is reached through `StageEditor` — the dispatcher a host uses —
 * with no registry passed, so what opens is whatever the package's own
 * registry holds for that stage's interface. An interface nothing registers
 * does not render an empty panel: `UnregisteredStageTypeError` is thrown while
 * the dispatcher renders, and the story fails with the interface named.
 *
 * One at a time rather than all nineteen at once, which is both what a host
 * does and what the page can be read as: nineteen stage editors mounted
 * together put nineteen copies of "Interviewer guidance" on one page, and a
 * duplicated landmark name is a real accessibility defect in the page even
 * though it is nobody's editor that has it.
 */
export function AllInterfacesStoryHost() {
  const [host] = useState(() => {
    const manifest = fixtureAssetManifest();
    return createInMemoryHost({
      sections: {
        ...fixtureProtocolSections(),
        [sectionId({ kind: 'assets' })]: manifest,
      },
      assetContent: fixtureAssetContentFor(manifest),
    });
  });
  const [stages] = useState(openableStages);
  const [openStageId, setOpenStageId] = useState(() => stages[0]?.stageId);

  const open = stages.find((stage) => stage.stageId === openStageId);
  if (open === undefined) {
    throw new Error(
      'The all-interfaces fixture holds no stages, so there is nothing to open.',
    );
  }

  return (
    <DialogProvider>
      <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
        <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
          <nav aria-label="Interfaces">
            <ul className="flex list-none flex-wrap gap-2 p-0">
              {stages.map(({ stageId, name }) => (
                <li key={stageId}>
                  <Button
                    type="button"
                    size="sm"
                    color={stageId === open.stageId ? 'primary' : 'default'}
                    // The current page of a set, which is what this is: the
                    // editor below IS this interface's, rather than a control
                    // being pressed or a section being expanded.
                    aria-current={stageId === open.stageId ? 'true' : undefined}
                    onClick={() => setOpenStageId(stageId)}
                  >
                    {name}
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
          {/*
            Keyed by the stage, so opening another interface mounts its editor
            rather than handing this one a different stage: an edit is opened
            once, against one section, and the lock it holds is that section's.
          */}
          <section key={open.stageId} aria-label={`${open.name} editor`}>
            <Heading level="h2">{open.name}</Heading>
            <StageEditor
              target={{
                sectionId: sectionId({ kind: 'stage', stageId: open.stageId }),
              }}
              formId={`stage-form-${open.stageId}`}
            />
          </section>
        </main>
      </ProtocolBuilder>
    </DialogProvider>
  );
}
