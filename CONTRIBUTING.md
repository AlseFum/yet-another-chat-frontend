# Contributing

## Before You Start

Read:

- [`README.md`](README.md) for setup and commands
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for runtime boundaries
- [`web/src/applications/SPEC.md`](web/src/applications/SPEC.md) for Application contracts

Do not include `data/`, API keys, private conversation exports, `web/dist/`, or logs in a change.

## Development

```sh
npm install
npm run web:dev
```

Run the backend separately when testing server Jobs:

```sh
npm run backend
```

## Validation

Before opening a pull request:

```sh
npm run test:applications
npm run web:check-theme
npm run web:build
```

If a change affects Job recovery, test both a temporary browser Key and a server Key. If it
affects Prompt construction, assert the final `request.messages` and `request.tools` rather
than only testing intermediate state.

## Code Style

- Use the existing ES modules and Vue 3 Composition API style.
- Prefer the smallest correct change.
- Keep comments focused on lifecycle, privacy, serialization, or non-obvious invariants.
- Do not hard-code theme colors outside theme tokens and contract files.
- Do not add compatibility branches without a persisted-data or external-consumer reason.
- Keep user-visible labels and error messages in the project's existing language style.

## Pull Requests

Describe:

- What behavior changed
- Which state or request shape changed
- How the change preserves single/multi/raw boundaries
- Which commands were run
- Any known limitation or migration concern

Keep unrelated formatting and generated build output out of the pull request.
