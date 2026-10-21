# Commits Guide

Commits Guide helps coding agents turn Git changes into a clear review tour. Commit order guides the reviewer through the code, while messages explain the design and preserve useful context.

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
