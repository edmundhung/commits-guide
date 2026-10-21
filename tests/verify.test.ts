import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import {
  cli,
  createRepository,
  createTemporaryDirectory,
  runCli,
  runCommand,
  runGit,
} from "./helpers.ts";

/** Stage every target-worktree change and create one proposed commit. */
function commitAll(repo: string, subject: string, body = ""): void {
  runGit(repo, "add", "-A");
  runGit(repo, "commit", "-q", "--cleanup=strip", "-m", subject,
    ...(body ? ["-m", body] : []));
}

describe("verify", () => {
  test("checks a root commit using its repository's object format", () => {
    const root = createTemporaryDirectory("commits-guide-verify-root-");
    try {
      const repo = createRepository(path.join(root, "repo"), "sha256");
      const result = runCli(repo, "verify", "HEAD");
      assert.match(result, /^✅ [0-9a-f]{7} base$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolves literal file paths against the commit, not the checkout", () => {
    const root = createTemporaryDirectory("commits-guide-verify-selectors-");
    try {
      const repo = createRepository(path.join(root, "repo"));
      for (const file of [
        "src/providers/a.ts", "src/providers/nested/b.ts", "tests/provider.test.ts",
        ".github/workflows/ci.yml", "routes/[id].ts", "docs/a,b.md",
        "docs/with space.md", "docs/{draft,final}.md", "!literal.txt", "#literal.txt", "LICENSE",
      ]) {
        fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
        fs.writeFileSync(path.join(repo, file), "content\n");
      }
      fs.rmSync(path.join(repo, "flagged.txt"));
      const body = [
        "- `src/providers/a.ts`: Keep the provider entry point consistent.",
        "  Its contract also governs the nested implementation.",
        "- `providers/a.ts`: A partial path identifies the same file.",
        "- `b.ts`: A unique filename identifies the nested implementation.",
        "- `nested/b.ts`: A partial path can include several directories.",
        "- `ci.yml`: Short paths can identify files in hidden directories.",
        "- `routes/[id].ts`: Select a literal path containing brackets.",
        "- `[id].ts`: Brackets are literal in short filenames too.",
        "- `docs/a,b.md`: A comma alone is part of the filename.",
        "- `{draft,final}.md`: Braces remain part of the filename.",
        "- `docs/with space.md`: Spaces remain part of the path.",
        "- `flagged.txt`: Explain a deleted file without reopening it.",
        "- `!literal.txt`: A leading exclamation mark is not negation.",
        "- `#literal.txt`: A leading hash remains part of the filename.",
        "- `LICENSE`: Filenames do not need an extension.",
        "",
        "Issue: PAY-123",
        "Related-change: abc123",
        "Related-change: def456",
      ].join("\n");
      commitAll(repo, "Guide the provider change", body);
      assert.equal(runGit(repo, "show", "-s", "--format=%B", "HEAD"),
        `Guide the provider change\n\n${body}`);

      fs.rmSync(path.join(repo, "src"), { recursive: true });
      fs.writeFileSync(path.join(repo, "uncommitted.ts"), "not committed\n");
      const status = runGit(repo, "status", "--porcelain=v1", "--untracked-files=all");
      assert.match(runCli(repo, "verify", "HEAD"), /^✅ [0-9a-f]{7} Guide the provider change$/);
      assert.equal(runGit(repo, "status", "--porcelain=v1", "--untracked-files=all"), status);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("requires a longer path when a short file selector is ambiguous", () => {
    const root = createTemporaryDirectory("commits-guide-verify-ambiguous-");
    try {
      const repo = createRepository(path.join(root, "repo"));
      for (const file of [
        "shared.ts", "src/shared.ts", "src/nested/other.ts", "tests/nested/other.ts",
      ]) {
        fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
        fs.writeFileSync(path.join(repo, file), "content\n");
      }
      commitAll(repo, "Add shared behavior", [
        "- `shared.ts`: An exact repository-relative path takes precedence.",
        "- `src/shared.ts`: A full path selects the nested file separately.",
        "- `src/nested/other.ts`: A longer path disambiguates duplicate filenames.",
      ].join("\n"));
      assert.match(runCli(repo, "verify", "HEAD"), /^✅ [0-9a-f]{7} Add shared behavior$/);

      for (const file of ["other.ts", "nested/other.ts"]) {
        runGit(repo, "commit", "--amend", "-q", "--cleanup=strip", "-m", "Add shared behavior",
          "-m", `- \`${file}\`: Explain this selection.`);
        const result = runCommand(cli, ["verify", "HEAD"], { cwd: repo });
        assert.notEqual(result.status, 0);
        assert.ok(result.stdout.includes(`file selector is ambiguous: ${file}`), result.stdout);
        assert.match(result.stdout, /src\/nested\/other\.ts/);
        assert.match(result.stdout, /tests\/nested\/other\.ts/);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("leaves ordinary prose, nested bullets, and fenced examples alone", () => {
    const root = createTemporaryDirectory("commits-guide-verify-prose-");
    try {
      const repo = createRepository(path.join(root, "repo"));
      fs.appendFileSync(path.join(repo, "tracked.txt"), "change\n");
      const body = [
        "Mention `missing.txt` inline without selecting it.",
        "",
        "- The `timeout` option remains ordinary prose.",
        "- `missing.txt` without a colon is ordinary prose.",
        "  - `missing.txt`: This nested bullet is not a review note.",
        "> - `missing.txt`: This is a quotation.",
        "",
        "    - `missing.txt`: This is indented code.",
        "",
        "````text",
        "- `missing.txt`: This is an example.",
        "```",
        "- `missing.txt`: The shorter fence did not close the example.",
        "~~~~",
        "- `missing.txt`: A different marker did not close it either.",
        "````not-a-closing-fence",
        "- `missing.txt`: A closing fence cannot have trailing text.",
        "````",
        "",
        "~~~text",
        "- `missing.txt`: Tilde fences also protect examples.",
        "```",
        "- `missing.txt`: Only the opening marker can close the fence.",
        "~~~",
        "",
        "- `tracked.txt`: This real note follows the closed examples.",
      ].join("\n");
      commitAll(repo, "Keep prose readable", body);
      assert.match(runCli(repo, "verify", "HEAD"), /^✅ [0-9a-f]{7} Keep prose readable$/);

      runGit(repo, "commit", "--amend", "-q", "--cleanup=strip", "-m", "Keep prose readable",
        "-m", body.replace("tracked.txt", "missing-after-fence.txt"));
      const rejected = runCommand(cli, ["verify", "HEAD"], { cwd: repo });
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stdout, /file selector matches no changed files: missing-after-fence.txt/);

      const subject = "- `missing.txt`: A subject, not a review note";
      runGit(repo, "commit", "--amend", "-q", "--cleanup=strip", "-m", subject);
      assert.ok(runCli(repo, "verify", "HEAD").endsWith(subject));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects review notes without an explanation or a changed-file match", () => {
    const root = createTemporaryDirectory("commits-guide-verify-invalid-note-");
    try {
      const repo = createRepository(path.join(root, "repo"));
      fs.mkdirSync(path.join(repo, "src", "providers"), { recursive: true });
      fs.writeFileSync(path.join(repo, "src", "providers", "a.ts"), "content\n");
      commitAll(repo, "Add a provider");
      fs.writeFileSync(path.join(repo, "uncommitted.ts"), "not committed\n");
      for (const file of [
        "missing.ts", "timeout", "tracked.txt", "uncommitted.ts", "providers/a.tsx", "rs/a.ts",
        "src/*.ts", "src/providers/*.ts", "**/*.ts", "{src/providers/a.ts,tracked.txt}",
        "SRC/providers/a.ts", "!src/providers/*.ts", "",
      ]) {
        runGit(repo, "commit", "--amend", "-q", "--cleanup=strip", "-m", "Add a provider",
          "-m", `- \`${file}\`: Explain this selection.`);
        const result = runCommand(cli, ["verify", "HEAD"], { cwd: repo });
        assert.notEqual(result.status, 0, file);
        assert.match(result.stdout, /^❌ [0-9a-f]{7} Add a provider$/m);
        assert.ok(result.stdout.includes(
          `message line 3 file selector matches no changed files: ${file}`), result.stdout);
      }
      runGit(repo, "commit", "--amend", "-q", "--cleanup=strip", "-m", "Add a provider",
        "-m", "- `src/providers/a.ts`:");
      const result = runCommand(cli, ["verify", "HEAD"], { cwd: repo });
      assert.notEqual(result.status, 0);
      assert.match(result.stdout, /message line 3 must include a review note explanation/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

});
