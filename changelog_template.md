# Changelog Rules & Template

This document defines the rules for maintaining `CHANGELOG.md`. All contributors
(human or AI) **must** follow these rules exactly when adding entries.

---

## Format Rules

### 1. File location
Changes go in `CHANGELOG.md` at the project root. Never rename or relocate it.

### 2. Versioning
Follow [Semantic Versioning](https://semver.org/):
- `MAJOR` — breaking changes to the public API or launcher behavior
- `MINOR` — new backwards-compatible features
- `PATCH` — backwards-compatible bug fixes, documentation, refactors

### 3. Version header format
```
## [X.Y.Z] — YYYY-MM-DD
```
- Use ISO 8601 dates (YYYY-MM-DD)
- Bracket the version number
- Use an em dash (—) between version and date
- Newest version always at the top, below `## [Unreleased]`

### 4. Unreleased section
Always keep an `## [Unreleased]` section at the top of the version list.
Accumulate in-progress work here. When cutting a release, promote it to a
versioned block and add a fresh empty `## [Unreleased]` above it.

### 5. Change categories
Use only these category headers, in this order, omitting any that have no entries:

| Header | When to use |
|---|---|
| `### Added` | New files, features, routes, modules, or capabilities |
| `### Changed` | Modifications to existing behavior or APIs |
| `### Fixed` | Bug fixes, incorrect logic, path corrections |
| `### Removed` | Deleted files, deprecated features removed |
| `### Security` | Security-related fixes or hardening |
| `### Dependencies` | Package additions, removals, or version bumps |
| `### Infrastructure` | Build, CI, tooling, config, migration changes |

### 6. Entry format
Each entry is a single bullet:
```
- <imperative sentence describing what changed>. [optional: `file/path.ts`]
```
- Start with a capital letter
- End with a period
- Use the imperative mood ("Add", "Fix", "Remove" — not "Added", "Fixed")
- Reference the affected file or module in backticks when helpful
- Do **not** reference PR numbers, commit hashes, or author names
- One logical change per bullet — split multi-concern changes into separate bullets

### 7. Phase labels
When a change corresponds to a named development phase, prefix with `[PhaseN]`:
```
- [Phase1] Add Fastify HTTP server with health check endpoint.
```

### 8. Breaking changes
If a change breaks backwards compatibility, add a `> **Breaking:**` blockquote
immediately after the version header and before the first category:
```
## [1.0.0] — 2026-03-01

> **Breaking:** Settings schema changed — delete `config/settings.json`
> and let it regenerate from `config.example.json`.
```

### 9. Links section
At the bottom of `CHANGELOG.md`, maintain a reference-link block comparing
each version to the previous one. Format:
```
[Unreleased]: https://github.com/owner/repo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/owner/repo/releases/tag/v0.1.0
```
Until a remote repo URL is established, use `<!-- repo URL TBD -->` as a placeholder.

### 10. What NOT to include
- Internal refactors with no behavioral change (unless they affect module contracts)
- Whitespace-only edits
- Temporary debug code that was reverted in the same session
- Future plans or TODOs (those belong in `system_architecture.md`)

---

## Quick Reference — Entry Examples

```markdown
### Added
- [Phase1] Add Fastify HTTP server with health check at `GET /api/health`. `src/backend/server.ts`
- [Phase1] Add SQLite database with Drizzle ORM schema for `games` and `artwork` tables.

### Changed
- Move frontend static path resolution from `../../frontend` to `../frontend`. `src/backend/server.ts`

### Fixed
- Fix `@fastify/static` root path so the HTML frontend resolves correctly on startup.

### Dependencies
- Add `pino-pretty ^13.1.3` for development log formatting.
- Add `engines.node >= 22.0.0` constraint to `package.json`.

### Infrastructure
- Add `.nvmrc` pinning Node 22 for consistent local development.
- Add `drizzle.config.ts` for `drizzle-kit` migration tooling.
```

---

## When Claude Adds Entries

When completing any phase or task, Claude **must**:

1. Open `CHANGELOG.md` and read the current `## [Unreleased]` block.
2. Add new entries under the appropriate category headers inside `## [Unreleased]`.
3. Maintain category order (Added → Changed → Fixed → Removed → Security → Dependencies → Infrastructure).
4. Do not create a new versioned block unless the user explicitly asks to cut a release.
5. Write entries immediately after completing the work — not batched at the end of a session.
