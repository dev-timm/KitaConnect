# 0001: Monorepo skeleton

- Date: 2026-11-16
- Status: Accepted
- Branch: `chore/monorepo-skeleton`

## Context

Phase 2 sets up the empty monorepo described in CLAUDE.md before any design system,
website or app code is written: folders, pinned tool versions, supply-chain protection,
shared TypeScript and ESLint settings, formatting and CI.

## Decisions

### Tool versions

- Node.js is pinned to the 26 major line (`engines.node: ">=26 <27"`, `.node-version: 26`).
  Patch updates arrive automatically; an exact patch would be more reproducible but needs
  manual updates.
- pnpm is pinned to 12.16.1 (`packageManager` and `engines.pnpm`). Corepack is not used:
  Node.js no longer ships it, and pnpm 12 reads `packageManager` itself.
- pnpm records its own pinned version with checksums in `pnpm-lock.yaml`
  (`packageManagerDependencies`). This appeared unexpectedly after the first
  `pnpm --version`; it was validated (see Verification) and kept.

### Supply-chain settings (`pnpm-workspace.yaml`)

- `minimumReleaseAge: 20160`: 14 days. The setting counts minutes (pnpm.io/settings).
- `strictDepBuilds: true` and `allowBuilds: {}`: no package may run install scripts without
  approval. No package has needed one so far.
- `blockExoticSubdeps: true` and `trustPolicy: no-downgrade`.
- `engineStrict: true` and `pmOnFail: error`: a wrong Node.js or pnpm version stops the
  install instead of continuing or downloading another pnpm.
- No `.npmrc`: in pnpm 12 it only holds registry and login settings. The ESLint docs suggest
  an `.npmrc` with `node-linker=hoisted` for pnpm; this was not followed.

### Packages and structure

- Four private packages under the scope `@kitaconnect/`: `web`, `tokens`, `ui`, `config`.
  They are never published.
- Dependencies between our own packages always use `workspace:*`, so they can never be
  resolved from the npm registry.
- Development tools are installed once at the repo root with exact versions.
  `packages/config` uses the root's ESLint packages without listing them itself; this is
  acceptable because nothing is published.

### TypeScript

- typescript 6.0.3, not 7.0.2: typescript-eslint 8.72.x supports only
  `typescript >=4.8.4 <6.1.0`.
- Shared `tsconfig.base.json` in `packages/config`: `strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`,
  `noUncheckedSideEffectImports`, `module: preserve` with `moduleResolution: bundler` (the
  TypeScript 6.0 recommendation for bundled apps), `target`/`lib` `es2023`, `types: []`,
  `skipLibCheck`, `noEmit`.
- All important options are set explicitly, because the TypeScript 6.0 release notes and the
  tsconfig reference disagree on some defaults.
- `exactOptionalPropertyTypes` is left out.
- No `dom` types yet; `ui` and `web` add them when React arrives. `target`/`lib` will be
  revisited once the supported browsers are decided.

### Formatting

- prettier 3.9.10 (3.10.x was younger than 14 days) with the standard style
  (`.prettierrc.json` is `{}`).
- `.prettierignore` lists `pnpm-lock.yaml` and `.claude/`, so formatting can never change the
  lockfile or the Claude Code permission settings.
- CLAUDE.md was formatted with blank lines added by hand and a rewritten Structure list, so
  that Prettier does not merge sentences into list items. No rule wording changed.
- `eslint-config-prettier` is not used. It is added only if a real clash between ESLint and
  Prettier shows up.

### Linting

- eslint 10.14.0, @eslint/js 10.0.1 and typescript-eslint 8.72.1 (newer versions were
  younger than 14 days).
- typescript-eslint `recommendedTypeChecked`: type-aware rules such as `no-floating-promises`,
  which catches async functions called without `await`. This matters because all data
  functions are async.
- Build output is listed in ESLint's `ignores`, because ESLint does not read `.gitignore`.

### CI (`.github/workflows/ci.yml`)

