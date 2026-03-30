# moanete

## Rules

- Always keep `TASKS.md` up to date — check off completed items and add new ones as work progresses.
- Always keep `SPEC.md` up to date — reflect any architectural changes, new features, or removed functionality.
- Always keep `README.md` up to date — reflect any architectural changes, new features, or removed functionality.
- Before finishing work, run `just verify` to ensure lint, format, types, and build all pass.
- Never use `any` as a type. Never use `as unknown as TYPE` coercions. Use proper types, generics, or type guards instead.
