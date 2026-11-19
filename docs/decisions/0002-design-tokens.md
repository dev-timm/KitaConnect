# 0002: Design tokens

- Date: 2026-11-19
- Status: Accepted
- Branch: feat/design-tokens

## Context

The Figma library "KC Design System" holds the design tokens as variables. Storybook, the landing page and the app need them as CSS custom properties, generated from one source.

## Decisions

1. **Source:** `packages/tokens/src/tokens.json`, an export of the published Figma library (268 variables in 4 collections). Never edited by hand.
2. **Build:** our own script (`scripts/build-tokens.ts`), Node.js built-ins only, run directly by Node 26 (TypeScript type stripping, stable since Node 25.2.0). No packages.
3. **Format:** a custom JSON format shaped like the Figma export, not the DTCG standard (Design Tokens Community Group, stable version 2025.10).
4. **Layers:** three layers (Primitives, Alias, Usage) in four collections (Primitives, Alias, Semantic / Color, Semantic / Typography). References stay `var()` references in the CSS.
5. **Naming:** `--kc-` + Figma name, lowercase, `/` and spaces become `-`.
6. **Light/Dark:** Light on `:root`, Dark only inside `[data-theme="dark"]`. Dark is not switched on anywhere and there is no `prefers-color-scheme`, because the dark palette is not final.
7. **Typography breakpoint:** mobile first; Desktop typography from 768px. This matches the main phone/tablet boundary of GitHub Primer, Shopify Polaris and Tailwind. Layout breakpoints are still open. "Device Size" (1440/440) is not output.
8. **Units:** rem for font size, line height and paragraph spacing (px / 16, at most 4 decimals); px for the scale, border width and radius; zero values keep their unit. Font weights as numbers; font family `"Inter", system-ui, sans-serif`.
9. **Output:** `dist/tokens.css` is generated and committed (`.gitignore` exception). `pnpm tokens:check` runs in CI; the CI job name stays "Format, lint and typecheck" so the required check keeps working. The CI change adds no new permissions, actions or secrets.
10. **Script safety:** fixed paths, only `--check` allowed, no network, child processes, eval, dynamic imports or environment variables, strict validation of every value.

### Trade-off: own script vs. Style Dictionary and DTCG

Large design systems (GitHub Primer, Atlassian) build tokens with Style Dictionary, and the industry is moving to the DTCG format. For one platform (web) and a strict no-dependency rule, our own script does the same job without supply-chain risk. Upgrade path if we go multi-platform: export or convert to DTCG and build with Style Dictionary.

## Figma changes before the export (made by the owner)

- Body text styles now use the Responsive line-height variables (they used the spacing scale before); documentation labels updated to match.
- Collections named Primitives, Alias, Semantic / Color and Semantic / Typography (previously Brand, Alias, Mapped and Responsive).
- New "Token Architecture" documentation page (drafted by AI in "KitaConnect - AI Drafts").
- Stray variables `Show icon` and `↪ Label` deleted from Alias; library published.

## Export procedure

1. Publish the "KC Design System" library in Figma.
2. In the Claude Project "KitaConnect", read the published variables through the separate file "KitaConnect - AI Drafts" (library enabled), using only the official Figma tools. The source file is only read, never edited.
3. Build `tokens.json` with validation: counts per collection, every alias target exists, every Light color matches the Mapped Colors documentation page.
4. Download the file and drag it into `packages/tokens/src/` (copy-paste once lost the final newline). Compare its SHA-256 with the export.
5. Run `pnpm tokens:build`, review the diff, commit `tokens.json` and `tokens.css` together.

## Verification

- 267 CSS variables (83 / 66 / 88 / 30), counted by the script and again from the CSS.
- The script rejects all five failure cases and writes nothing: CSS injection, missing reference, reference loop, name collision, Usage color pointing to Primitives.
- Two builds are byte-identical; `tokens:check` fails after one changed character; a path argument is rejected.
- `format:check`, `lint`, `typecheck` and `tokens:check` pass locally.

## Accepted risk

- `node-builtins.d.ts` is written by hand instead of installing `@types/node`. It describes only the 6 functions and 3 properties the script uses. Most mismatches would show up when the script runs; a wrong type could go unnoticed, so the file must be kept in line with the official Node.js documentation.
- The custom JSON format is not DTCG (see trade-off above).

## Open questions

- Dark palette design pass (some text colors on the dark page are below WCAG AA contrast).
- `Body/sm` line height 14/16 is tight for running text.
- No semantic spacing tokens yet; components use `--kc-scale-*` for now.
- Layout breakpoints and tablet designs.
- Font loading and the Inter license.
- Shadow and elevation tokens.
- Placeholder `packages/tokens/src/index.ts`.

## AI and owner

- AI produced: the Figma inventory, the token export and its validation, the draft Token Architecture page, the build script, the failure tests, the README and the CI step.
- The owner reviewed and approved every change, and decided or changed: the own-script approach, the naming scheme, the layer names and the Figma renames, Light only for now, the 768px breakpoint, rem for text, the line-height fix and label updates in Figma, deleting the stray variables, publishing the library, placing `tokens.json`, and the extra checks (file count, personal paths, checksums).
