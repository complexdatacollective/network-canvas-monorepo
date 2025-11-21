import type { ComponentType } from "react";
import { testPromptFields } from "../../CategoricalBinPrompts/__tests__/PromptFields.test";
import PromptFields from "../PromptFields";

// vi.mock('~/components/NewVariableWindow');

// biome-ignore lint/suspicious/noExplicitAny: PromptFields is wrapped with HOCs that make its props Record<string, never>
testPromptFields(PromptFields as unknown as ComponentType<any>);
