# Commit Message Format

## Format

```text
<subject>

<optional description>

- `<selector>`: <explanation>

<optional trailer name>: <value>
```

Only the subject is required.

## Subject

Name the concrete change or capability. Name the user-facing command, option, API, or workflow when it is central to the change.

## Description

Give a short, high-level summary of what the commit changes and why. Put detailed explanations in review notes. Omit the description when the subject provides enough context.

## Review Notes

Add review notes when complex machinery or a non-obvious design decision needs explanation. Routine changes can stand on the subject and high-level description. List them in review order.

A review note pairs a selector with an explanation using the reserved top-level bullet form ``- `<selector>`: <explanation>``. Each selector must identify a changed file. Use one selector per review note and indent wrapped explanation lines by two spaces. Other bullets and text remain ordinary prose; put literal review-note examples inside fenced code blocks.

Prefer the shortest path that identifies the intended changed file: usually its filename, adding parent directories only when needed to distinguish it from another changed file.

A selector identifies one changed file by its literal, case-sensitive path, using forward slashes on every platform. An exact repository-relative path takes precedence. Otherwise, a filename or trailing path must identify exactly one changed file; use a longer path when it is ambiguous. For example, `git.ts` or `src/git.ts` can identify `packages/cli/src/git.ts`. Paths can identify deleted files and files in hidden directories; matching uses the commit, not the working tree. Glob patterns are not supported, and characters such as brackets are always literal.

## Trailers

Git trailers link the commit to relevant context maintained elsewhere. Use descriptive names and values for issue or ticket identifiers, design documents, related changes, URLs, or other references that help explain the change. Follow established repository names when available. Repeat a name when linking multiple values, and keep all trailers in the final contiguous block.

## Example

```text
Resume payment retries after worker restarts

A restarted worker no longer knows which provider operation a retry belongs
to. Saving the original idempotency key lets every attempt resume the same
operation instead of starting another.

- `retry-state.ts`: The key is saved before the work is queued, so a
  crash cannot leave a queued retry without its identity.
- `service.ts`: New and resumed attempts load that same key. A key
  derived from the attempt number would create a separate provider operation.

Issue: PAY-123
Related-change: abc123
Related-change: def456
```
