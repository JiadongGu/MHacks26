// Builds lib/contracts.ts from ../../contracts/schemas/*.schema.json.
// All schemas merge into one document, so a shared type is declared once.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, "../../../contracts/schemas");
const outFile = join(here, "../lib/contracts.ts");

const files = readdirSync(schemaDir)
  .filter((f) => f.endsWith(".schema.json"))
  .sort();

const defs = {};
const roots = {};

for (const file of files) {
  const { $schema, $defs, ...root } = JSON.parse(
    readFileSync(join(schemaDir, file), "utf8"),
  );
  void $schema;
  const name = root.title ?? file.replace(".schema.json", "");
  for (const [key, value] of Object.entries($defs ?? {})) {
    defs[key] ??= value;
  }
  defs[name] = root;
  roots[name] = { $ref: `#/$defs/${name}` };
}

const wrapper = {
  title: "PulseContracts",
  description: "Index of every contract type. Use the named exports in application code.",
  type: "object",
  additionalProperties: false,
  properties: roots,
  $defs: defs,
};

const banner = [
  "/**",
  " * GENERATED — do not edit.",
  " * Source: contracts/schemas/*.schema.json. Run `npm run contracts` to regenerate.",
  " */",
].join("\n");

const ts = await compile(wrapper, "PulseContracts", {
  bannerComment: banner,
  additionalProperties: false,
  declareExternallyReferenced: true,
  unreachableDefinitions: true,
  strictIndexSignatures: true,
  cwd: schemaDir,
});

writeFileSync(outFile, ts);
console.log(`Wrote ${outFile} from ${files.length} schemas.`);
