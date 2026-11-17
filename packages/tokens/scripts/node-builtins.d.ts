// Minimal type declarations for the few Node.js built-ins that build-tokens.ts uses.
// Written by hand instead of installing @types/node, so the tokens build needs no extra package.
// They must match the real Node.js API: https://nodejs.org/api/fs.html, https://nodejs.org/api/path.html,
// https://nodejs.org/api/process.html and https://nodejs.org/api/esm.html#importmetadirname

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(
    path: string,
    data: string,
    encoding: "utf8",
  ): void;
  export function mkdirSync(
    path: string,
    options: { recursive: true },
  ): string | undefined;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}

declare const process: {
  readonly argv: readonly string[];
  exitCode: number | undefined;
};

declare const console: {
  log(message: string): void;
  error(message: string): void;
};

interface ImportMeta {
  /** The directory of the current module (Node.js 20.11+). */
  readonly dirname: string;
}
