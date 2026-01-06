import { useEffect, useMemo, useRef } from "react";
import { useAppDispatch } from "../../app/hooks";
import {
  clearRealtime,
  wsConnected,
  wsDisconnected,
  wsError,
  wsUpdate,
} from "./realtimeSlice";
import type { FiltersState } from "../filters/filtersSlice";

function resolveWsUrl() {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) return envUrl;

  const apiBase =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:4200/api";
  const base = apiBase.replace(/\/api\/?$/, "");
  return base.replace(/^http/, "ws") + "/ws";
}

function buildFilters(filters: FiltersState) {
  return {
    tenantKey: filters.tenantKey || undefined,
    sensorCode: filters.sensorCode || undefined,
    metric: filters.metric || undefined,
    scenario: filters.scenario || undefined,
    dataProfile: filters.dataProfile || undefined,
    severity: filters.severity || undefined,
    violationType: filters.violationType || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    timeWindow: filters.timeWindow || undefined,
  };
}

export function useDashboardSocket(filters: FiltersState) {
  const dispatch = useAppDispatch();
  const socketRef = useRef<WebSocket | null>(null);
  const filterPayload = useMemo(() => buildFilters(filters), [
    filters.tenantKey,
    filters.sensorCode,
    filters.metric,
    filters.scenario,
    filters.dataProfile,
    filters.severity,
    filters.violationType,
    filters.from,
    filters.to,
    filters.timeWindow,
  ]);
  const filterKey = useMemo(() => JSON.stringify(filterPayload), [filterPayload]);
  const latestFiltersRef = useRef(filterPayload);

  useEffect(() => {
    latestFiltersRef.current = filterPayload;
  }, [filterPayload]);

  useEffect(() => {
    if (!filters.tenantKey) return;

    const token = import.meta.env.VITE_API_TOKEN || "";
    const url = new URL(resolveWsUrl());
    if (token) {
      url.searchParams.set("token", token);
    }

    // Use query param auth because browsers cannot set WS headers reliably.
    const socket = new WebSocket(url.toString());
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      dispatch(wsConnected());
      socket.send(
        JSON.stringify({
          type: "subscribe",
          filters: latestFiltersRef.current,
        })
      );
    });

    socket.addEventListener("message", (event) => {
      try {
        const raw = typeof event.data === "string" ? event.data : "";
        if (!raw) return;
        const payload = JSON.parse(raw);
        if (payload.type === "update") {
          dispatch(wsUpdate(payload));
        } else if (payload.type === "error") {
          dispatch(wsError(payload.message || "WS error"));
        }
      } catch (err) {
        dispatch(wsError("WS payload parse failed"));
      }
    });

    socket.addEventListener("close", () => {
      dispatch(wsDisconnected());
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [dispatch, filters.tenantKey]);

  useEffect(() => {
    if (!socketRef.current) return;
    if (socketRef.current.readyState !== WebSocket.OPEN) return;
    // Filters changed; resubscribe so the server pushes matching updates.
    dispatch(clearRealtime());
    socketRef.current.send(
      JSON.stringify({
        type: "subscribe",
        filters: filterPayload,
      })
    );
  }, [dispatch, filterKey]);
}
