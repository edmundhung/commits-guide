import { spawnSync } from "node:child_process";

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

type CommitDetails = {
  commit: string;
  parent: string;
  message: string;
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

function listCommits(repo: string, revision: string): string[] {
  return executeGit(repo, [
    "rev-list", "--reverse", "--topo-order", revision,
  ]).stdout.trimEnd().split("\n").filter(Boolean);
}

function hashEmptyTree(repo: string): string {
  return executeGit(repo, ["hash-object", "-t", "tree", "--stdin"], {
    stdin: "",
  }).stdout.trimEnd();
}

function readCommit(repo: string, ref: string): CommitDetails {
  const [commit, parent] = executeGit(repo, [
    "rev-list", "--parents", "-n1", ref,
  ]).stdout.trimEnd().split(" ");
  const message = executeGit(repo, ["show", "-s", "--format=%B", commit]).stdout.trimEnd();
  return { commit, parent: parent ?? hashEmptyTree(repo), message };
}

function listChangedFiles(repo: string, parent: string, commit: string): string[] {
  return executeGit(repo, [
    "diff", "--name-only", "-z", parent, commit,
  ]).stdout.split("\0").filter(Boolean);
}

export {
  findRepositoryRoot,
  listChangedFiles,
  listCommits,
  readCommit,
  resolveCommit,
};
