#!/usr/bin/env node

import {
  captureSource,
  findRepositoryRoot,
  isAncestor,
  listMergeCommits,
  readCommitTree,
  resolveCommit,
  writePatchSeries,
} from "./git.js";

function exitWithUsage(status = 2): never {
  const stream = status === 0 ? process.stdout : process.stderr;
  stream.write(`usage:
  commits-guide capture <ref>
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

function runCli(): void {
  const [command = "help", ...args] = process.argv.slice(2);
  switch (command) {
    case "capture": runCapture(args); break;
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
