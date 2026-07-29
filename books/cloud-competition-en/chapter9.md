---
title: "Validate the Problem with make agent-gate"
free: true
---

After all problem files are in place, run the quality gate defined by TenkaCloudChallenge.

```bash
make agent-gate
```

If dependencies have not been installed, run:

```bash
make install
make agent-gate
```

`make agent-gate` is not an arbitrary combination of checks assembled by each user. It is the repository-defined completion gate for problem authoring.

## What the Gate Checks

The gate primarily verifies:

- `metadata.json` conforms to `SCHEMA.json`
- Referenced CloudFormation Outputs exist
- Required participant IAM permissions are present
- EC2-related resources have the required tags
- The CloudFormation template contains no prohibited patterns
- Required README files exist
- Challenge points and hint penalties follow catalog policy
- `index.json` and the cost report have no uncommitted generated changes

## Connections to Verify in hello-world

For `hello-world`, pay particular attention to three connections:

1. `ParameterValue` from `scoring.flagOutputKey` exists as an Output in `template.yaml`
2. `FlagSeed` exists in both `cfnParameters` and the CloudFormation Parameters
3. `ParticipantViewerRole` can read the team's SSM Parameter

When validation fails, fix the file and field named by the error. Do not disable the check or exclude the file.

## Information to Include in the Pull Request

Publish one new problem per pull request. Include:

- Intended participant takeaway
- First action and win condition
- AWS resources created
- Scoring method
- Cost and deletion procedure
- Result of `make agent-gate`

`hello-world` is complete. The next chapter begins the third problem, `hello-world-battle`. Before implementing it, we design its participant takeaway, story, win condition, and safety boundary for a Battle.
