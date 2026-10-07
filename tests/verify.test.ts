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

/** Capture the fixture branch and local work in a source patch on disk. */
function writeSourcePatch(repo: string, root: string): string {
  const sourceFile = path.join(root, "source.patch");
  fs.writeFileSync(sourceFile, `${runCli(repo, "capture", "main")}\n`);
  return sourceFile;
}

/** Build an alternative history from a detached worktree and return its final commit. */
function createTargetHistory(repo: string, root: string, base: string, name: string,
  author: (worktree: string) => void): string {
  const worktree = path.join(root, name);
  runGit(repo, "worktree", "add", "-q", "--detach", worktree, base);
  try {
    author(worktree);
    return runGit(worktree, "rev-parse", "HEAD");
  } finally {
    runGit(repo, "worktree", "remove", "--force", worktree);
  }
}

/** Stage every target-worktree change and create one proposed commit. */
function commitAll(repo: string, subject: string, body = ""): void {
  runGit(repo, "add", "-A");
  runGit(repo, "commit", "-q", "--cleanup=strip", "-m", subject,
    ...(body ? ["-m", body] : []));
}

/** Create a valid two-commit target with file guidance and an executable file. */
function createCompleteTarget(target: string, firstFile = "tracked.txt"): void {
  fs.appendFileSync(path.join(target, "tracked.txt"), "alpha\n");
  fs.writeFileSync(path.join(target, "tool.sh"), "#!/bin/sh\necho ready\n");
  if (process.platform !== "win32") fs.chmodSync(path.join(target, "tool.sh"), 0o755);
  commitAll(target, "Add the first review stop", [
    "Introduce the complete workflow before its follow-up detail.",
    "",
    "- Preserve this ordinary list item as prose.",
    "",
    `\`${firstFile}\``,
    "-".repeat(firstFile.length + 2),
    "",
    "This value establishes the boundary used by the next stop.",
    "",
    "- `trackedValue` gives the follow-up stop an established boundary.",
  ].join("\n"));
  fs.appendFileSync(path.join(target, "tracked.txt"), "beta\n");
  commitAll(target, "Add the follow-up value", [
    "`tracked.txt`",
    "-".repeat("tracked.txt".length + 2),
    "",
    "Extend the established boundary with the follow-up value.",
  ].join("\n"));
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

  test("checks selected commits and optionally matches a source patch", () => {
    const root = createTemporaryDirectory("commits-guide-verify-");
    try {
      const repo = createRepository(path.join(root, "repo"));
      runGit(repo, "switch", "-q", "-c", "feature");
      fs.appendFileSync(path.join(repo, "tracked.txt"), "alpha\nbeta\n");
      fs.writeFileSync(path.join(repo, "tool.sh"), "#!/bin/sh\necho ready\n");
      if (process.platform !== "win32") fs.chmodSync(path.join(repo, "tool.sh"), 0o755);
      const sourceHead = runGit(repo, "rev-parse", "HEAD");
      const sourceStatus = runGit(repo, "status", "--porcelain=v1", "--untracked-files=all");
      const sourceFile = writeSourcePatch(repo, root);

      const target = createTargetHistory(repo, root, "main", "complete", createCompleteTarget);
      const rendered = runCli(repo, "verify", `main..${target}`, "--source", sourceFile);
      assert.match(rendered, /^✅ [0-9a-f]{7} Add the first review stop$/m);
      assert.match(rendered, /^✅ [0-9a-f]{7} Add the follow-up value$/m);
      assert.match(rendered, /^✅ Source matches target$/m);
      assert.match(runGit(repo, "ls-tree", target, "tool.sh"),
        process.platform === "win32" ? /^100644 blob / : /^100755 blob /);

      const range = runCli(repo, "verify", `main..${target}`);
      assert.doesNotMatch(range, /Source matches target/);
      const one = runCli(repo, "verify", target);
      assert.match(one, /^✅ [0-9a-f]{7} Add the follow-up value$/m);
      assert.doesNotMatch(one, /Add the first review stop/);

      const implicitRange = runCommand(cli, ["verify", target, "--source", sourceFile], { cwd: repo });
      assert.notEqual(implicitRange.status, 0);
      assert.match(implicitRange.stderr, /--source requires an explicit <base>..<target> range/);

      const invalidFile = createTargetHistory(repo, root, "main", "invalid-file",
        (worktree) => createCompleteTarget(worktree, "missing.txt"));
      const rejectedFile = runCommand(cli, ["verify", `main..${invalidFile}`], { cwd: repo });
      assert.notEqual(rejectedFile.status, 0);
      assert.match(rejectedFile.stdout, /^❌ [0-9a-f]{7} Add the first review stop$/m);
      assert.match(rejectedFile.stdout, /must identify one changed file/);

      const incomplete = createTargetHistory(repo, root, "main", "incomplete", (worktree) => {
        fs.appendFileSync(path.join(worktree, "tracked.txt"), "alpha\n");
        commitAll(worktree, "Omit part of the source");
      });
      const rejectedTree = runCommand(cli, ["verify", `main..${incomplete}`, "--source", sourceFile], {
        cwd: repo,
      });
      assert.notEqual(rejectedTree.status, 0);
      assert.match(rejectedTree.stdout, /^❌ Source matches target$/m);
      assert.match(rejectedTree.stdout, /does not reproduce the source tree/);

      assert.equal(runGit(repo, "for-each-ref", "--format=%(refname)", "refs/heads/commits-guide"), "");
      assert.equal(runGit(repo, "rev-parse", "feature"), sourceHead);
      assert.equal(runGit(repo, "status", "--porcelain=v1", "--untracked-files=all"), sourceStatus);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a source patch captured from another base", () => {
    const root = createTemporaryDirectory("commits-guide-verify-base-");
    try {
      const repo = createRepository(path.join(root, "repo"));
      runGit(repo, "switch", "-q", "-c", "feature");
      fs.appendFileSync(path.join(repo, "tracked.txt"), "feature\n");
      const sourceFile = writeSourcePatch(repo, root);

      const tree = runGit(repo, "rev-parse", "main^{tree}");
      const alternate = runCommand("git", ["commit-tree", tree], {
        cwd: repo,
        stdin: "alternate base\n",
      }).stdout.trim();
      const target = createTargetHistory(repo, root, alternate, "other-base", (worktree) => {
        fs.appendFileSync(path.join(worktree, "tracked.txt"), "feature\n");
        commitAll(worktree, "Add feature");
      });
      const verified = runCommand(cli, ["verify", `${alternate}..${target}`, "--source", sourceFile], {
        cwd: repo,
      });
      assert.notEqual(verified.status, 0);
      assert.match(verified.stdout, /^❌ Source matches target$/m);
      assert.match(verified.stdout, /range base does not match the source patch base/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
