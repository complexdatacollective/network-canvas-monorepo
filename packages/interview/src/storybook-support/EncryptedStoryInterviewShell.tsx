'use client';

import { useEffect, useState } from 'react';
import SuperJSON from 'superjson';

import type { SyntheticInterview } from '@codaco/protocol-utilities';
import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { createEncryptionHeader } from '../interfaces/Anonymisation/encryptionFormat';
import { generateSecureAttributes } from '../interfaces/Anonymisation/utils';
import StoryInterviewShell from './StoryInterviewShell';

type EncryptedInterview = {
  interview: SyntheticInterview;
  /** The node variables whose answers are stored encrypted. */
  encryptedVariableIds: readonly string[];
  /**
   * Nodes whose answers were encrypted for another node, by node id, as if
   * copied from it. The passphrase unlocks the interview, but these answers
   * can never be read.
   */
  encryptedFor?: Readonly<Record<string, string>>;
};

async function encryptedRawPayload(
  { interview, encryptedVariableIds, encryptedFor }: EncryptedInterview,
  passphrase: string,
  currentStep: number,
) {
  const variables = Object.fromEntries(
    encryptedVariableIds.map((id): [string, Variable] => [
      id,
      { name: id, type: 'text', component: 'Text', encrypted: true },
    ]),
  );
  const payload = interview.getInterviewPayload({ currentStep });
  const { header, key } = await createEncryptionHeader(passphrase);
  const nodes = await Promise.all(
    payload.network.nodes.map(async (node) => {
      const nodeId = node[entityPrimaryKeyProperty];
      const { encryptedAttributes, secureAttributes } =
        await generateSecureAttributes(
          node[entityAttributesProperty],
          variables,
          key,
          encryptedFor?.[nodeId] ?? nodeId,
        );
      return {
        ...node,
        [entityAttributesProperty]: encryptedAttributes,
        [entitySecureAttributesMeta]: secureAttributes,
      };
    }),
  );
  return SuperJSON.stringify({
    ...payload,
    network: { ...payload.network, nodes, encryption: header },
  });
}

/**
 * An interview whose answers were protected with `passphrase` and which has
 * since been left and resumed, so its key is not in memory.
 *
 * Encrypting takes a moment, so nothing renders until it is done. The
 * navigation is vertical, the orientation in which the passphrase prompter
 * is shown.
 */
export default function EncryptedStoryInterviewShell({
  build,
  passphrase,
  currentStep,
}: {
  /** Stable across renders (declare it at module scope). */
  build: () => EncryptedInterview;
  passphrase: string;
  currentStep: number;
}) {
  const [rawPayload, setRawPayload] = useState<string>();

  useEffect(() => {
    let current = true;
    void encryptedRawPayload(build(), passphrase, currentStep).then((raw) => {
      if (current) setRawPayload(raw);
    });
    return () => {
      current = false;
    };
  }, [build, passphrase, currentStep]);

  if (!rawPayload) return null;

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={rawPayload}
        navigationOrientation="vertical"
      />
    </div>
  );
}
