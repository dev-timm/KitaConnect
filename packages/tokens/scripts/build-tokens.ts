// Builds dist/tokens.css from src/tokens.json (the export of the Figma "KC Design System" library).
//
//   pnpm tokens:build   writes dist/tokens.css
//   pnpm tokens:check   regenerates the CSS in memory and fails if dist/tokens.css differs
//
// Security: the script reads only src/tokens.json (and, in check mode, dist/tokens.css) and
// writes only dist/tokens.css. The paths are fixed. It uses no network, no child processes,
// no eval, no dynamic import and no environment variables. Every input value is validated;
// anything unexpected stops the script with an error before anything is written.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Fixed settings
// ---------------------------------------------------------------------------

const PACKAGE_DIR = join(import.meta.dirname, "..");
const SOURCE_FILE = join(PACKAGE_DIR, "src", "tokens.json");
const OUTPUT_DIR = join(PACKAGE_DIR, "dist");
const OUTPUT_FILE = join(OUTPUT_DIR, "tokens.css");

/** Mobile first: desktop typography applies from this viewport width. */
const DESKTOP_MIN_WIDTH_PX = 768;
/** 1rem = 16px. */
const PX_PER_REM = 16;
/** rem and px values are rounded to at most this many decimal places. */
const MAX_DECIMALS = 4;
const CSS_PREFIX = "--kc-";

const PRIMITIVES = "Primitives";
const ALIAS = "Alias";
const SEMANTIC_COLOR = "Semantic / Color";
const SEMANTIC_TYPOGRAPHY = "Semantic / Typography";

type ValueType = "COLOR" | "FLOAT" | "STRING";

interface CollectionSpec {
  readonly layer: string;
  readonly modes: readonly string[];
  readonly types: readonly ValueType[];
}

/** The only collections, layers, modes and types that are accepted. */
const COLLECTIONS = new Map<string, CollectionSpec>([
  [
    PRIMITIVES,
    {
      layer: "1 Primitives",
      modes: ["Mode 1"],
      types: ["COLOR", "FLOAT", "STRING"],
    },
  ],
  [ALIAS, { layer: "2 Alias", modes: ["Mode 1"], types: ["COLOR", "FLOAT"] }],
  [
    SEMANTIC_COLOR,
    { layer: "3 Usage", modes: ["Light", "Dark"], types: ["COLOR"] },
  ],
  [
    SEMANTIC_TYPOGRAPHY,
    { layer: "3 Usage", modes: ["Desktop", "Mobile"], types: ["FLOAT"] },
  ],
]);

/** Figma variable names: letters, digits, spaces, "/" and "-" only. */
const NAME_PATTERN = /^[A-Za-z0-9 /-]+$/;
const CSS_NAME_PATTERN = /^--kc-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
const SCOPE_PATTERN = /^[A-Z_]+$/;
const MIN_NUMBER = 0;
const MAX_NUMBER = 2000;

/** The only text values that are accepted. */
const FONT_FAMILIES = new Map<string, string>([
  ["Inter", '"Inter", system-ui, sans-serif'],
]);
const FONT_WEIGHTS = new Map<string, number>([
  ["Regular", 400],
  ["Medium", 500],
  ["Semi Bold", 600],
  ["Bold", 700],
  ["Black", 900],
]);

/** Number groups and how they are output. */
const PX_GROUPS_IN_PRIMITIVES = new Set(["scale"]);
const REM_PROPERTIES_IN_TYPOGRAPHY = new Set([
  "font size",
  "line height",
  "paragraph spacing",
]);
/** Validated, but not output: CSS custom properties cannot be used in media queries. */
const DEVICE_SIZE = "Device Size";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class TokenError extends Error {}

function fail(message: string): never {
  throw new TokenError(message);
}

/** Shows an input value safely in an error message (quoted, escaped, shortened). */
function show(value: unknown): string {
  const text: string | undefined = JSON.stringify(value);
  if (text === undefined) return "undefined";
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

// ---------------------------------------------------------------------------
// Reading and validating tokens.json
// ---------------------------------------------------------------------------

interface AliasTarget {
  readonly collection: string;
  readonly name: string;
}

type TokenValue =
  | { readonly kind: "raw"; readonly value: string | number }
  | { readonly kind: "alias"; readonly target: AliasTarget };

interface Token {
  readonly collection: string;
  readonly name: string;
  readonly type: ValueType;
  readonly values: ReadonlyMap<string, TokenValue>;
  readonly cssName: string;
}

interface Tokens {
  readonly list: readonly Token[];
  readonly byKey: ReadonlyMap<string, Token>;
  readonly deviceSize: ReadonlyMap<string, TokenValue>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, where: string): Record<string, unknown> {
  if (!isRecord(value))
    fail(`${where}: expected an object, found ${show(value)}`);
  return value;
}

function expectArray(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value))
    fail(`${where}: expected a list, found ${show(value)}`);
  return value as readonly unknown[];
}

