# Commits Guide

Commits Guide helps coding agents turn Git changes into a clear review tour. Commit order guides the reviewer through the code, while messages explain the design and preserve useful context.

## Workflow

```sh
npx commits-guide capture main > source.patch
# The agent creates or reorganizes commits with ordinary Git commands.
```

`capture` records commits and local changes after the chosen base as a standard Git patch series. Read that series for the original intent before reorganizing the branch. The checkout, staged content, and working files remain unchanged.

## Verify review notes

To check existing commit messages, pass one revision or a Git range:

```sh
npx commits-guide verify HEAD
npx commits-guide verify main..HEAD
```

`verify` checks optional file notes against the files changed by each selected commit. See the [message format](skills/commits-guide/references/message-format.md) for the portable review guidance stored in each commit.

## Development

```sh
npm test
```
