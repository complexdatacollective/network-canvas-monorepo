'use client';

import { useEffect, useState } from 'react';
import SuperJSON from 'superjson';

import type { SyntheticInterview } from '@codaco/protocol-utilities';
import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { generateSecureAttributes } from '../interfaces/Anonymisation/utils';
import StoryInterviewShell from './StoryInterviewShell';

type EncryptedInterview = {
  interview: SyntheticInterview;
  /** The node variables whose answers are stored encrypted. */
  encryptedVariableIds: readonly string[];
};

async function encryptedRawPayload(
  { interview, encryptedVariableIds }: EncryptedInterview,
  passphrase: string,
  currentStep: number,
) {
  const variables = Object.fromEntries(
    encryptedVariableIds.map((id): [string, Variable] => [
      id,
      { name: id, label: id, type: 'text', component: 'Text', encrypted: true },
    ]),
  );
  const payload = interview.getInterviewPayload({ currentStep });
  const nodes = await Promise.all(
    payload.network.nodes.map(async (node) => {
      const { encryptedAttributes, secureAttributes } =
        await generateSecureAttributes(
          node[entityAttributesProperty],
          variables,
          passphrase,
        );
      return {
        ...node,
        [entityAttributesProperty]: encryptedAttributes,
        [entitySecureAttributesMeta]: secureAttributes,
      };
    }),
  );
  // This schema gates encryption behind the protocol's `encryptedVariables`
  // experiment, so the payload switches it on for the encrypted answers to be
  // treated as encrypted.
  return SuperJSON.stringify({
    ...payload,
    protocol: {
      ...payload.protocol,
      experiments: { encryptedVariables: true },
    },
    network: { ...payload.network, nodes },
  });
}

/**
 * An interview whose answers were protected with `passphrase` and which has
 * since been left and resumed, so that passphrase is not in memory.
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