function expectString(value: unknown, where: string): string {
  if (typeof value !== "string")
    fail(`${where}: expected text, found ${show(value)}`);
  return value;
}

/** Fails unless the object has exactly these keys. */
function expectKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  where: string,
): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  const same =
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
  if (!same) {
    fail(
      `${where}: expected the keys ${wanted.join(", ")}, found ${actual.map(show).join(", ")}`,
    );
  }
}

function keyOf(collection: string, name: string): string {
  return `${collection}: ${name}`;
}

function toCssName(figmaName: string): string {
  return CSS_PREFIX + figmaName.toLowerCase().replace(/[ /]/g, "-");
}

function parseValue(raw: unknown, type: ValueType, where: string): TokenValue {
  if (isRecord(raw)) {
    expectKeys(raw, ["alias"], where);
    const alias = expectRecord(raw["alias"], `${where} alias`);
    expectKeys(alias, ["collection", "name"], `${where} alias`);
    return {
      kind: "alias",
      target: {
        collection: expectString(
          alias["collection"],
          `${where} alias collection`,
        ),
        name: expectString(alias["name"], `${where} alias name`),
      },
    };
  }
  switch (type) {
    case "COLOR":
      if (typeof raw !== "string" || !COLOR_PATTERN.test(raw)) {
        fail(
          `${where}: expected a color like #rrggbb or #rrggbbaa, found ${show(raw)}`,
        );
      }
      return { kind: "raw", value: raw.toLowerCase() };
    case "FLOAT":
      if (
        typeof raw !== "number" ||
        !Number.isFinite(raw) ||
        raw < MIN_NUMBER ||
        raw > MAX_NUMBER
      ) {
        fail(
          `${where}: expected a number from ${MIN_NUMBER} to ${MAX_NUMBER}, found ${show(raw)}`,
        );
      }
      return { kind: "raw", value: raw };
    case "STRING":
      if (
        typeof raw !== "string" ||
        (!FONT_FAMILIES.has(raw) && !FONT_WEIGHTS.has(raw))
      ) {
        fail(`${where}: text value not on the allowlist: ${show(raw)}`);
      }
      return { kind: "raw", value: raw };
  }
}

function parseType(
  value: unknown,
  spec: CollectionSpec,
  where: string,
): ValueType {
  const type = expectString(value, `${where} type`);
  const allowed: readonly string[] = spec.types;
  if (!allowed.includes(type)) {
    fail(
      `${where}: type ${show(type)} is not allowed here (allowed: ${spec.types.join(", ")})`,
    );
  }
  return type as ValueType;
}

