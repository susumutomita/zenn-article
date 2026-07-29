---
title: "Appendix B: Glossary"
free: true
---

## Cloud Competition

A hands-on exercise in which participants investigate, configure, and recover an environment in a simulated cloud-operations scenario, with automated scoring of the result.

## Challenge

A problem format that participants solve at their own pace. Scoring methods include `flag`, `verify`, and `multi-verify`.

## Battle

A problem format in which multiple teams participate at the same time and endpoint or statistical state is scored continuously.

## TenkaCloud

The open-source platform that manages events, teams, problem deployment, scoring, hints, the Participant Portal, and fault injection.

## TenkaCloudChallenge

The public problem catalog read by TenkaCloud. Each problem lives in one directory.

## Application Admin Console

The organizer interface for managing events, teams, problem deployments, and disruptions.

## Participant Portal

The interface where participants read the story and hints, submit answers, register endpoints, and view scores.

## TenkaCloud Lite

The single-tenant edition used by one organizer to run an event.

## Local Mode

A configuration that runs the TenkaCloud scoring API, Participant Portal, and Docker problem on one computer. It does not use an AWS account or AWS credentials.

## Problem Pack

A mechanism for adding private problems to a specific tenant without publishing them in the public catalog.

## `metadata.json`

The JSON file that defines problem content, scoring, hints, endpoints, and disruptions.

## `template.yaml`

The CloudFormation template that defines resources created in one team's AWS account.

## `NamePrefix`

A prefix that prevents team and problem resource names from colliding in the same AWS account.

## `ParticipantViewerRole`

The IAM role a participant uses to access their problem environment. Although its name contains “Viewer,” it can include the limited write permissions required by a problem.

## `ExternalId`

An additional condition used when TenkaCloud assumes a role in a team account. It prevents an unintended third party from assuming that role.

## flag

A value discovered and submitted by a participant. This book uses the `TC{...}` format.

## discovered flag

A flag that cannot be guessed from memorized or public information and is revealed only through the intended action.

## endpoint slot

A URL field registered by a participant in a Battle. The scoring definition refers to the URL by its slot name.

## endpoint

A URL that TenkaCloud probes over HTTP to observe service state. A participant may register it through the Participant Portal.

## `uptime-flat`

A scoring method that checks several endpoints independently and continuously awards points for healthy state.

## disruption

A fault triggered by the organizer during a Battle. The actual operation is defined in `action`, and the recovery operation in `revert`.

## Red Team

The organizer-side role that runs a predefined disruption or attack against a selected team during a Battle. In this book, the red team stops nginx for that team.

## revert

An operation that restores a disruption after a fixed time. It is a safety net against a permanent outage.

## EC2 Session Connection

An AWS Systems Manager feature that uses IAM permissions to connect to EC2 without exposing an SSH port or private key.

## competitor bootstrap

The initial setup that creates a dedicated IAM role so TenkaCloud can deploy problem stacks to a team AWS account.

## launcher stack

A CloudFormation stack that creates the CodeBuild project used to deploy TenkaCloud Lite. It is separate from TenkaCloud itself.

## `destroy-all`

The operation that completely removes TenkaCloud Lite stacks, retained DynamoDB tables, and problem-deployment logs.

## `runtime`

A `metadata.json` section that defines the Docker Compose file used to start a local problem and the URLs exposed to participants and scoring.

## `/verify`

The loopback API that judges submissions for a local problem. TenkaCloud does not store the answer; it sends the submission to this API and receives a `correct` result.
