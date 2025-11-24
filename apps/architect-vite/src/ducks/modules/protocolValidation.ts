import type { CurrentProtocol } from "@codaco/protocol-validation";
import { validateProtocol } from "@codaco/protocol-validation";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

type ProtocolValidationState = {
	validationResult: Awaited<ReturnType<typeof validateProtocol>> | null;
	isValidating: boolean;
	validationError: string | null;
	lastValidatedProtocol: CurrentProtocol | null;
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
	async (protocol: CurrentProtocol, { rejectWithValue }) => {
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

export default protocolValidationSlice.reducer;
