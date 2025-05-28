import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testPromptFields } from "../../CategoricalBinPrompts/__tests__/PromptFields.test";
import PromptFields from "../PromptFields";

// vi.mock('~/components/NewVariableWindow');

testPromptFields(PromptFields);
