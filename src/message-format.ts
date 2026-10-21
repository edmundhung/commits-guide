import { listChangedFiles } from "./git.js";

type ReviewNote = { selector: string; explanation: string; line: number };

/** Read top-level review notes in the body, leaving ordinary bullets and fenced examples alone. */
function readReviewNotes(message: string): ReviewNote[] {
  const notes: ReviewNote[] = [];
  let fence: { marker: string; length: number } | null = null;
  const lines = message.split("\n");
  lines.forEach((line, index) => {
    if (index === 0) return;
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (delimiter) {
      const marker = delimiter[1][0];
      if (!fence && !(marker === "`" && delimiter[2].includes("`"))) {
        fence = { marker, length: delimiter[1].length };
      } else if (fence && marker === fence.marker &&
          delimiter[1].length >= fence.length && !delimiter[2].trim()) {
        fence = null;
      }
      return;
    }
    if (fence) return;
    const note = line.match(/^- `([^`]*)`:[ \t]*(.*)$/);
    if (note) {
      notes.push({ selector: note[1], explanation: note[2], line: index + 1 });
    }
  });
  return notes;
}

function validateMessage(repo: string, message: string, parent: string, commit: string): string[] {
  const errors: string[] = [];
  const changedFiles = listChangedFiles(repo, parent, commit);
  for (const note of readReviewNotes(message)) {
    const label = `message line ${note.line}`;
    if (!note.explanation.trim()) errors.push(`${label} must include a review note explanation`);
    if (changedFiles.includes(note.selector)) continue;
    // Match complete path segments so a short name stays literal on every platform.
    const matches = changedFiles.filter((file) => file.endsWith(`/${note.selector}`));
    if (!matches.length) {
      errors.push(`${label} file selector matches no changed files: ${note.selector}`);
    } else if (matches.length > 1) {
      errors.push(`${label} file selector is ambiguous: ${note.selector}; use a longer path: ${matches.join(", ")}`);
    }
  }
  return errors;
}

export { validateMessage };
