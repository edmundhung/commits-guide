import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type GitOptions = {
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  stdout?: "pipe" | "inherit";
  allowedStatuses?: readonly number[];
};

type GitResult = {
  status: number;
  stdout: string;
  stderr: string;
};

type CapturedSource = {
  commit: string;
  tree: string;
};

function executeGit(cwd: string, args: string[], options: GitOptions = {}): GitResult {
  const result = spawnSync("git", args, {
    cwd,
    env: options.env || process.env,
    input: options.stdin,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", options.stdout ?? "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  const status = result.status ?? 1;
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (!(options.allowedStatuses ?? [0]).includes(status)) {
    const detail = (stderr || stdout).trim();
    throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return { status, stdout, stderr };
}

function findRepositoryRoot(cwd = process.cwd()): string {
  return executeGit(cwd, ["rev-parse", "--show-toplevel"]).stdout.trimEnd();
}

function resolveCommit(repo: string, ref: string): string {
  return executeGit(repo, ["rev-parse", "--verify", `${ref}^{commit}`]).stdout.trimEnd();
}

function readCommitTree(repo: string, commit: string): string {
  return executeGit(repo, ["rev-parse", `${commit}^{tree}`]).stdout.trimEnd();
}

function isAncestor(repo: string, ancestor: string, descendant: string): boolean {
  return executeGit(repo, ["merge-base", "--is-ancestor", ancestor, descendant], {
    allowedStatuses: [0, 1],
  }).status === 0;
}

function listMergeCommits(repo: string, start: string, end: string): string[] {
  const output = executeGit(repo, [
    "rev-list", "--min-parents=2", `${start}..${end}`,
  ]).stdout.trimEnd();
  return output ? output.split("\n") : [];
}

function usesSparseCheckout(repo: string): boolean {
  const readBoolean = (name: string) => executeGit(repo, ["config", "--bool", name], {
    allowedStatuses: [0, 1],
  }).stdout.trim() === "true";
  return readBoolean("core.sparseCheckout") || readBoolean("index.sparse");
}

function hasUnmergedFiles(repo: string): boolean {
  return Boolean(executeGit(repo, ["ls-files", "--unmerged"]).stdout.trimEnd());
}

function listDirtySubmodules(repo: string): string[] {
  const output = executeGit(repo, [
    "submodule", "foreach", "--quiet", "--recursive",
    'if test -n "$(git status --porcelain=v1 --untracked-files=all)"; then printf "%s\\n" "$displaypath"; fi',
  ]).stdout.trimEnd();
  return output ? output.split("\n") : [];
}
function listGitlinks(repo: string, env?: NodeJS.ProcessEnv): string[] {
  // Git records both submodules and embedded repositories as mode 160000.
  return executeGit(repo, ["ls-files", "--stage", "-z"], { env }).stdout
    .split("\0")
    .flatMap((record) => {
      const match = record.match(/^160000 [0-9a-f]+ \d+\t(.*)$/s);
      return match ? [match[1]] : [];
    });
}

function loadCommitIntoIndex(repo: string, commit: string, env: NodeJS.ProcessEnv): void {
  executeGit(repo, ["read-tree", commit], { env });
}

function stageWorktree(repo: string, env: NodeJS.ProcessEnv): void {
  executeGit(repo, ["add", "-A", "--", "."], { env });
}

function writeIndexTree(repo: string, env: NodeJS.ProcessEnv): string {
  return executeGit(repo, ["write-tree"], { env }).stdout.trimEnd();
}

function createCommit(repo: string, tree: string, parent: string, message: string): string {
  return executeGit(repo, ["commit-tree", tree, "-p", parent], {
    stdin: `${message}\n`,
  }).stdout.trimEnd();
}

function captureWorktreeTree(repo: string, sourceHead: string): string {
  // Point Git at a disposable index, seed it from HEAD, then stage the worktree into that index.
  // This includes staged, unstaged, and untracked files while leaving the user's index untouched.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "commits-guide-index-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(directory, "index") };
  try {
    loadCommitIntoIndex(repo, sourceHead, env);
    stageWorktree(repo, env);

    const originalGitlinks = new Set(listGitlinks(repo));
    const embedded = listGitlinks(repo, env).filter((file) => !originalGitlinks.has(file));
    if (embedded.length) {
      throw new Error(`cannot capture embedded Git repositories:\n${embedded.join("\n")}`);
    }
    return writeIndexTree(repo, env);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function captureSource(repo: string, sourceHead: string): CapturedSource {
  // A normal `git add -A` cannot see omitted sparse-checkout files, so capturing them could record
  // false deletions.
  if (usesSparseCheckout(repo)) {
    throw new Error(
      "cannot capture a sparse checkout because files outside the checkout may look deleted",
    );
  }
  if (hasUnmergedFiles(repo)) {
    throw new Error("cannot capture a worktree with unresolved merge conflicts");
  }
  const dirtySubmodules = listDirtySubmodules(repo);
  if (dirtySubmodules.length) {
    throw new Error(
      `cannot capture uncommitted changes inside submodules:\n${dirtySubmodules.join("\n")}`,
    );
  }

  const tree = captureWorktreeTree(repo, sourceHead);
  const headTree = readCommitTree(repo, sourceHead);
  if (tree === headTree) return { commit: sourceHead, tree };
  // `commit-tree` gives format-patch a real final commit without updating any branch.
  const commit = createCommit(repo, tree, sourceHead, "Capture uncommitted changes");
  return { commit, tree };
}

function writePatchSeries(repo: string, start: string, tip: string): void {
  executeGit(repo, [
    "format-patch",
    "--stdout",
    "--binary",
    "--no-signature",
    `--base=${start}`,
    `${start}..${tip}`,
  ], { stdout: "inherit" });
}

export {
  captureSource,
  findRepositoryRoot,
  isAncestor,
  listMergeCommits,
  readCommitTree,
  resolveCommit,
  writePatchSeries,
};
