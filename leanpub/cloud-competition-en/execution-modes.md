---
title: "Choose Where Each Problem Runs"
free: true
---

Cloud hosting runs on AWS Lambda and Cognito with a choice of Turso or DynamoDB. The cloud problems deployed in this book use AWS and CloudFormation. Docker/Compose problems run in Local hosting.

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

Local hosting uses events and teams. The organizer creates an event, teams, and selected problems, prepares the problem environments, and starts the event from Schedule. Participants join with the participant URL and team key, then use Start / resume to start their Docker environment. Individual practice uses an event with one team.

Because the same problem can be restarted from the beginning, local mode works well as a drill after reading a lesson or as practice for an unfamiliar operation.

In this book, local mode operates applications inside Docker containers. The `local/docker-compose.yml` file starts a web application and its scoring endpoint, `/verify`, on your computer.

Local mode does not send `template.yaml` to CloudFormation. Because it creates no real cloud resources, it cannot teach real IAM, VPC, EC2, or cross-account access. Problems that require participants to inspect, configure, or recover AWS resources are deployed to team AWS accounts instead.

### Start Without Cloud Charges

TenkaCloud and the public problem catalog are open source. Local mode creates no AWS resources, so it incurs no AWS usage charges. You can begin on any computer that runs Docker, without preparing an AWS account or credit card. You still create an event and team in the organizer console.

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
make local
  → start the organizer console and Participant Portal
  → create an event, team, and problem environments
  → start the event from Schedule
  → participants use Start / resume to start their Docker environment
  → forward submissions to the team’s /verify endpoint
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

This book uses AWS as the cloud environment for the Challenge and Battle we implement.

For these AWS problems, `template.yaml` creates a CloudFormation stack in each team's AWS account. Participants use the AWS Console or CLI through temporary, problem-specific permissions.

```text
Application Admin Console
  → select a team
  → deploy a problem to the team's AWS account
  → move from the Participant Portal to AWS
  → inspect or recover the AWS environment
  → score the result
```

To deliver AWS problems to multiple teams, deploy Cloud hosting to the organizer’s AWS account. Lambda and Cognito provide the runtime and authentication, with Turso or DynamoDB for persistent data. Existing stack names may contain `lite`; use the deployed names when operating or removing an existing environment.

Cloud hosting and each team’s AWS problem environment incur cloud usage charges. Review costs and teardown before deployment.

The landing page includes a guided deployment tutorial:

[Open the Cloud deployment tutorial](https://www.tenkacloud.com/portal-demo/?demo=1&goto=%2Fproblems%2F01HZX0KZZ3DR0PW9M4Q7XV2C5D)

We build the problems first, then deploy the hosting environment and deliver them to teams.

## Focus on the Local Challenge First

While building the local Challenge, ignore CloudFormation, IAM roles, continuous scoring, and the red team.

Decide only five things:

1. What participants should take away
2. What situation they should enter
3. What they should try first
4. What counts as success
5. How to shut down the environment safely

The next chapter uses those five decisions to design a good participant experience.
