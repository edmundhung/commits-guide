# Reviewable Commit Message Format

A reviewable commit message preserves context that is not clear from the patch.

## Format

```text
<subject>

<optional commit description>

`<file>`
--------

<optional file description>

- `<symbol>` <symbol description>

<optional metadata name>: <value>
```

## Information Roles

Each part has one job:

- The subject names the concrete capability or contract changed.
- The opening preserves a reason, constraint, decision, or guarantee that the patch cannot show.
- File order defines the review route. A file description explains why that file matters at that point.
- A symbol note records a non-obvious decision or guarantee localized to that symbol.
- A trailer links relevant context maintained elsewhere.

While drafting each sentence after the subject, keep it only when a reviewer could not write it confidently from its file or symbol label and patch alone.

## Commit

Name a user-facing command, option, API, or workflow directly when there is one.

Write for someone who sees only the final commit. Add a description only for important context unavailable from the subject and patch. Mention a prior or alternative design only when it explains a constraint or tradeoff that remains in the final code.

Omit anything the subject or patch already makes clear.

Only the subject is required.

## File Blocks

A backticked path followed immediately by a line of four or more hyphens starts an optional file block. This is a Markdown Setext heading. Match the underline length to the complete backticked label. Its path is the shortest suffix that identifies one changed file. Prefer `service.ts` when it is unique; use `payments/service.ts` when another changed file has the same basename.

Use file blocks as the review path within a commit. Leave supporting, generated, and routine code unannotated unless it affects the commit's purpose or the reviewer's decision.

Write file-level context as ordinary paragraphs or bullets beneath the label. Explain the file's role in the change rather than summarizing its contents. Backticked text within a paragraph remains ordinary message content.

## Symbol Blocks

A bullet beginning with one backticked symbol starts an optional symbol note within the current file. Continue its explanation as a sentence after the symbol, using indented lines when needed. Use the symbol's source spelling, qualified when that avoids ambiguity. Add a note only for a stable named function, method, class, or similar construct; keep broader context in the file block.

Resolution does not determine whether an item is a note: an unresolved file is invalid, while a viewer may leave an unresolved symbol beneath its file.

## Metadata

Git trailers link the commit to relevant context maintained elsewhere. Use descriptive names and values for issue or ticket identifiers, design documents, related changes, URLs, or other references that help explain the change. Follow established repository names when available. Repeat a name when linking multiple values, and keep all trailers in the final contiguous block.

## Example

```text
payments: preserve retry identity across worker restarts

Retries previously created a fresh provider operation after a worker restart.
Persist the original idempotency key so every attempt resumes the same
operation.

`retry-state.ts`
----------------

- `persistRetryState` writes the key before enqueue so a crash cannot lose it.

`service.ts`
------------

- `runPayment` passes the same key to initial and resumed attempts. An
  attempt-derived key would identify a separate provider operation.

Issue: PAY-123
Related-change: abc123
Related-change: def456
```
