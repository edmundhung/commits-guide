---
name: commits-guide
description: Create or prepare Git commits for review by reducing avoidable diff noise and preserving useful context in concise messages. Use when asked to commit local changes, prepare changes for review, split a large change, or reorganize branch history.
---

# Commits Guide

Prepare Git history as a review tour. Commit boundaries and order guide the reviewer through the code; messages explain the design and preserve useful context.

## 1. Capture The Source

Choose the last commit that must remain unchanged. For uncommitted work this is
the current `HEAD`; for existing commits it is the earlier boundary. Everything
after it, including local changes, belongs to the source.

```text
commits-guide capture <base> > source.patch
```

`source.patch` is a standard Git patch series containing the ordered source commits and local changes. Read it for intent and intermediate changes that the final diff may hide. The source checkout remains unchanged.

The source shape does not decide the result. One uncommitted change may need
several review commits, while several source commits may belong in one. Choose
the final boundaries only after understanding the complete change.

## 2. Author The Review Tour

Use ordinary Git commands to create or reorganize the desired commits. Keep the final files the same as the captured source.

Build the tour around the final design rather than preserving accidental development history:

- Prefer small, complete review steps. Separate decisions a reviewer can assess independently, even when they share a command or file. Keep each decision's implementation and tests together; use partial staging when shared files contain changes for several steps.
- Start with a small, coherent change that introduces the main idea before its supporting machinery, then build on it.
- Follow [references/message-format.md](references/message-format.md) for messages and optional review notes.
- When existing behavior changes or moves, explain the meaningful difference. Earlier designs matter only when they explain a choice that remains in the final code.

Messages preserve purpose and context a reviewer would otherwise need to reconstruct across files. Keep the description a high-level summary of what changed and why; use review notes only when complex machinery or a non-obvious design decision needs explanation. Explain complex machinery through the model that keeps it correct, using a concrete scenario when useful. Use plain terms. Use history to recover intent and code to check explanations. Ask the author when important intent is missing.

## 3. Verify The Result

```text
commits-guide verify <base>..HEAD --source source.patch
```

`verify` checks every commit in the explicit range, validates file selectors in review notes, confirms that the range starts at the captured base, and confirms that its final files match `source.patch`. It does not change Git state.

When preparing a branch or pull request, also provide a short title and summary of what the complete change enables and why.
