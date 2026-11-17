# @kitaconnect/tokens

Design tokens from the Figma library "KC Design System", turned into CSS custom properties.

- Source: `src/tokens.json` (exported from Figma, never edited by hand)
- Output: `dist/tokens.css` (generated and committed, never edited by hand)
- Script: `scripts/build-tokens.ts`

## Layers

The tokens have three layers in four Figma collections:

| Layer      | Collection              | Holds                                                                                             | Values                                   |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Primitives | `Primitives`            | colors, numeric scale, font families, weights                                                     | raw values, e.g. `#3838d9`, `4px`        |
| Alias      | `Alias`                 | color roles (primary, success, warning, error, information, neutral), border width, border radius | references to Primitives                 |
| Usage      | `Semantic / Color`      | text, icon, surface and border colors                                                             | references to Alias, Light and Dark mode |
| Usage      | `Semantic / Typography` | font size, line height, paragraph spacing                                                         | numbers, Mobile and Desktop mode         |

References stay references in the CSS, so `--kc-text-body` is `var(--kc-neutral-default)`, which is
`var(--kc-grey-700)`. Changing a Primitive changes everything that refers to it.

Components use Usage tokens. Until more Usage tokens exist:

- border width and border radius come from Alias (`--kc-border-width-*`, `--kc-border-radius-*`)
- spacing uses the Primitives scale directly (`--kc-scale-*`), because there are no semantic
  spacing tokens yet

## Naming

Every CSS name is `--kc-` plus the Figma name in lowercase, with `/` and spaces turned into `-`:

| Figma name              | CSS name                     |
| ----------------------- | ---------------------------- |
| `text/primary`          | `--kc-text-primary`          |
| `border radius/md`      | `--kc-border-radius-md`      |
| `font weight/semi bold` | `--kc-font-weight-semi-bold` |
| `h1/font size`          | `--kc-h1-font-size`          |

## Modes

- **Light and Dark:** Light values are on `:root`. Dark values only apply inside
  `[data-theme="dark"]`. Dark mode is not switched on anywhere yet, because the dark palette is not
  final. There is no `prefers-color-scheme` rule.
- **Mobile and Desktop:** typography is mobile first. Mobile values are on `:root`; Desktop values
  apply inside `@media (min-width: 768px)`. The 768px breakpoint is one constant in the script.
- **Device Size:** the Figma variable "Device Size" (Desktop 1440, Mobile 440) is not output, because
  CSS custom properties cannot be used in media queries. The 768px breakpoint is used instead.

## Units

| Tokens                                       | Unit                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------- |
| font size, line height, paragraph spacing    | `rem` (px / 16, at most 4 decimal places)                            |
| scale (spacing, border width, border radius) | `px`                                                                 |
| font weight                                  | numbers: Regular 400, Medium 500, Semi Bold 600, Bold 700, Black 900 |
| font family                                  | `"Inter", system-ui, sans-serif`                                     |

Fonts are not loaded by this package.

## Using the tokens

The package exports one file:

    @kitaconnect/tokens/tokens.css

It will be imported once in the app and in Storybook. Components then use the variables, for
example `color: var(--kc-text-body);`.

## Where tokens.json comes from

`src/tokens.json` is exported from the published "KC Design System" library. It is read through the
separate "KitaConnect - AI Drafts" file with the official Figma tools only. The source file is never
edited for this.

`tokens.json` must stay byte-identical to the export. It is excluded from Prettier
(`.prettierignore`) so formatting never changes it.

## Updating the tokens

1. Export the variables from the published library again and replace `src/tokens.json` (the export
   procedure is described in docs/decisions/0002).
2. Run `pnpm tokens:build` from the repo root. It validates the file and writes `dist/tokens.css`.
3. Review the changes in `dist/tokens.css` with `git diff`.
4. Commit `src/tokens.json` and `dist/tokens.css` together.

`pnpm tokens:check` regenerates the CSS in memory and fails if `dist/tokens.css` is out of date. CI
runs it on every pull request.

## Safety

- No packages: the script uses only the Node.js built-ins `node:fs` and `node:path`, and Node runs
  the TypeScript file directly.
- Fixed paths: it reads only `src/tokens.json` (and `dist/tokens.css` in check mode) and writes only
  `dist/tokens.css`. The only allowed argument is `--check`.
- No network, no child processes, no `eval`, no dynamic imports, no environment variables.
- Strict validation of every value: colors only `#rrggbb` or `#rrggbbaa`, numbers from 0 to 2000,
  text only from a fixed list (`Inter`, `Regular`, `Medium`, `Semi Bold`, `Bold`, `Black`), names only
  letters, digits, spaces, `/` and `-`. Unknown collections, modes or types stop the build.
- The script stops with an error, and writes nothing, on:
  1. a value that could inject CSS, e.g. `#fff; } body { display:none`
  2. a reference to a missing variable
  3. a reference loop
  4. two Figma names that become the same CSS name
  5. a Usage color that points to Primitives instead of Alias
