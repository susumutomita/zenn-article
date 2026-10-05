---
title: "Create a New Problem from Your Own Idea"
free: true
---

You built a Docker-based local Challenge, an AWS Challenge, and an AWS Battle from scratch. This final chapter turns that process into a repeatable way to add your own idea to TenkaCloudChallenge.

## Decide the Experience Before Running a Command

The Claude Code problem-authoring skill does not invent a meaningful competition for you. Start by answering these five questions in your own words:

```text
What should participants be able to do afterward?

Who are the participants in the story, and what is happening now?

What should their first action be?

What observable condition proves success?

Should the problem run locally or on AWS?
```

For example, “learn about certificates” is too vague for a scenario about recovering from an expired certificate. Write an observable outcome:

```text
What should participants be able to do afterward?
  Observe the connection failure, confirm the certificate expiration,
  replace the certificate, and verify a successful HTTPS response.
```

Derive the environment, first clue, and scoring condition from this outcome.

## Open the new-problem Skill

TenkaCloudChallenge includes a `new-problem` skill for Claude Code:

- [Instructions for authors](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/.claude/skills/new-problem/README.md)
- [The authoring procedure read by Claude Code](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/.claude/skills/new-problem/SKILL.md)

Open the root of the TenkaCloudChallenge repository in Claude Code and specify the format:

```text
/new-problem challenge
```

For a Battle:

```text
/new-problem battle
```

If you have not chosen a format:

```text
/new-problem
```

The skill asks for:

1. Problem format
2. Scoring method
3. Slug used as the problem ID
4. Scenario
5. Difficulty
6. Estimated duration

When asked for the scenario, provide the participant outcome and story you wrote above. A service name such as “make an S3 problem” does not define what the participant should learn.

## Create a Local Challenge

For a problem that does not use AWS, choose Challenge and select `verify` or `multi-verify`:

- `verify`: Judge one submission through `/verify`.
- `multi-verify`: Judge several checkpoints independently.

Use `challenges/sqli-demo` as the starter for a single-flag problem. Use `challenges/wp-exposed-backup` for a problem with multiple checkpoints.

Replace these parts with your own design:

1. Compose file referenced by `runtime.entry`
2. `challengeEndpoints` shown in the Participant Portal
3. Scoring endpoint in `verifyUrl`
4. `local/Dockerfile` and the problem application
5. Verification logic behind `/verify`
6. Ports bound only to loopback
7. Secret values generated for each run

Do not expose the target application and scoring API on the same public interface. Keep `/verify` on loopback and never reveal the answer for an incorrect submission.

## Create an AWS Challenge

Choose Challenge with `flag` scoring when participants must discover a value or complete a one-time repair.

The skill creates a new directory from `challenges/hello-world`. This starter includes the participant IAM role, required CloudShell permissions, resource-name prefix, and flag-scoring connection.

After generation, replace:

1. Story, learning outcome, and hints in `metadata.json`
2. Problem-specific resources in `template.yaml`
3. A flag discoverable only through the intended participant action
4. Problem-specific permissions in `ParticipantViewerRole`
5. English and Japanese README files
6. Cost and cleanup instructions

Do not use a fixed flag. Generate a different value for each deployment and expose it only after the intended action.

## Create an AWS Battle

Choose Battle when service state must be scored repeatedly during the event.

The skill asks for one of these scoring methods:

| Scoring method | Use |
| --- | --- |
| `uptime-flat` | Award points when every registered endpoint is healthy |
| `uptime-multi` | Check every declared endpoint and treat an unregistered one as a failure |
| `phased-polling` | Change scoring conditions over time |
| `attack-detection` | Convert statistics such as detection counts into points |

For a first Battle, `uptime-flat` with `battles/hello-world-battle` as the starter is the clearest option.

Decide:

- Endpoints registered by participants
- Paths and HTTP status codes that count as healthy
- How to prevent scoring before URL registration
- A disruption the red team can trigger
- How participants recover
- A revert that automatically restores the service

To cause a real disruption, define the execution method in `disruptions[].action`. A description alone does nothing. Every `action` should have a `revert`.

## Create a Problem Manually

Without Claude Code, copy the same starters manually:

