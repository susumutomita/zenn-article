---
title: "Add Scoring and a Disruption to hello-world-battle"
free: true
---

In `hello-world-battle/metadata.json`, define two endpoints, continuous scoring, and a disruption that stops nginx. You can compare your work with the finished [metadata.json](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/battles/hello-world-battle/metadata.json).

## Basic Information

```json
{
  "$schema": "../../SCHEMA.json",
  "id": "hello-world-battle",
  "name": "Hello World Battle (Sample)",
  "category": "Battle",
  "status": "ready",
  "visibility": "public",
  "onboardingOrder": 1,
  "difficulty": 1,
  "estimatedDuration": "30 minutes",
  "tags": ["sample", "battle", "uptime", "ec2", "nginx"],
  "cfnTemplate": "template.yaml",
  "cfnParameters": {}
}
```

`onboardingOrder` controls where this introductory Battle appears in onboarding.

In `instructions`, describe the participant's first three actions:

1. Connect to the EC2 instance with `SsmStartSessionCommand`.
2. Use `Ec2HostHint` to register two URLs.
3. Restart a service if it stops.

## Define the Endpoints

```json
{
  "endpoints": [
    {
      "slot": "frontend",
      "default": {
        "from": "cfn-output",
        "key": "FrontendUrl"
      },
      "overridable": true,
      "label": "Frontend (nginx)",
      "description": "Register http://<host> using the DNS name in Ec2HostHint."
    },
    {
      "slot": "api",
      "default": {
        "from": "cfn-output",
        "key": "ApiUrl"
      },
      "overridable": true,
      "label": "API (python http.server)",
      "description": "Register http://<host>:8080 using the DNS name in Ec2HostHint."
    }
  ]
}
```

`slot` is the identifier referenced by the scoring rules.

Match each `default.key` to an output name in `template.yaml`. The output value is empty, but the reference still has to exist.

When `overridable` is `true`, the participant can register the URL from the Participant Portal.

## Define Scoring for Every Minute

```json
{
  "scoring": {
    "kind": "uptime-flat",
    "endpoints": [
      {
        "slot": "frontend",
        "path": "/",
        "expectStatus": [200]
      },
      {
        "slot": "api",
        "path": "/healthz",
        "expectStatus": [200]
      }
    ],
    "pointsPerSuccess": 100,
    "failurePenalty": -100
  }
}
```

Each scoring `slot` must match an `endpoints[].slot` value from the previous section.

Do not include `/healthz` in the registered API URL. Register `http://<host>:8080`; the scoring engine appends the `/healthz` path.

## Define a Red-Team Disruption

TenkaCloud stores the faults that an organizer can trigger during a Battle in `disruptions`. The red-team feature in the Application Admin Console reads these definitions and applies a selected disruption to a selected team.

For the `hello-world-battle` red team, define just one disruption, `frontend-down`, which stops nginx:

```json
{
  "disruptions": [
    {
      "id": "frontend-down",
      "name": "Stop the frontend",
      "eventDetailType": "OutageDisruptionFired",
      "defaultAfterMinutes": 10,
      "operatorEditable": ["afterMinutes"],
      "publicHint": true,
      "description": "The organizer stops nginx for the selected team. Participants restart it through SSM Session Manager.",
      "action": {
        "kind": "ssm-run-command",
        "targetRef": "InstanceId",
        "documentName": "AWS-RunShellScript",
        "paramTemplate": {
          "commands": ["systemctl stop nginx || true"]
        },
        "revert": {
          "afterSeconds": 600,
          "documentName": "AWS-RunShellScript",
          "paramTemplate": {
            "commands": ["systemctl start nginx || true"]
          }
        }
      }
    }
  ]
}
```

The `InstanceId` referenced by `targetRef` is an output from `template.yaml`. TenkaCloud reads the EC2 instance ID from the selected team's stack, so it does not accidentally run the command against another team's instance.

`action` causes the actual outage, while `revert` schedules automatic recovery. A description by itself does not stop nginx.

Do not add a separate scoring penalty for this disruption. When nginx stops, the frontend probe fails and `failurePenalty` already applies. A second penalty on the disruption would deduct points twice for the same event.

## Decide What Participants Can See

Use `shortDescription` and `instructions` to explain the participant goals: registering URLs and restoring the service. Put exact point values and internal execution details in the organizer-facing `description`.

This problem sets `publicHint` to `true`, so participants know that a disruption can occur. A surprise scenario could use `false`, but the first Battle should make the recovery exercise easy to understand.

## README and Architecture Diagram

The Battle README should state:

- How to access AWS
- The two URLs to register in the Participant Portal
- The condition that starts scoring
- Recovery commands for the disruption
- The AWS resources created by the problem
- Cost and cleanup instructions

Compare your version with the finished [English README](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/battles/hello-world-battle/README.md). A [Japanese README](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/battles/hello-world-battle/README.ja.md) is also available.

The third problem, an AWS Battle, is now complete. You have built a local Challenge, an AWS Challenge, and an AWS Battle in increasing order of complexity. The next chapter moves to the organizer's side: deploying these AWS problems for multiple teams.
