import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { validateProtocol, type ValidationResult } from "@codaco/protocol-validation";
import type { Protocol } from "@codaco/protocol-validation";

type ProtocolValidationState = {
	validationResult: ValidationResult | null;
	isValidating: boolean;
	validationError: string | null;
	lastValidatedProtocol: Protocol | null;
};

const initialState: ProtocolValidationState = {
	validationResult: null,
	isValidating: false,
	validationError: null,
	lastValidatedProtocol: null,
};

// Async thunk for protocol validation
export const validateProtocolAsync = createAsyncThunk(
	"protocolValidation/validate",
	async (protocol: Protocol, { rejectWithValue }) => {
		try {
			const result = await validateProtocol(protocol);
			return { result, protocol };
		} catch (error) {
			return rejectWithValue(error instanceof Error ? error.message : "Validation failed");
		}
	},
);

const protocolValidationSlice = createSlice({
	name: "protocolValidation",
	initialState,
	reducers: {
		clearValidation: (state) => {
			state.validationResult = null;
			state.validationError = null;
			state.lastValidatedProtocol = null;
		},
	},
	extraReducers: (builder) => {
		builder
			.addCase(validateProtocolAsync.pending, (state) => {
				state.isValidating = true;
				state.validationError = null;
			})
			.addCase(validateProtocolAsync.fulfilled, (state, action) => {
				state.isValidating = false;
				state.validationResult = action.payload.result;
				state.lastValidatedProtocol = action.payload.protocol;
				state.validationError = null;
			})
			.addCase(validateProtocolAsync.rejected, (state, action) => {
				state.isValidating = false;
				state.validationError = action.payload as string;
				state.validationResult = null;
			});
	},
});

export const { clearValidation } = protocolValidationSlice.actions;
export default protocolValidationSlice.reducer;

// Export types
export type { ProtocolValidationState, ValidationResult };
