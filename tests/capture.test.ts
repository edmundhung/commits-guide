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

/** Stage every fixture change and create one source-history commit. */
function commitAll(repo: string, subject: string, body = ""): void {
  runGit(repo, "add", "-A");
  runGit(repo, "commit", "-q", "-m", subject, ...(body ? ["-m", body] : []));
}

/** Read index entries together with assume-unchanged and skip-worktree flags. */
function readIndexState(repo: string): string {
  return runGit(repo, "-c", "core.quotePath=true", "ls-files", "--stage", "-v", "-f", "--debug");
}

/** Read the ordered commit IDs from the `From` markers in a Git mail patch. */
function parseSourceCommits(patch: string): string[] {
  return [...patch.matchAll(/^From ([0-9a-f]{40}) Mon Sep 17 00:00:00 2001$/gm)]
    .map((match) => match[1]);
}

/** Run capture at HEAD and return the synthetic commit that records local work. */
function captureWorkingTree(repo: string): string {
  const commits = parseSourceCommits(runCli(repo, "capture", "HEAD"));
  assert.ok(commits.length > 0);
  return commits.at(-1)!;
}

describe("capture", () => {
  test("captures local work without changing the checkout", () => {
    const root = createTemporaryDirectory("commits-guide-capture-local-");
    try {
      const repo = createRepository(path.join(root, "repo"));
      fs.writeFileSync(path.join(repo, "staged.txt"), "staged\n");
      runGit(repo, "add", "staged.txt");
      fs.appendFileSync(path.join(repo, "tracked.txt"), "unstaged\n");
      fs.writeFileSync(path.join(repo, "untracked.txt"), "untracked\n");
      fs.writeFileSync(path.join(repo, ".gitignore"), "*.log\n");
      runGit(repo, "add", ".gitignore");
      fs.writeFileSync(path.join(repo, "ignored.log"), "ignored\n");
      fs.writeFileSync(path.join(repo, "intent.txt"), "");
      runGit(repo, "add", "-N", "intent.txt");
      const sourceHead = runGit(repo, "rev-parse", "HEAD");
      const before = {
        head: sourceHead,
        index: readIndexState(repo),
        status: runGit(repo, "status", "--porcelain=v1", "--untracked-files=all"),
      };

      const sourceCommit = captureWorkingTree(repo);

      assert.equal(runGit(repo, "rev-parse", "HEAD"), before.head);
      assert.equal(readIndexState(repo), before.index);
      assert.equal(runGit(repo, "status", "--porcelain=v1", "--untracked-files=all"), before.status);
      for (const file of ["tracked.txt", "staged.txt", "untracked.txt"]) {
        assert.equal(runGit(repo, "hash-object", file),
          runGit(repo, "rev-parse", `${sourceCommit}:${file}`));
      }
      assert.throws(() => runGit(repo, "cat-file", "-e", `${sourceCommit}:ignored.log`));
      assert.equal(runGit(repo, "rev-parse", `${sourceCommit}^`), sourceHead);
      assert.equal(runGit(repo, "show", "-s", "--format=%B", sourceCommit),
        "Capture uncommitted changes");
      assert.equal(runGit(repo, "show", "-s", "--format=%an <%ae>", sourceCommit),
        "Commits Guide Test <commits-guide-test@invalid>");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("preserves ordered commits and their messages", () => {
    const root = createTemporaryDirectory("commits-guide-capture-history-");
    try {
      const repo = createRepository(path.join(root, "repo"));
      runGit(repo, "switch", "-q", "-c", "feature");
      fs.appendFileSync(path.join(repo, "tracked.txt"), "moved behavior\n");
      commitAll(repo, "Move behavior into shared code",
        "The implementation moves from the consumer into the shared package.");
      const first = runGit(repo, "rev-parse", "HEAD");
      fs.appendFileSync(path.join(repo, "tracked.txt"), "forward cancellation\n");
      commitAll(repo, "Forward cancellation",
        "This follow-up changes the boundary without changing the moved behavior.");
      const second = runGit(repo, "rev-parse", "HEAD");

      const patch = runCli(repo, "capture", "main");
      assert.deepEqual(parseSourceCommits(patch), [first, second]);
      assert.ok(patch.indexOf("Subject: [PATCH 1/2] Move behavior into shared code") <
        patch.indexOf("Subject: [PATCH 2/2] Forward cancellation"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("captures content hidden by index flags", () => {
    const root = createTemporaryDirectory("commits-guide-capture-flags-");
    try {
      for (const [flag, undo] of [["--assume-unchanged", "--no-assume-unchanged"],
        ["--skip-worktree", "--no-skip-worktree"]]) {
        const repo = createRepository(path.join(root, flag.slice(2)));
        runGit(repo, "update-index", flag, "flagged.txt");
        fs.writeFileSync(path.join(repo, "flagged.txt"), `${flag}\n`);
        const sourceCommit = captureWorkingTree(repo);
        assert.equal(runGit(repo, "hash-object", "flagged.txt"),
          runGit(repo, "rev-parse", `${sourceCommit}:flagged.txt`));
        runGit(repo, "update-index", undo, "flagged.txt");
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects worktree states it cannot represent", () => {
    const root = createTemporaryDirectory("commits-guide-capture-reject-");
    try {
      const sparse = createRepository(path.join(root, "sparse"));
      runGit(sparse, "config", "core.sparseCheckout", "true");
      assert.throws(() => captureWorkingTree(sparse), /sparse checkout/);

      const conflict = createRepository(path.join(root, "conflict"));
      runGit(conflict, "switch", "-q", "-c", "side");
      fs.writeFileSync(path.join(conflict, "tracked.txt"), "side\n");
      commitAll(conflict, "side");
      runGit(conflict, "switch", "-q", "main");
      fs.writeFileSync(path.join(conflict, "tracked.txt"), "main\n");
      commitAll(conflict, "main");
      assert.notEqual(runCommand("git", ["merge", "-q", "side"], { cwd: conflict }).status, 0);
      assert.throws(() => captureWorkingTree(conflict), /merge conflicts/);

      const dependency = createRepository(path.join(root, "dependency"));
      const superproject = createRepository(path.join(root, "superproject"));
      runGit(superproject, "-c", "protocol.file.allow=always", "submodule", "add", "-q",
        dependency, "dependency");
      commitAll(superproject, "add dependency");
      fs.appendFileSync(path.join(superproject, "dependency", "tracked.txt"), "dirty\n");
      assert.throws(() => captureWorkingTree(superproject), /uncommitted changes inside submodules/);

      const embedded = createRepository(path.join(root, "embedded"));
      createRepository(path.join(embedded, "nested"));
      assert.throws(() => captureWorkingTree(embedded), /embedded Git repositories/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a base outside the current history", () => {
    const root = createTemporaryDirectory("commits-guide-capture-ancestor-");
    try {
      const repo = createRepository(path.join(root, "repo"));
      const tree = runGit(repo, "rev-parse", "HEAD^{tree}");
      const unrelated = runCommand("git", ["commit-tree", tree], {
        cwd: repo,
        stdin: "unrelated start\n",
      }).stdout.trim();
      const captured = runCommand(cli, ["capture", unrelated], { cwd: repo });
      assert.notEqual(captured.status, 0);
      assert.match(captured.stderr, /review start must be an ancestor of HEAD/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects merge history", () => {
    const root = createTemporaryDirectory("commits-guide-capture-merge-");
    try {
      const repo = createRepository(path.join(root, "repo"));
      const base = runGit(repo, "rev-parse", "HEAD");
      runGit(repo, "switch", "-q", "-c", "side");
      fs.writeFileSync(path.join(repo, "side.txt"), "side\n");
      commitAll(repo, "Add side");
      runGit(repo, "switch", "-q", "main");
      fs.writeFileSync(path.join(repo, "main.txt"), "main\n");
      commitAll(repo, "Add main");
      runGit(repo, "merge", "-q", "--no-ff", "side", "-m", "Merge side");

      const captured = runCommand(cli, ["capture", base], { cwd: repo });
      assert.notEqual(captured.status, 0);
      assert.match(captured.stderr, /history containing merges/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
