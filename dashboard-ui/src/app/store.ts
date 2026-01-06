import { configureStore } from "@reduxjs/toolkit";
import { dashboardApi } from "../features/dashboard/dashboardApi";
import { realtimeReducer } from "../features/dashboard/realtimeSlice";
import { filtersReducer } from "../features/filters/filtersSlice";

export const store = configureStore({
  reducer: {
    filters: filtersReducer,
    realtime: realtimeReducer,
    [dashboardApi.reducerPath]: dashboardApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(dashboardApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
