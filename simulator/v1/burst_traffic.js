// burst_traffic.js
import http from "k6/http";
import { check } from "k6";

// Simple random int helper (inclusive)
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const BASE_URL = __ENV.BASE_URL || "http://host.docker.internal:8080";
const INGEST_PATH = __ENV.INGEST_PATH || "/api/v1/events";

export const options = {
  scenarios: {
    burst_traffic: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1s",
      preAllocatedVUs: Number(__ENV.PRE_ALLOCATED_VUS) || 10,
      maxVUs: Number(__ENV.MAX_VUS) || 200,

      stages: [
        // Warm-up to small load
        { target: 10, duration: "10s" },

        // Big burst
        { target: 100, duration: "10s" },

        // Back to baseline
        { target: 10, duration: "20s" },

        // Ramp down
        { target: 0, duration: "10s" },
      ],
    },
  },
};

function buildEvent() {
  const now = Date.now();
  const event = {
    event_id: `${now}-${randInt(1, 1_000_000_000)}`,
    type: "transaction",
    amount: randInt(10, 5000),
    currency: "USD",
    created_at: new Date(now).toISOString(),
    merchant_id: `m-${randInt(1, 1000)}`,
    customer_id: `c-${randInt(1, 100000)}`,
    channel: "online",
    source_system: "k6-simulator-burst",
  };

  if (__ITER < 3 && __VU === 1) {
    console.log("Burst sample event:", JSON.stringify(event));
  }

  return event;
}

export default function () {
  const url = `${BASE_URL}${INGEST_PATH}`;
  const payload = JSON.stringify(buildEvent());
  const params = { headers: { "Content-Type": "application/json" } };

  const res = http.post(url, payload, params);

  check(res, {
    "status is 2xx/3xx": (r) => r.status >= 200 && r.status < 400,
  });
}