```bash
cp -R challenges/hello-world challenges/<new-slug>
cp -R battles/hello-world-battle battles/<new-slug>
cp -R challenges/sqli-demo challenges/<new-local-problem-slug>
```

Run only the command that matches your chosen format. Then install dependencies and validate the changed problem with the repository's own commands:

```bash
make install
make agent-gate
```

Running `make agent-gate` immediately after copying files does not finish your problem. First replace the directory name and `id`, participant-facing text, environment, scoring, outputs, and README with your own design.

## Run the Problem Before Publishing It

For an AWS problem, deploy to a test AWS account and complete the participant flow, scoring, and deletion using the participant role.

Start a local problem from the root of the TenkaCloud repository:

```bash
make local
```

Use the organizer key displayed at startup to create an event and team, select the new problem, prepare the problem environments, and start from Schedule. Join the Participant Portal with the team key and use Start / resume. Confirm that the intended solution earns points and an incorrect submission does not. When finished:

```bash
make down
```

Finally, run the completion gate from the TenkaCloudChallenge root:

```bash
make agent-gate
```

Use one pull request per public problem. Include:

- The participant takeaway
- Story and first action
- Observable success condition
- Runtime and permission boundary
- Red-team disruption and revert
- Cost and cleanup
- Steps actually tested
- Result of `make agent-gate`

None of the three problems in this book began with “Which AWS service should I use?” Each began with the action participants should learn. The story, environment, and scoring followed from that decision. Preserve that order when designing your own problem.

## Where to go after this book

Finishing the book is not the end state. This order gets what you have read into something running in your own environment.

1. Try it. Open the [demo portal](https://tenkacloud.com/portal-demo/?demo=1) to use the participant's screen, or open a development environment with [GitHub Codespaces](https://codespaces.new/susumutomita/TenkaCloud). Solving problems inside Codespaces is still being verified.
2. Run it. Clone [TenkaCloud](https://github.com/susumutomita/TenkaCloud) and start a local problem with `make local`. Chapters 3 and 4 cover this stage.
3. Build one. Add a problem to [TenkaCloudChallenge](https://github.com/susumutomita/TenkaCloudChallenge). The existing problem directories read as templates, and `make agent-gate` is the completion contract.
4. Host one. Deploy TenkaCloud Cloud hosting to AWS, register teams, and run the event. Chapter 10 onwards covers this stage.

The project site is available in [English](https://www.tenkacloud.com/?lang=en) and [Japanese](https://www.tenkacloud.com/?lang=ja), with role-by-role manuals linked from there.

You are under no obligation to publish the problems you write, but publishing them lets other organisers run them as they are. In the other direction, reading the [problem catalog](https://github.com/susumutomita/TenkaCloudChallenge) before you start helps you pick a subject that does not duplicate one already there.

If something does not work, or this book left a gap where you needed detail, [GitHub Discussions](https://github.com/susumutomita/TenkaCloud/discussions) is the place to say so — it improves both the book and the platform.

## Keep Problems Private with Problem Packs

For an internal AWS exercise or a problem you plan to publish after an event, use a Problem Pack instead of a public catalog pull request. Run the CLI from the TenkaCloud repository:

```bash
make pack-init ARGS="./my-pack --runtime aws/cloudformation"
make pack-validate ARGS="./my-pack"
make pack-install ARGS="./my-pack"
make pack-list
bun run pack activate <id@version> --tenant local
```

Edit the generated manifest and problem assets before validation. Replace `<id@version>` with the pack ID and version from that manifest. Install stores the pack but does not activate it. Here, `local` is the fixed selector consumed by Cloud catalog loading; it does not select Local hosting. Activation updates `.tenkacloud/pack-store` without deploying AWS resources. The next Cloud deployment includes the store and problem assets in a private source archive. Redeploy between events, then select the problems in a new event. Existing event catalog snapshots remain unchanged.

Local hosting does not load the Pack store. For supported private Docker/Compose problems, put the problem in the local `problems/` tree, validate it, and run `make local`. Use AWS problems in Cloud hosting. The Pack CLI’s Git fetch is unauthenticated; check out private repositories using your authorized method and install the resulting local directory. Rehearse solving, scoring, and teardown before the event.
