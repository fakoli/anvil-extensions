// JSON Schema conformance tests: schema parses, presets validate, invalid
// specs are rejected with the same shape the decoder reports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getPreset } from "../src/presets.ts";

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, "..", "schemas", "cloud.schema.json"), "utf8"));

test("published schema agrees with the real decoder on structural rejections", async () => {
  const { decodeSpec } = await import("../src/schema.ts");
  // 513 nested subnets must be rejected by BOTH the decoder and the schema.
  const spec = JSON.parse(JSON.stringify((await import("../src/presets.ts")).threeTierSpec()));
  const az = spec.cloud.regions[0].vpcs[0].azs[0];
  az.subnets = Array.from({ length: 513 }, (_, i) => ({ ...JSON.parse(JSON.stringify(az.subnets[0])), id: `subnet-${i}` }));
  const decoded = decodeSpec(spec);
  assert.equal(decoded.ok, false, "decoder rejects 513 nested subnets");
  const schemaErrors = validate(spec, schema);
  assert.ok(schemaErrors.length > 0, "published schema also rejects 513 nested subnets");
});

// Minimal draft-2020-12 validator for the subset of keywords the schema uses.
function validate(instance, sch, pointer = "#") {
  const errors = [];
  if (sch.$ref) {
    const resolved = resolveRef(sch.$ref);
    return validate(instance, resolved, pointer);
  }
  if (sch.const !== undefined && instance !== sch.const) {
    errors.push(`${pointer}: expected const ${JSON.stringify(sch.const)}`);
  }
  if (sch.enum && !sch.enum.includes(instance)) {
    errors.push(`${pointer}: ${JSON.stringify(instance)} not in enum`);
  }
  if (sch.type === "object") {
    if (typeof instance !== "object" || instance === null || Array.isArray(instance)) {
      errors.push(`${pointer}: expected object`);
      return errors;
    }
    for (const req of sch.required ?? []) {
      if (!(req in instance)) errors.push(`${pointer}: missing required property "${req}"`);
    }
    for (const [key, sub] of Object.entries(sch.properties ?? {})) {
      if (key in instance) errors.push(...validate(instance[key], sub, `${pointer}/${key}`));
    }
    if (sch.additionalProperties === false && sch.properties) {
      for (const key of Object.keys(instance)) {
        if (!(key in sch.properties)) errors.push(`${pointer}: additional property "${key}" not allowed`);
      }
    }
  }
  if (sch.type === "array") {
    if (!Array.isArray(instance)) {
      errors.push(`${pointer}: expected array`);
      return errors;
    }
    if (sch.minItems !== undefined && instance.length < sch.minItems) {
      errors.push(`${pointer}: fewer than ${sch.minItems} items`);
    }
    if (sch.maxItems !== undefined && instance.length > sch.maxItems) {
      errors.push(`${pointer}: more than ${sch.maxItems} items`);
    }
    if (sch.items) {
      instance.forEach((item, i) => errors.push(...validate(item, sch.items, `${pointer}/${i}`)));
    }
  }
  if (sch.type === "string" && typeof instance !== "string") errors.push(`${pointer}: expected string`);
  if (sch.oneOf) {
    const passes = sch.oneOf.filter((sub) => validate(instance, sub, pointer).length === 0).length;
    if (passes !== 1) errors.push(`${pointer}: expected exactly one oneOf match, got ${passes}`);
  }
  return errors;
}

function resolveRef(ref) {
  const path = ref.replace(/^#\//, "").split("/");
  let cur = schema;
  for (const seg of path) cur = cur[seg];
  return cur;
}

test("cloud.schema.json parses and is a draft-2020-12 schema", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(schema.$defs, "schema carries $defs");
});

test("both presets validate against the JSON Schema", () => {
  for (const id of ["simple-vpc", "three-tier"]) {
    const spec = getPreset(id);
    const errors = validate(JSON.parse(JSON.stringify(spec)), schema);
    assert.deepEqual(errors, [], `${id} should validate: ${JSON.stringify(errors)}`);
  }
});

test("schema rejects an unknown presentation.flow value", () => {
  const spec = JSON.parse(JSON.stringify(getPreset("three-tier")));
  spec.presentation.flow = "diagonal";
  const errors = validate(spec, schema);
  assert.ok(errors.some((e) => e.includes("/presentation/flow")));
});

test("schema rejects a spec missing required cloud.azs", () => {
  const spec = JSON.parse(JSON.stringify(getPreset("three-tier")));
  delete spec.cloud.regions[0].vpcs[0].azs;
  const errors = validate(spec, schema);
  assert.ok(errors.some((e) => e.includes("azs")));
});

test("schema rejects additional properties on the root", () => {
  const spec = JSON.parse(JSON.stringify(getPreset("three-tier")));
  spec.bogus = true;
  const errors = validate(spec, schema);
  assert.ok(errors.some((e) => e.includes("bogus")));
});
