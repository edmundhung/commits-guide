import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { cli, createTemporaryDirectory, runCommand } from "./helpers.ts";

/** Point home-directory discovery at an isolated setup fixture on every platform. */
function createSetupEnvironment(home: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    USERPROFILE: home,
  };
}

describe("setup", () => {
  test("installs and updates the bundled skill", () => {
    const root = createTemporaryDirectory("commits-guide-setup-");
    try {
      const home = path.join(root, "home");
      fs.mkdirSync(home, { recursive: true });
      const env = createSetupEnvironment(home);

      const installed = runCommand(cli, ["setup"], { cwd: root, env });
      assert.equal(installed.status, 0, installed.stderr);
      assert.match(installed.stdout, /Commits Guide is ready/);

      const skills = [".agents", ".claude"].map((client) =>
        path.join(home, client, "skills", "commits-guide"));

      for (const skill of skills) {
        assert.equal(fs.existsSync(path.join(skill, "SKILL.md")), true);
      }
      fs.writeFileSync(path.join(skills[0], "stale.txt"), "stale\n");
      assert.equal(runCommand(cli, ["setup"], { cwd: root, env }).status, 0);
      assert.equal(fs.existsSync(path.join(skills[0], "stale.txt")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("skips unavailable client directories before installing", () => {
    const root = createTemporaryDirectory("commits-guide-setup-partial-");
    try {
      const home = path.join(root, "home");
      fs.mkdirSync(home, { recursive: true });
      fs.writeFileSync(path.join(home, ".agents"), "blocked\n");
      const env = createSetupEnvironment(home);

      const installed = runCommand(cli, ["setup"], { cwd: root, env });
      assert.equal(installed.status, 0, installed.stderr);
      assert.match(installed.stdout, /Skipped skill locations:/);
      assert.equal(fs.existsSync(
        path.join(home, ".claude", "skills", "commits-guide", "SKILL.md"),
      ), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails when no client directory is available", () => {
    const root = createTemporaryDirectory("commits-guide-setup-blocked-");
    try {
      const home = path.join(root, "home");
      fs.mkdirSync(home, { recursive: true });
      for (const client of [".agents", ".claude"]) {
        fs.writeFileSync(path.join(home, client), "blocked\n");
      }
      const env = createSetupEnvironment(home);

      const installed = runCommand(cli, ["setup"], { cwd: root, env });
      assert.notEqual(installed.status, 0);
      assert.match(installed.stderr, /cannot install the skill/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
