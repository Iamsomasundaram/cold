// k6/steady_traffic.js (v2)
import { initEngine } from "./lib/engine.js";

const engine = initEngine({
  defaultLoadProfileId: "LP1",
  scenarioName: "steady",
});

export const options = engine.options;
export function setup() {
  return engine.setup();
}
export default function (data) {
  return engine.main(data);
}
