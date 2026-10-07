import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.cwd();
const cli = path.join(projectRoot, "dist", "commits-guide.js");
const emptyGitConfig = path.join(os.tmpdir(), "commits-guide-tests-empty.gitconfig");
fs.writeFileSync(emptyGitConfig, "");
const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: emptyGitConfig,
};

type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  shell?: boolean;
};

/** Run the built JavaScript entry point through Node while leaving native commands unchanged. */
function resolveInvocation(command: string, args: string[]) {
  return command === cli
    ? { command: process.execPath, args: [cli, ...args] }
    : { command, args };
}

/** Run a test process with an isolated Git configuration and return its complete result. */
function runCommand(command: string, args: string[], options: RunOptions = {}) {
  const invocation = resolveInvocation(command, args);
  return spawnSync(invocation.command, invocation.args, {
    cwd: options.cwd,
    env: { ...gitEnv, ...options.env },
    input: options.stdin,
    encoding: "utf8",
    shell: options.shell,
  });
}

/** Run a command successfully and return its standard output without the final newline. */
function readCommandOutput(command: string, args: string[], options: RunOptions = {}): string {
  const result = runCommand(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout).trim() || `${command} failed`);
  }
  return result.stdout.trimEnd();
}

/** Run Git inside a fixture repository and return its standard output. */
function runGit(repo: string, ...args: string[]): string {
  return readCommandOutput("git", args.flat(), { cwd: repo });
}

/** Create a uniquely named temporary directory for one test fixture. */
function createTemporaryDirectory(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Create a deterministic Git repository with one base commit and no user hooks or signing. */
function createRepository(root: string): string {
  fs.mkdirSync(root, { recursive: true });
  runGit(root, "init", "-q");
  runGit(root, "config", "user.name", "Commits Guide Test");
  runGit(root, "config", "user.email", "commits-guide-test@invalid");
  runGit(root, "config", "commit.gpgSign", "false");
  runGit(root, "config", "tag.gpgSign", "false");
  const hooks = path.join(root, ".git-hooks");
  fs.mkdirSync(hooks);
  runGit(root, "config", "core.hooksPath", hooks);
  runGit(root, "config", "maintenance.auto", "false");
  runGit(root, "config", "gc.auto", "0");
  fs.writeFileSync(path.join(root, "tracked.txt"), "base\n");
  fs.writeFileSync(path.join(root, "flagged.txt"), "flags\n");
  runGit(root, "add", "tracked.txt", "flagged.txt");
  runGit(root, "commit", "-q", "-m", "base");
  runGit(root, "branch", "-M", "main");
  return root;
}

/** Run the built CLI successfully inside a fixture repository and return its output. */
function runCli(repo: string, ...args: string[]): string {
  return readCommandOutput(cli, args.flat(), { cwd: repo });
}

export {
  cli,
  createRepository,
  createTemporaryDirectory,
  gitEnv,
  projectRoot,
  readCommandOutput,
  runCli,
  runCommand,
  runGit,
};

export type { RunOptions };
