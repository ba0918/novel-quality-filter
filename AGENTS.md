# Novel Quality Filter

A Chrome extension (Manifest V3) that scores novels on Kakuyomu/Narou ranking pages by stylistic
diversity, filtering out template-style writing. Personal use.

## Tech Stack

| Component  | Choice                                 |
| ---------- | -------------------------------------- |
| Runtime    | Deno                                   |
| Bundler    | esbuild + esbuild-deno-loader          |
| UI (popup) | Preact                                 |
| Tokenizer  | lindera-wasm-ipadic-web (IPADIC, WASM) |
| Test       | deno test (unit/integration)           |
| Storage    | IndexedDB + thin wrapper               |

Technology decisions are recorded in `.agents/artifacts/decisions/`.

## Quality Gate

Run `deno task check` for lint + fmt + test. Must pass before committing.

## Architecture

Layered architecture.

```
src/
├── domain/          # Pure domain logic (no browser API dependency)
│   ├── scoring/     #   Score calculation, weighting, normalization
│   ├── analyzer/    #   Sentence length SD, paragraph analysis, TTR, burstiness, etc.
│   └── tokenizer/   #   lindera-wasm wrapper (init & cache management)
├── services/        # Domain object orchestration
├── messaging/       # Inter-layer communication (Chrome extension messaging)
├── background/      # Service Worker (background scoring)
├── content/         # Kakuyomu/Narou content scripts + DOM injection
├── settings/        # Popup UI (threshold, blocklist management)
├── ui-components/   # Score badges, block buttons, etc.
└── shared/          # Type definitions, storage wrapper, constants
```

### Inter-layer Communication Rules

**All inter-layer communication goes through messaging. No direct imports across layers.**

- content / background / settings must NOT import each other directly
- All cross-layer communication uses typed messages via `messaging/`
- domain / shared can be imported from any layer (inward dependency only)

```
content ──messaging──▶ background ◀──messaging── settings
              │               │
              ▼               ▼
           domain          domain
              │               │
              ▼               ▼
           shared           shared
```

## Coding Conventions

- Follow Deno's standard formatter and linter
- `deno fmt` / `deno lint` settings are in deno.json
- Test files use `*_test.ts` naming convention

## Notes

- Avoid excessive requests to Kakuyomu/Narou (rate limiting required)
- WASM binary (17MB) is bundled with the Chrome extension. Watch build output size
- lindera-wasm in Chrome extensions requires `wasm-unsafe-eval` in CSP
