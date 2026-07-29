---
title: "Create a Home for the First Local Problem"
free: true
---

We can now implement the `sqli-demo` design in TenkaCloudChallenge. This chapter prepares the repository and creates the directory required by a local problem.

## Prepare the Repository

```bash
git clone https://github.com/susumutomita/TenkaCloudChallenge.git
cd TenkaCloudChallenge
make install
```

`make install` is the dependency installation command defined by this repository.

Before editing a problem, read `AGENT.md` at the repository root.

```bash
less AGENT.md
```

`AGENT.md` defines the contract for problem authors. For a local problem, pay particular attention to these requirements:

- `metadata.json` must conform to `SCHEMA.json`
- `runtime.entry` must point to an existing Compose file
- The target application and scoring `/verify` endpoint must be separate
- Published ports must be limited to loopback
- The flag must be derived from a secret unique to each run
- Both English and Japanese README files must exist

## Directory for a Local Challenge

Challenges live under `challenges/`. Create these files for `sqli-demo`:

```text
challenges/sqli-demo/
├── metadata.json
├── README.md
├── README.ja.md
└── local/
    ├── Dockerfile
    ├── docker-compose.yml
    └── app/
        └── server.mjs
```

Each file has a distinct role.

| File | Role |
| --- | --- |
| `metadata.json` | Participant text, Docker startup information, scoring, and hints |
| `local/docker-compose.yml` | Container, environment variables, ports, and health check |
| `local/Dockerfile` | Image for the problem application |
| `local/app/server.mjs` | Target web page and scoring `/verify` endpoint |
| `README.md` | English documentation for authors and users |
| `README.ja.md` | Japanese version of the README |

Do not create the `template.yaml` used by AWS problems yet. The Dockerfile and Compose file provide the environment for this local problem.

## Start from an Empty Directory

Rather than copying the completed `sqli-demo`, we create each required file from the design in the previous chapters.

Start with the problem directory:

```bash
mkdir -p challenges/sqli-demo/local/app
```

The next chapter creates `metadata.json`. The chapter after that creates the Dockerfile, Compose file, and `server.mjs`. Finish the README files only after the environment, scoring, and safety boundary are stable.

The final result will have the same structure as the public implementation:

[Completed sqli-demo](https://github.com/susumutomita/TenkaCloudChallenge/tree/main/challenges/sqli-demo)

## Using Claude Code

TenkaCloudChallenge includes a `new-problem` skill for Claude Code. Start a local Challenge scaffold with:

```text
/new-problem challenge
```

When asked for a scoring method, choose `verify`. Provide the topic, intended participant takeaway, and story decided in the previous chapters.

The skill helps create the directory and required fields. It does not decide the competition content for you. This book still explains every generated field so you understand the result.

The human-facing guide and the instructions read by Claude Code are available here:

- [Using new-problem](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/.claude/skills/new-problem/README.md)
- [new-problem authoring workflow](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/.claude/skills/new-problem/SKILL.md)

The next chapter writes the story, win condition, and safety boundary into `metadata.json`.
