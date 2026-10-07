import { listChangedFiles } from "./git.js";

type FileItem = { text: string; line: number };

/** Parse file labels while ignoring examples inside fenced code blocks. */
function readFileItems(message: string): FileItem[] {
  const items: FileItem[] = [];
  let fence: { marker: string; length: number } | null = null;
  const lines = message.split("\n");
  lines.forEach((line, index) => {
    // Remember the opening fence character and length so only a compatible fence closes it.
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      const marker = delimiter[1][0];
      if (!fence) fence = { marker, length: delimiter[1].length };
      else if (marker === fence.marker && delimiter[1].length >= fence.length) fence = null;
      return;
    }
    if (fence) return;
    const item = line.match(/^`([^`]+)`\s*$/);
    if (item && /^-{4,}\s*$/.test(lines[index + 1] ?? "")) {
      items.push({ text: item[1], line: index + 1 });
    }
  });
  return items;
}

function resolveFile(name: string, changedFiles: string[], label: string): string {
  const matches = changedFiles.filter(
    (candidate) => candidate === name || candidate.endsWith(`/${name}`),
  );
  if (matches.length !== 1) {
    throw new Error(`${label} must identify one changed file; found ${matches.length}`);
  }
  return matches[0];
}

function validateMessage(repo: string, message: string, parent: string, commit: string): string[] {
  const errors: string[] = [];
  const changedFiles = listChangedFiles(repo, parent, commit);
  const seenFiles = new Set<string>();
  for (const item of readFileItems(message)) {
    const label = `message line ${item.line}`;
    try {
      const file = resolveFile(item.text, changedFiles, label);
      if (seenFiles.has(file)) throw new Error(`${label} repeats ${file}`);
      seenFiles.add(file);
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
}

export { validateMessage };
