#!/usr/bin/env node

import {
  findRepositoryRoot,
  listCommits,
  readCommit,
  resolveCommit,
} from "./git.js";
import { validateMessage } from "./message-format.js";

function exitWithUsage(status = 2): never {
  const stream = status === 0 ? process.stdout : process.stderr;
  stream.write(`usage:
  commits-guide verify <revision-or-range>
`);
  process.exit(status);
}

function runVerify(args: string[]): void {
  if (args.length !== 1) exitWithUsage();
  const [revision] = args;
  const repo = findRepositoryRoot();
  const commitIds = revision.includes("..")
    ? listCommits(repo, revision)
    : [resolveCommit(repo, revision)];

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
  process.stdout.write(`${output.join("\n")}\n`);
  if (results.some(({ errors }) => errors.length)) process.exitCode = 1;
}

function runCli(): void {
  const [command = "help", ...args] = process.argv.slice(2);
  switch (command) {
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
