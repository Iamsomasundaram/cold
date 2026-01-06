// k6/burst_traffic.js (v2)
import { initEngine } from "./lib/engine.js";

const engine = initEngine({
  defaultLoadProfileId: "LP3",
  scenarioName: "burst",
});

export const options = engine.options;
export function setup() {
  return engine.setup();
}
export default function (data) {
  return engine.main(data);
}
