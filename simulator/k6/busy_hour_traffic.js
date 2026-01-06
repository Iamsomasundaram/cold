// k6/busy_hour_traffic.js (v2)
import { initEngine } from "./lib/engine.js";

const engine = initEngine({
  defaultLoadProfileId: "LP2",
  scenarioName: "busy_hour",
});

export const options = engine.options;
export function setup() {
  return engine.setup();
}
export default function (data) {
  return engine.main(data);
}
