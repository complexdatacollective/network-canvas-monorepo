import { screen, within } from '@testing-library/react';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type {
  InMemoryClient,
  InMemoryHost,
} from '../../../testing/host/createInMemoryHost.ts';
import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';

const nodeSection = (typeId: string) =>
  sectionId({ kind: 'codebookNode', typeId });

/** The checkbox for one attribute of one type, named by its own group. */
export const attributeCheckbox = (typeName: string, attribute: string) =>
  within(
    screen.getByRole('group', { name: `Encrypted attributes for ${typeName}` }),
  ).getByRole('checkbox', { name: attribute });

/** One codebook attribute, as the PROTOCOL holds it. */
export const personVariable = (
  harness: StageEditorHarness,
  variableId: string,
): Readonly<Record<string, unknown>> => {
  const variable = harness.hostCodebook().node?.person?.variables?.[variableId];
  if (variable === undefined) {
    throw new Error(`the person type has no "${variableId}" attribute`);
  }
  return variable;
};

/** One node type as the authoritative protocol currently holds it. */
const typeDocument = (
  harness: StageEditorHarness,
  typeId: string,
): SectionDoc => {
  const document = harness.protocolSections()[nodeSection(typeId)];
  if (document === undefined) {
    throw new Error(`the fixture has no "${typeId}" type`);
  }
  return document;
};

/** The person type as the authoritative protocol currently holds it. */
export const personDocument = (harness: StageEditorHarness) =>
  typeDocument(harness, 'person');

/**
 * One attribute of one type, left there by a COLLABORATOR.
 *
 * A revision delivered to the editor rather than a write of this section's
 * own, which is the whole difference the switch has to tell: the section
 * re-seeds a type's switch for a move it did not make, and leaves the panel
 * the researcher is working in alone.
 */
export const collaboratorSets = (
  harness: StageEditorHarness,
  typeId: string,
  variableId: string,
  variable: Readonly<Record<string, unknown>>,
  /**
   * Anything else the SAME revision carries — a rename, say.
   *
   * A test that has to know the revision has reached the screen waits on
   * something the section takes as a prop every render: the type's name is one
   * (its switch is not, which is the whole point of the re-seed).
   */
  alsoRevised: Readonly<Record<string, unknown>> = {},
): void => {
  const definition = typeDocument(harness, typeId);
  harness.receiveCodebookUpdate({
    node: {
      [typeId]: {
        ...definition,
        ...alsoRevised,
        variables: {
          ...(definition.variables as Record<string, unknown>),
          [variableId]: variable,
        },
      },
    },
  });
};

/**
 * A host that holds every write open until the test releases it.
 *
 * "A write of this section's own is in flight" is a state with rules of its
 * own — every box disabled, and a collaborator's move on another type deferred
 * rather than dropped — and a test can only stand in it if it decides when the
 * host answers. `inner` is the client the rest of the fixture would have used,
 * so a protocol seeded as already protecting something can be gated too.
 */
export const heldWrites = (
  inner: (host: InMemoryHost) => InMemoryClient = (host) => host.client,
): Readonly<{
  release: () => void;
  client: (host: InMemoryHost) => InMemoryClient;
}> => {
  const gate = Promise.withResolvers<void>();
  return {
    release: () => {
      gate.resolve();
    },
    client: (host: InMemoryHost) => {
      const client = inner(host);
      const submit: InMemoryClient['submit'] = async (
        ...args: Parameters<InMemoryClient['submit']>
      ) => {
        await gate.promise;
        return client.submit(...args);
      };
      return new Proxy(client, {
        get: (target, property) =>
          property === 'submit' ? submit : Reflect.get(target, property),
      });
    },
  };
};

/**
 * Opens one type's panel the way a researcher does.
 *
 * A type nothing protects yet starts switched off, so a test about its
 * checkboxes says so first — which is what the switch is for. The group
 * arriving is the wait: the panel is not in the DOM until the switch is on.
 */
export const switchOnType = async (
  harness: StageEditorHarness,
  typeName: string,
): Promise<void> => {
  await harness.user.click(
    await screen.findByRole('switch', { name: typeName }),
  );
  await screen.findByRole('group', {
    name: `Encrypted attributes for ${typeName}`,
  });
};

/**
 * A protocol whose `person` type ALREADY protects one attribute, seeded before
 * the editor opens.
 *
 * Written through the host rather than through the harness's own codebook
 * update because the two are different situations: this is a protocol that
 * already protects something when the editor opens, and a revision delivered
 * afterwards is a collaborator changing one that did not. The switch follows
 * both — which is what the tests that deliver one afterwards are about.
 */
export const alreadyProtecting =
  (variableId: string, typeId = 'person') =>
  (host: InMemoryHost): InMemoryClient => {
    const section = nodeSection(typeId);
    const definition = host.store.read(section).document;
    const variables = definition.variables;
    if (typeof variables !== 'object' || variables === null) {
      throw new Error(`the fixture has no "${typeId}" attributes`);
    }
    const held = (variables as Record<string, SectionDoc>)[variableId];
    if (held === undefined) {
      throw new Error(`the ${typeId} type has no "${variableId}" attribute`);
    }
    host.store.applyAsCollaborator(section, {
      ...definition,
      variables: { ...variables, [variableId]: { ...held, encrypted: true } },
    });
    return host.client;
  };
