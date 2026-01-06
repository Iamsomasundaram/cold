import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type FiltersState = {
  tenantKey: string;
  sensorCode: string;
  metric: string;
  scenario: string;
  dataProfile: string;
  severity: string;
  violationType: string;
  timeWindow: string;
  from: string;
  to: string;
};

const defaultTenant = import.meta.env.VITE_DEFAULT_TENANT_KEY || "";

const initialState: FiltersState = {
  tenantKey: defaultTenant,
  sensorCode: "",
  metric: "",
  scenario: "",
  dataProfile: "",
  severity: "",
  violationType: "",
  timeWindow: "2h",
  from: "",
  to: "",
};

const filtersSlice = createSlice({
  name: "filters",
  initialState,
  reducers: {
    setTenantKey(state, action: PayloadAction<string>) {
      state.tenantKey = action.payload;
    },
    setSensorCode(state, action: PayloadAction<string>) {
      state.sensorCode = action.payload;
    },
    setMetric(state, action: PayloadAction<string>) {
      state.metric = action.payload;
    },
    setScenario(state, action: PayloadAction<string>) {
      state.scenario = action.payload;
    },
    setDataProfile(state, action: PayloadAction<string>) {
      state.dataProfile = action.payload;
    },
    setSeverity(state, action: PayloadAction<string>) {
      state.severity = action.payload;
    },
    setViolationType(state, action: PayloadAction<string>) {
      state.violationType = action.payload;
    },
    setPresetWindow(state, action: PayloadAction<string>) {
      state.timeWindow = action.payload;
      state.from = "";
      state.to = "";
    },
    setFrom(state, action: PayloadAction<string>) {
      state.from = action.payload;
      if (state.from || state.to) {
        state.timeWindow = "";
      }
    },
    setTo(state, action: PayloadAction<string>) {
      state.to = action.payload;
      if (state.from || state.to) {
        state.timeWindow = "";
      }
    },
    clearFilters(state) {
      state.sensorCode = "";
      state.metric = "";
      state.scenario = "";
      state.dataProfile = "";
      state.severity = "";
      state.violationType = "";
      state.timeWindow = "2h";
      state.from = "";
      state.to = "";
    },
  },
});

export const {
  setTenantKey,
  setSensorCode,
  setMetric,
  setScenario,
  setDataProfile,
  setSeverity,
  setViolationType,
  setPresetWindow,
  setFrom,
  setTo,
  clearFilters,
} = filtersSlice.actions;

export const filtersReducer = filtersSlice.reducer;
