---
name: commits-guide
description: Create or prepare Git commits for review by reducing avoidable diff noise and preserving useful context in concise messages. Use when asked to commit local changes, prepare changes for review, split a large change, or reorganize branch history.
---

# Commits Guide

Prepare Git history as a review tour. Commit boundaries and order guide the reviewer through the code; messages preserve context the code does not show.

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

- Each commit establishes one capability or decision. Split only parts that can be introduced and understood independently; keep related implementation and tests together.
- Start with the commit that establishes what the complete change enables, then order later commits so they reveal its implementation naturally.
- Follow [references/message-format.md](references/message-format.md). While drafting each sentence after the subject, keep it only when a reviewer could not write it confidently from the file or symbol label and patch alone. File and symbol blocks explain why that location matters; they do not narrate what the code executes.
- When the work changes or relocates existing behavior, identify the baseline and explain only the meaningful difference.

Omit anything the subject or patch already makes clear. Not every commit needs a body, and not every changed file needs a block. Ask the author when material intent is missing instead of inventing it.

## 3. Verify The Result

```text
commits-guide verify <base>..HEAD --source source.patch
```

`verify` checks every commit in the explicit range, validates message file blocks, confirms that the range starts at the captured base, and confirms that its final files match `source.patch`. It does not change Git state.

When preparing a branch or pull request, also provide a short title and summary of what the complete change enables and why.
