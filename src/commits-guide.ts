#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  captureSource,
  findRepositoryRoot,
  isAncestor,
  listCommits,
  listMergeCommits,
  readCommit,
  readCommitTree,
  readSourcePatch,
  resolveCommit,
  treesMatch,
  writePatchSeries,
} from "./git.js";
import { validateMessage } from "./message-format.js";
import { formatError, parseArgs, replaceDirectory } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clients = [".agents", ".claude"] as const;

function exitWithUsage(status = 2): never {
  const stream = status === 0 ? process.stdout : process.stderr;
  stream.write(`usage:
  commits-guide setup
  commits-guide capture <ref>
  commits-guide verify <revision-or-range>
  commits-guide verify <base>..<target> --source <source.patch>
`);
  process.exit(status);
}

function runCapture(args: string[]): void {
  if (args.length !== 1) exitWithUsage();
  const [baseRef] = args;

  const repo = findRepositoryRoot();
  const sourceHead = resolveCommit(repo, "HEAD");
  const start = resolveCommit(repo, baseRef);
  // The patch must describe one linear path from the user's boundary to the current state.
  if (!isAncestor(repo, start, sourceHead)) {
    throw new Error("review start must be an ancestor of HEAD");
  }
  if (listMergeCommits(repo, start, sourceHead).length) {
    throw new Error("cannot capture history containing merges; choose a base after the last merge");
  }

  const source = captureSource(repo, sourceHead);
  const startTree = readCommitTree(repo, start);
  if (source.tree === startTree) {
    throw new Error("source state contains no changes after the review start");
  }

  writePatchSeries(repo, start, source.commit);
}

function runVerify(args: string[]): void {
  const parsed = parseArgs(args);
  if (!parsed || parsed.positionals.length !== 1 ||
      [...parsed.options.keys()].some((name) => name !== "source")) {
    exitWithUsage();
  }
  const [revision] = parsed.positionals;
  const sourceOption = parsed.options.get("source");
  const sourceFile = sourceOption ? path.resolve(sourceOption) : undefined;
  const repo = findRepositoryRoot();
  if (sourceFile && !fs.existsSync(sourceFile)) {
    throw new Error(`source patch does not exist: ${sourceFile}`);
  }

  const sourceErrors: string[] = [];
  let commitIds: string[];
  if (sourceFile) {
    const range = revision.split("..");
    if (range.length !== 2 || range.some((ref) => !ref) || revision.includes("...")) {
      throw new Error("--source requires an explicit <base>..<target> range");
    }
    const [baseRef, targetRef] = range;
    const source = readSourcePatch(sourceFile);
    const base = resolveCommit(repo, baseRef);
    const target = resolveCommit(repo, targetRef);
    // Matching the explicit range base prevents a caller from comparing equivalent trees while
    // silently changing where the captured history begins.
    if (base !== source.base) {
      sourceErrors.push("range base does not match the source patch base");
    }
    if (!isAncestor(repo, source.base, target)) {
      sourceErrors.push("target does not descend from the source base");
    }

    let sourceTip: string;
    try {
      sourceTip = resolveCommit(repo, source.tip);
    } catch {
      throw new Error("source patch final commit is unavailable; run capture again");
    }
    if (!treesMatch(repo, sourceTip, target)) {
      sourceErrors.push("target does not reproduce the source tree");
    }
    commitIds = listCommits(repo, revision);
  } else if (revision.includes("..")) {
    commitIds = listCommits(repo, revision);
  } else {
    commitIds = [resolveCommit(repo, revision)];
  }

  const results = commitIds.map((commit) => {
    const verified = readCommit(repo, commit);
    return {
      ...verified,
      errors: validateMessage(repo, verified.message, verified.parent, verified.commit),
    };
  });
  const output = results.flatMap(({ commit, message, errors }) => [
    `${errors.length ? "❌" : "✅"} ${commit.slice(0, 7)} ${message.split("\n", 1)[0]}`,
    ...errors.map((error) => `   - ${error}`),
  ]);
  if (sourceFile) {
    output.push(
      `${sourceErrors.length ? "❌" : "✅"} Source matches target`,
      ...sourceErrors.map((error) => `   - ${error}`),
    );
  }
  process.stdout.write(`${output.join("\n")}\n`);
  if (sourceErrors.length || results.some(({ errors }) => errors.length)) process.exitCode = 1;
}

function runSetup(args: string[]): void {
  if (args.length) exitWithUsage();

  const source = path.resolve(__dirname, "..", "skills", "commits-guide");
  const destinations = clients.map((client) =>
    path.join(os.homedir(), client, "skills", "commits-guide"));
  const installed: string[] = [];
  const skipped: { destination: string; error: unknown }[] = [];

  // Client locations are independent: one unavailable client should not block the others.
  for (const destination of destinations) {
    try {
      replaceDirectory(source, destination);
      installed.push(destination);
    } catch (error) {
      skipped.push({ destination, error });
    }
  }

  if (!installed.length) {
    throw new Error(`cannot install the skill:\n${skipped.map(({ destination, error }) =>
      `- ${destination}: ${formatError(error)}`).join("\n")}`);
  }

  process.stdout.write(`Commits Guide is ready.\nSkills:\n${installed.map(
    (destination) => `- ${destination}`,
  ).join("\n")}\n`);
  if (skipped.length) {
    process.stdout.write(`Skipped skill locations:\n${skipped.map(({ destination, error }) =>
      `- ${destination}: ${formatError(error)}`).join("\n")}\n`);
  }
}

function runCli(): void {
  const [command = "help", ...args] = process.argv.slice(2);
  switch (command) {
    case "setup": runSetup(args); break;
    case "capture": runCapture(args); break;
    case "verify": runVerify(args); break;
    case "help":
    case "-h":
    case "--help": exitWithUsage(0); break;
    default: exitWithUsage();
  }
}

try {
  runCli();
} catch (error: unknown) {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
