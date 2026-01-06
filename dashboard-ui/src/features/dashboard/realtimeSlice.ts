import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Summary, ViolationsResponse } from "./types";

type RealtimeState = {
  connected: boolean;
  summary?: Summary;
  violations?: ViolationsResponse;
  lastError?: string;
  lastUpdated?: string;
};

const initialState: RealtimeState = {
  connected: false,
};

const realtimeSlice = createSlice({
  name: "realtime",
  initialState,
  reducers: {
    wsConnected(state) {
      state.connected = true;
      state.lastError = undefined;
    },
    wsDisconnected(state) {
      state.connected = false;
    },
    wsUpdate(
      state,
      action: PayloadAction<{
        summary?: Summary;
        violations?: ViolationsResponse;
      }>
    ) {
      state.summary = action.payload.summary;
      state.violations = action.payload.violations;
      state.lastUpdated = new Date().toISOString();
    },
    wsError(state, action: PayloadAction<string>) {
      state.lastError = action.payload;
    },
    clearRealtime(state) {
      state.summary = undefined;
      state.violations = undefined;
      state.lastUpdated = undefined;
    },
  },
});

export const {
  wsConnected,
  wsDisconnected,
  wsUpdate,
  wsError,
  clearRealtime,
} = realtimeSlice.actions;

export const realtimeReducer = realtimeSlice.reducer;
