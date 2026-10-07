import fs from "node:fs";
import path from "node:path";

type ParsedArgs = {
  positionals: string[];
  options: Map<string, string>;
};

function parseArgs(args: string[]): ParsedArgs | undefined {
  const positionals: string[] = [];
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument.startsWith("--")) {
      const name = argument.slice(2);
      const value = args[index + 1];
      if (!name || value === undefined || options.has(name)) return undefined;
      options.set(name, value);
      index += 1;
    } else if (argument.startsWith("-")) {
      return undefined;
    } else {
      positionals.push(argument);
    }
  }
  return { positionals, options };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function replaceDirectory(source: string, destination: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
}

export { formatError, parseArgs, replaceDirectory };