function parseTokens(text: string): Tokens {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail("src/tokens.json is not valid JSON");
  }

  const root = expectRecord(data, "tokens.json");
  expectKeys(root, ["source", "collections"], "tokens.json");
  const source = expectRecord(root["source"], "source");
  for (const [key, value] of Object.entries(source)) {
    expectString(value, `source.${key}`);
  }

  const collections = expectArray(root["collections"], "collections");
  if (collections.length !== COLLECTIONS.size) {
    fail(
      `expected ${COLLECTIONS.size} collections, found ${collections.length}`,
    );
  }

  const list: Token[] = [];
  const byKey = new Map<string, Token>();
  const byCssName = new Map<string, Token>();
  const seenCollections = new Set<string>();
  let deviceSize: ReadonlyMap<string, TokenValue> | undefined;

  for (const [index, rawCollection] of collections.entries()) {
    const collection = expectRecord(rawCollection, `collection ${index + 1}`);
    expectKeys(
      collection,
      ["name", "layer", "modes", "variables"],
      `collection ${index + 1}`,
    );
    const name = expectString(
      collection["name"],
      `collection ${index + 1} name`,
    );
    const spec = COLLECTIONS.get(name);
    if (spec === undefined) fail(`unknown collection ${show(name)}`);
    if (seenCollections.has(name))
      fail(`collection ${show(name)} appears twice`);
    seenCollections.add(name);

    const layer = expectString(collection["layer"], `${name} layer`);
    if (layer !== spec.layer) {
      fail(`${name}: expected layer ${show(spec.layer)}, found ${show(layer)}`);
    }

    const modes = expectArray(collection["modes"], `${name} modes`).map(
      (mode) => expectString(mode, `${name} mode`),
    );
    const modesMatch =
      modes.length === spec.modes.length &&
      new Set(modes).size === modes.length &&
      modes.every((mode) => spec.modes.includes(mode));
    if (!modesMatch) {
      fail(
        `${name}: expected the modes ${spec.modes.join(", ")}, found ${modes.map(show).join(", ")}`,
      );
    }

    const variables = expectArray(collection["variables"], `${name} variables`);
    for (const [varIndex, rawVariable] of variables.entries()) {
      const at = `${name} variable ${varIndex + 1}`;
      const variable = expectRecord(rawVariable, at);
      expectKeys(variable, ["name", "type", "scopes", "values"], at);

      const varName = expectString(variable["name"], `${at} name`);
      if (!NAME_PATTERN.test(varName)) {
        fail(
          `${at}: name ${show(varName)} may only contain letters, digits, spaces, "/" and "-"`,
        );
      }
      const where = `${name}: ${varName}`;
      const type = parseType(variable["type"], spec, where);

      for (const scope of expectArray(variable["scopes"], `${where} scopes`)) {
        if (typeof scope !== "string" || !SCOPE_PATTERN.test(scope)) {
          fail(`${where}: unexpected scope ${show(scope)}`);
        }
      }

      const rawValues = expectRecord(variable["values"], `${where} values`);
      expectKeys(rawValues, spec.modes, `${where} values`);
      const values = new Map<string, TokenValue>();
      for (const mode of spec.modes) {
        values.set(
          mode,
          parseValue(rawValues[mode], type, `${where} [${mode}]`),
        );
      }

      if (name === SEMANTIC_TYPOGRAPHY && varName === DEVICE_SIZE) {
        if (deviceSize !== undefined) fail(`${where} appears twice`);
        deviceSize = values;
        continue;
      }

      const key = keyOf(name, varName);
      if (byKey.has(key)) fail(`${where} appears twice`);

      const cssName = toCssName(varName);
      if (!CSS_NAME_PATTERN.test(cssName)) {
        fail(`${where}: the name gives the invalid CSS name ${show(cssName)}`);
      }
      const clash = byCssName.get(cssName);
      if (clash !== undefined) {
        fail(
          `name collision: ${show(keyOf(clash.collection, clash.name))} and ${show(key)} both become ${cssName}`,
        );
      }

      const token: Token = {
        collection: name,
        name: varName,
        type,
        values,
        cssName,
      };
      list.push(token);
      byKey.set(key, token);
      byCssName.set(cssName, token);
    }
  }

  if (deviceSize === undefined)
    fail(`${SEMANTIC_TYPOGRAPHY}: "${DEVICE_SIZE}" is missing`);
  for (const value of deviceSize.values()) {
    if (value.kind !== "raw")
      fail(`${SEMANTIC_TYPOGRAPHY}: "${DEVICE_SIZE}" must be a number`);
  }

  return { list, byKey, deviceSize };
}

// ---------------------------------------------------------------------------
// References: missing targets, loops, then the layer rules
// ---------------------------------------------------------------------------

function targetOf(tokens: Tokens, from: Token, target: AliasTarget): Token {
  const token = tokens.byKey.get(keyOf(target.collection, target.name));
  if (token === undefined) {
    fail(
      `${keyOf(from.collection, from.name)} points to a missing variable: ${show(keyOf(target.collection, target.name))}`,
    );
  }
  return token;
}

