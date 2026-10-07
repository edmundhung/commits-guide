# Commits Guide

Commits Guide helps coding agents turn Git changes into a clear review tour. Commit order guides the reviewer through the code, while concise messages preserve context the diff cannot show.

## Setup

```sh
npx commits-guide setup
```

This copies the bundled skill into supported clients. Then ask your agent to use Commits Guide when creating commits or preparing a branch for review. The CLI examples use `npx`, so it needs no separate installation.

## Workflow

```sh
npx commits-guide capture main > source.patch
# The agent creates or reorganizes commits with ordinary Git commands.
npx commits-guide verify main..HEAD --source source.patch
```

`capture` records commits and local changes after the chosen base as a standard Git patch series. `verify` checks the commits selected by the revision or range; `--source` also confirms that the range starts at the captured base and produces the captured final files.

To check existing commit messages without a source patch, pass one revision or a Git range:

```sh
npx commits-guide verify HEAD
npx commits-guide verify main..HEAD
```

`capture` leaves the checkout unchanged. See the [message format](skills/commits-guide/references/message-format.md) for the portable review guidance stored in each commit.

## Development

```sh
npm test
```