- Runs the format check, lint and typecheck on every pull request and every push to `main`.
- `permissions: contents: read`, no `pull_request_target`, no secrets,
  `persist-credentials: false`, `pnpm install --frozen-lockfile`, 10-minute timeout.
- No dependency cache, because the setup-node release notes warn about cache poisoning and a
  fresh install takes seconds.
- Actions are pinned to full commit SHAs and follow the 14-day rule too: actions/checkout
  v7.0.1, pnpm/action-setup v6.1.0 (v6.1.1 was 13 days old), actions/setup-node v7.1.0.
- The Storybook build is added in the Storybook phase.

## Verification

- Lockfile checksums matched `npm view <package> dist.integrity` exactly for pnpm 12.16.1,
  @pnpm/exe.darwin-arm64 12.16.1, typescript 6.0.3, prettier 3.9.10, eslint 10.14.0,
  @eslint/js 10.0.1 and typescript-eslint 8.72.1.
- pnpm documents the self-pin: "When pnpm 12 is declared via the legacy `packageManager`
  field and pmOnFail is not set to `ignore`, its resolution info is written to
  `pnpm-lock.yaml`." (pnpm.io/package_json) and "pnpm records the pnpm version it resolved
  for the project, under `packageManagerDependencies`." (pnpm.io/lockfile). Not documented:
  that `pnpm --version` triggers it, and the integrity field.
- pnpm 12.16.1 was published on 2026-10-27, so it passes the 14-day rule.
- Deliberate errors were caught: a type error and an unchecked index access failed
  `pnpm typecheck`; an async function called without `await` failed `pnpm lint`.
- A read-only security review before the first push found no secrets and no personal data.
  It confirmed noreply commit addresses, packages only from the default npm registry, no
  build scripts, an unchanged `.claude/settings.json`, and the workflow settings above.
- The first CI run on the pull request passed.

## Accepted risk

- GHSA-g3hv-75wg-m249 (CVE-2026-118764), Moderate (CVSS 4.0: 6.9): minimatch >=7.0.0
  <11.0.1 can be slowed down by crafted glob patterns (only with `optimizationLevel >= 2`).
  eslint 10.14.0 requires minimatch ^10.2.6 and installs 10.2.6.
- Accepted because ESLint runs only as a development tool, never in the website or app, and
  the patterns come from our own config. Worst case: a crafted pull request makes a CI run
  hang until the 10-minute timeout.
- Rejected alternatives: an exception to the 14-day rule for eslint 10.15.0 (3 days old)
  together with minimatch 11.0.5 or newer (also younger than 14 days), or waiting.
- Supporting data (npm downloads, last week): eslint 10.13.0: 8,375,699; 10.14.0:
  17,465,356; 10.15.0: 1,077,920.
- Follow-up from 27 Nov 2026, listed under Open decisions in CLAUDE.md.

## Open questions

- Switch from the legacy `packageManager` field to `devEngines.packageManager`?
- Switch to TypeScript 7 once typescript-eslint supports it.
- Update eslint to fix GHSA-g3hv-75wg-m249 (from 27 Nov 2026).

## AI and owner

- AI (Claude Code) produced the plan, the research in the pnpm, TypeScript, Prettier, ESLint
  and GitHub Actions docs, the package vetting reports, all file contents, the checks and the
  security review.
- The owner reviewed and approved every package, file, commit and push, and changed or
  decided the following:
  - added `.claude/settings.local.json` and `CLAUDE.local.md` to `.gitignore`
  - required `workspace:*` for dependencies between our own packages
  - removed `exactOptionalPropertyTypes`
  - skipped `eslint-config-prettier`
  - asked for checksum and docs validation before keeping the pnpm self-pin
  - added `.claude/` to `.prettierignore`
  - chose to fix CLAUDE.md by hand (blank lines, Structure list format) instead of plain
    reformatting
  - chose type-aware linting (`recommendedTypeChecked`)
  - chose eslint 10.14.0 with the accepted minimatch risk, and set the follow-up
  - asked for a read-only security review before the first push