function checkReferences(tokens: Tokens): void {
  // 1. Every reference must point to an existing variable.
  for (const token of tokens.list) {
    for (const value of token.values.values()) {
      if (value.kind === "alias") targetOf(tokens, token, value.target);
    }
  }

  // 2. No reference may lead back to itself (alias loop).
  const state = new Map<Token, "visiting" | "done">();
  const visit = (token: Token, chain: readonly Token[]): void => {
    const current = state.get(token);
    if (current === "done") return;
    if (current === "visiting") {
      const loop = [...chain.slice(chain.indexOf(token)), token];
      fail(
        `alias loop: ${loop.map((t) => keyOf(t.collection, t.name)).join(" -> ")}`,
      );
    }
    state.set(token, "visiting");
    for (const value of token.values.values()) {
      if (value.kind === "alias") {
        visit(targetOf(tokens, token, value.target), [...chain, token]);
      }
    }
    state.set(token, "done");
  };
  for (const token of tokens.list) visit(token, []);

  // 3. Layer rules: Primitives are raw, Alias points to Primitives,
  //    Semantic / Color points to Alias, Semantic / Typography is raw.
  for (const token of tokens.list) {
    const where = keyOf(token.collection, token.name);
    for (const [mode, value] of token.values) {
      const at = `${where} [${mode}]`;
      if (
        token.collection === PRIMITIVES ||
        token.collection === SEMANTIC_TYPOGRAPHY
      ) {
        if (value.kind !== "raw")
          fail(
            `${at}: ${token.collection} must hold raw values, not references`,
          );
        continue;
      }
      const required = token.collection === ALIAS ? PRIMITIVES : ALIAS;
      if (value.kind !== "alias") {
        fail(`${at}: ${token.collection} must be a reference to ${required}`);
      }
      if (value.target.collection !== required) {
        fail(
          `${at}: ${token.collection} may only point to ${required}, but points to ${show(keyOf(value.target.collection, value.target.name))}`,
        );
      }
      const target = targetOf(tokens, token, value.target);
      if (target.type !== token.type) {
        fail(
          `${at}: a ${token.type} variable points to a ${target.type} variable`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Converting values to CSS
// ---------------------------------------------------------------------------

function formatNumber(value: number): string {
  const factor = 10 ** MAX_DECIMALS;
  return String(Math.round(value * factor) / factor);
}

function groupOf(name: string): string {
  const slash = name.indexOf("/");
  return slash === -1 ? "" : name.slice(0, slash);
}

function leafOf(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

function cssValue(tokens: Tokens, token: Token, value: TokenValue): string {
  const where = keyOf(token.collection, token.name);
  if (value.kind === "alias") {
    return `var(${targetOf(tokens, token, value.target).cssName})`;
  }
  const raw = value.value;

  if (token.collection === PRIMITIVES) {
    if (token.type === "COLOR" && typeof raw === "string") return raw;
    if (token.type === "FLOAT" && typeof raw === "number") {
      if (!PX_GROUPS_IN_PRIMITIVES.has(groupOf(token.name))) {
        fail(`${where}: no unit rule for this number group`);
      }
      return `${formatNumber(raw)}px`;
    }
    if (token.type === "STRING" && typeof raw === "string") {
      const group = groupOf(token.name);
      const weight = FONT_WEIGHTS.get(raw);
      if (group === "font weight" && weight !== undefined)
        return String(weight);
      const family = FONT_FAMILIES.get(raw);
      if (group === "font family" && family !== undefined) return family;
      fail(`${where}: ${show(raw)} is not allowed in the group ${show(group)}`);
    }
  }

  if (token.collection === SEMANTIC_TYPOGRAPHY && typeof raw === "number") {
    if (!REM_PROPERTIES_IN_TYPOGRAPHY.has(leafOf(token.name))) {
      fail(`${where}: no unit rule for this typography value`);
    }
    return `${formatNumber(raw / PX_PER_REM)}rem`;
  }

  return fail(`${where}: no conversion rule for this value`);
}

// ---------------------------------------------------------------------------
// Writing the CSS
// ---------------------------------------------------------------------------

/** Natural order: digit runs compare as numbers ("scale-50" before "scale-100"). */
function naturalCompare(a: string, b: string): number {
  const partsA = a.split(/(\d+)/);
  const partsB = b.split(/(\d+)/);
  const length = Math.min(partsA.length, partsB.length);
  for (let i = 0; i < length; i += 1) {
    const x = partsA[i] ?? "";
    const y = partsB[i] ?? "";
    if (x === y) continue;
    // split() with a capture group puts the digit runs at the odd positions.
    if (i % 2 === 1) {
      const difference = Number(x) - Number(y);
      if (difference !== 0) return difference;
    }
    return x < y ? -1 : 1;
  }
  return partsA.length - partsB.length;
}

function declarations(
  tokens: Tokens,
  collection: string,
  mode: string,
  indent: string,
): string[] {
  return tokens.list
    .filter((token) => token.collection === collection)
    .sort((a, b) => naturalCompare(a.cssName, b.cssName))
    .map((token) => {
      const value = token.values.get(mode);
      if (value === undefined)
        fail(`${keyOf(token.collection, token.name)}: mode ${mode} is missing`);
      return `${indent}${token.cssName}: ${cssValue(tokens, token, value)};`;
    });
}

function block(
  comment: string,
  selector: string,
  lines: readonly string[],
): string {
  return [`/* ${comment} */`, `${selector} {`, ...lines, "}"].join("\n");
}

function deviceSizeText(tokens: Tokens): string {
  return [...tokens.deviceSize]
    .map(
      ([mode, value]) =>
        `${mode} ${value.kind === "raw" ? String(value.value) : "?"}`,
    )
    .sort()
    .join(", ");
}

function buildCss(tokens: Tokens): string {
  const header = [
    "/*",
    " * KitaConnect design tokens.",
    " * Generated from src/tokens.json by scripts/build-tokens.ts. Do not edit by hand.",
    ' * To update: replace src/tokens.json, then run "pnpm tokens:build".',
    " *",
    ` * "${DEVICE_SIZE}" (${deviceSizeText(tokens)}) is not a variable: CSS custom`,
    " * properties cannot be used in media queries. Desktop typography applies",
    ` * from ${DESKTOP_MIN_WIDTH_PX}px (see the last section).`,
    " */",
  ].join("\n");

  const desktop = [
    `/* 4b. ${SEMANTIC_TYPOGRAPHY}, Desktop: from ${DESKTOP_MIN_WIDTH_PX}px */`,
    `@media (min-width: ${DESKTOP_MIN_WIDTH_PX}px) {`,
    "  :root {",
    ...declarations(tokens, SEMANTIC_TYPOGRAPHY, "Desktop", "    "),
    "  }",
    "}",
  ].join("\n");

  const sections = [
    header,
    block(
      `1. ${PRIMITIVES}: raw values`,
      ":root",
      declarations(tokens, PRIMITIVES, "Mode 1", "  "),
    ),
    block(
      `2. ${ALIAS}: references to ${PRIMITIVES}`,
      ":root",
      declarations(tokens, ALIAS, "Mode 1", "  "),
    ),
    block(
      `3a. ${SEMANTIC_COLOR}, Light (default): references to ${ALIAS}`,
      ":root",
      declarations(tokens, SEMANTIC_COLOR, "Light", "  "),
    ),
    block(
      `3b. ${SEMANTIC_COLOR}, Dark: only inside [data-theme="dark"]. Not switched on anywhere yet.`,
      '[data-theme="dark"]',
      declarations(tokens, SEMANTIC_COLOR, "Dark", "  "),
    ),
    block(
      `4a. ${SEMANTIC_TYPOGRAPHY}, Mobile (default)`,
      ":root",
      declarations(tokens, SEMANTIC_TYPOGRAPHY, "Mobile", "  "),
    ),
    desktop,
  ];
  return `${sections.join("\n\n")}\n`;
}

function summary(tokens: Tokens): string {
  const count = (collection: string): number =>
    tokens.list.filter((token) => token.collection === collection).length;
  const total = tokens.list.length;
  return [
    `${PRIMITIVES}: ${count(PRIMITIVES)}`,
    `${ALIAS}: ${count(ALIAS)}`,
    `${SEMANTIC_COLOR}: ${count(SEMANTIC_COLOR)} (Light and Dark)`,
    `${SEMANTIC_TYPOGRAPHY}: ${count(SEMANTIC_TYPOGRAPHY)} (Mobile and Desktop)`,
    `total: ${total} CSS variables ("${DEVICE_SIZE}" not output)`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function readText(path: string, label: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fail(`cannot read ${label}`);
  }
}

function parseMode(args: readonly string[]): "build" | "check" {
  if (args.length === 0) return "build";
  if (args.length === 1 && args[0] === "--check") return "check";
  return fail(
    `unexpected arguments ${args.map(show).join(" ")}; only --check is allowed`,
  );
}

function main(args: readonly string[]): void {
  const mode = parseMode(args);
  const tokens = parseTokens(readText(SOURCE_FILE, "src/tokens.json"));
  checkReferences(tokens);
  const css = buildCss(tokens);

  if (mode === "check") {
    const current = readText(
      OUTPUT_FILE,
      'dist/tokens.css (run "pnpm tokens:build")',
    );
    if (current !== css) {
      fail(
        'dist/tokens.css is out of date: run "pnpm tokens:build" and commit the result',
      );
    }
    console.log(`dist/tokens.css is up to date.\n${summary(tokens)}`);
    return;
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, css, "utf8");
  console.log(`Wrote dist/tokens.css.\n${summary(tokens)}`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof TokenError)) throw error;
  console.error(`tokens: ${error.message}`);
  process.exitCode = 1;
}
