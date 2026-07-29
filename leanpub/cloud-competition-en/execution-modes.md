---
title: "Choose Where Each Problem Runs"
free: true
---

TenkaCloud is designed for multiple cloud providers rather than being permanently tied to one. The available features and level of verification still differ by provider.

In addition to AWS, TenkaCloud currently offers beta support for:

- [Microsoft Azure](https://azure.microsoft.com/)
- [Google Cloud](https://cloud.google.com/)
- [Sakura Cloud](https://cloud.sakura.ad.jp/)

In these beta integrations, supported services and verified operations vary by provider. This book uses AWS for every problem that runs in a public cloud.

We first build a local problem in Docker, then build problems that deploy to AWS.

Two independent choices matter here:

- Challenge and Battle describe what is scored and when
- Local and cloud describe where the participant's environment is created

The first problem, `sqli-demo`, is a local Challenge that runs in Docker. The second, `hello-world`, is an AWS Challenge. The third, `hello-world-battle`, is an AWS Battle.

| Build order | Problem | Execution environment | Format |
| --- | --- | --- | --- |
| 1 | `sqli-demo` | Docker on your computer | Challenge |
| 2 | `hello-world` | Team AWS account | Challenge |
| 3 | `hello-world-battle` | Team AWS account | Battle |

## Local Mode

Local mode runs TenkaCloud's Participant Portal, scoring API, and problem environment on one computer. It does not use an AWS account or AWS credentials.

Its primary use case is repeatable, self-paced practice for one person. You can open a problem without preparing an event or team. After inspecting an application and submitting an answer, you immediately see the scoring result.

Because the same problem can be restarted from the beginning, local mode works well as a drill after reading a lesson or as practice for an unfamiliar operation.

In this book, local mode operates applications inside Docker containers. The `local/docker-compose.yml` file starts a web application and its scoring endpoint, `/verify`, on your computer.

Local mode does not send `template.yaml` to CloudFormation. Because it creates no real cloud resources, it cannot teach real IAM, VPC, EC2, or cross-account access. Problems that require participants to inspect, configure, or recover AWS resources are deployed to team AWS accounts instead.

### Start Without Cloud Charges

TenkaCloud and the public problem catalog are open source. Local mode creates no AWS resources, so it incurs no AWS usage charges. You can begin on any computer that runs Docker, without preparing an AWS account, credit card, team, or event.

### Application-Only Practice Is Still Valuable

Cloud operations involve more than IAM and VPC decisions. The application layer provides many useful topics:

- Input handling and SQL injection
- Authentication and authorization failures
- Files or settings that should not be public
- The scope of data exposed by an API
- Secrets leaked in logs or screens
- Service state checks and restarts

A local problem lets participants observe a running application, identify an unhealthy or unsafe state, choose an action, and verify the result through scoring.

That sequence—observe, decide, act, and verify—can be learned without deploying anything to a cloud.

TenkaCloudChallenge starts a local environment from `local/docker-compose.yml`.

```text
make local PROBLEM=<problem-id>
  → start the Participant Portal
  → start the local scoring API
  → start the problem environment with Docker Compose
  → forward participant submissions to /verify in the problem container
```

A local problem contains these files:

```text
challenges/<problem-id>/
├── metadata.json
├── README.md
├── README.ja.md
└── local/
    ├── Dockerfile
    ├── docker-compose.yml
    └── app/
```

`metadata.json` defines the participant-facing text, Docker Compose entry point, target URL, and `/verify` URL that receives submissions.

With a local problem, a participant can read the scenario, operate the application, submit an answer, and see the score without AWS. That is why this book starts in local mode.

## The AWS Problems in This Book

TenkaCloud itself is not AWS-only. This book simply uses AWS as the cloud environment for the Challenge and Battle we implement.

For these AWS problems, `template.yaml` creates a CloudFormation stack in each team's AWS account. Participants use the AWS Console or CLI through temporary, problem-specific permissions.

```text
Application Admin Console
  → select a team
  → deploy a problem to the team's AWS account
  → move from the Participant Portal to AWS
  → inspect or recover the AWS environment
  → score the result
```

To deliver AWS problems to multiple teams, deploy TenkaCloud Lite to the organizer's AWS account.

TenkaCloud Lite is a single-tenant configuration for one organizer running a competition in their own AWS account. It runs the Application Admin Console, Participant Portal, scoring, and problem deployment processes on AWS.

"Lite" does not mean a simplified local demo. It deploys to real AWS. The Lite configuration omits the management plane and tenant provisioning pipeline needed by a multi-organization SaaS, allowing one tenant to operate independently. A later chapter explains the distinction in detail.

Unlike local mode, the TenkaCloud Lite platform and every team problem environment incur AWS usage charges. Review the cost sources and cleanup procedure before deploying, then remove both the problems and platform when the event ends.

The TenkaCloud landing page includes a guided problem for deploying TenkaCloud Lite:

[Open the Deploy TenkaCloud Lite problem](https://www.tenkacloud.com/portal-demo/?demo=1&goto=%2Fproblems%2F01HZX0KZZ3DR0PW9M4Q7XV2C5D)

We build the problems first. Deployment of TenkaCloud Lite and delivery to multiple teams come only after the local Challenge, AWS Challenge, and AWS Battle are complete.

## Focus on the Local Challenge First

While building the local Challenge, ignore CloudFormation, IAM roles, continuous scoring, and the red team.

Decide only five things:

1. What participants should take away
2. What situation they should enter
3. What they should try first
4. What counts as success
5. How to shut down the environment safely

The next chapter uses those five decisions to design a good participant experience.
