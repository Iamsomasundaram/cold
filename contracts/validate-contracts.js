const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

const CASES = [
  {
    name: "events.ingest.v1",
    schema: "schemas/events.ingest.v1.schema.json",
    sample: "samples/events.ingest.v1.sample.json",
  },
  {
    name: "events.detected.v1",
    schema: "schemas/events.detected.v1.schema.json",
    sample: "samples/events.detected.v1.sample.json",
  },
  {
    name: "events.notifications.v1",
    schema: "schemas/events.notifications.v1.schema.json",
    sample: "samples/events.notifications.v1.sample.json",
  },
];

const ajv = new Ajv({ allErrors: true, strict: false });

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

let failed = false;

for (const entry of CASES) {
  const schemaPath = path.join(__dirname, entry.schema);
  const samplePath = path.join(__dirname, entry.sample);
  const schema = readJson(schemaPath);
  const sample = readJson(samplePath);
  const validate = ajv.compile(schema);

  const ok = validate(sample);
  if (ok) {
    console.log(`[OK] ${entry.name}`);
    continue;
  }

  failed = true;
  console.error(`[FAIL] ${entry.name}`);
  for (const err of validate.errors || []) {
    const pointer = err.instancePath ? err.instancePath : "/";
    console.error(`- ${pointer} ${err.message}`);
  }
}

if (failed) {
  process.exit(1);
}
