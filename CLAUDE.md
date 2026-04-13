# moanete

## Rules

- Always keep `TASKS.md` up to date — check off completed items and add new ones as work progresses.
- Always keep `SPEC.md` up to date — reflect any architectural changes, new features, or removed functionality.
- Always keep `README.md` up to date — reflect any architectural changes, new features, or removed functionality.
- Before finishing work, run `just verify` to ensure lint, format, types, and build all pass.
- Never use `any` as a type. Never use `as unknown as TYPE` coercions. Use proper types, generics, or type guards instead.

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing.
Use ~/.claude/skills/gstack/... for gstack file paths (the global path).
