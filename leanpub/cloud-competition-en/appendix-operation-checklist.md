---
title: "Appendix A: Event Checklist"
free: true
---

## Problem Authoring

- [ ] The participant takeaway is written as an observable action.
- [ ] The first action is clear.
- [ ] The win condition can be judged automatically.
- [ ] Participant AWS permissions are limited to what the problem requires.
- [ ] Participants do not create top-level AWS resources manually.
- [ ] English and Japanese content convey the same instructions.
- [ ] Points, outputs, and hints match between the README and implementation.
- [ ] `make agent-gate` succeeds.

## Cloud Hosting

- [ ] The `deploy-tenkacloud-lite` tutorial is complete.
- [ ] The deployed Cloud stack is in a completed state; existing physical names may contain `lite`.
- [ ] The deployed problem-deployment stack is in a completed state.
- [ ] The organizer can sign in to the Application Admin Console.
- [ ] The Participant Portal opens.
- [ ] The production `ProblemsRepoRef` is pinned to a reviewed tag or commit SHA.

## Teams

- [ ] `competitor-bootstrap.yaml` is deployed to every team AWS account.
- [ ] Every role ARN is registered in the Application Admin Console.
- [ ] The `ExternalId` matches on the TenkaCloud and team sides.
- [ ] Problem deployment succeeds for one test team.
- [ ] Every team login key is stored securely.

## Hello World Challenge

- [ ] The story and first action are visible.
- [ ] `ParameterConsoleUrl` opens.
- [ ] The SSM Parameter can be read from the CLI.
- [ ] A correct `TC{...}` answer awards points.
- [ ] The wrong-answer penalty works.
- [ ] The two hints appear in order.

## Hello World Battle

- [ ] The participant can connect to EC2 through AWS Systems Manager Session Manager.
- [ ] `Ec2HostHint` is visible.
- [ ] The frontend and API URLs can be registered.
- [ ] No points are awarded before registration.
- [ ] Both endpoints become healthy after registration.
- [ ] `frontend-down` stops nginx.
- [ ] `systemctl start nginx` restores the frontend.
- [ ] The revert restores it automatically.

## Local Problem

- [ ] `runtime.entry` points to an existing Compose file.
- [ ] The target and `/verify` use separate ports.
- [ ] Published ports bind to `127.0.0.1`.
- [ ] The flag is generated from a new `FLAG_SEED` for each run.
- [ ] `/verify` does not reveal the answer after an incorrect submission.
- [ ] `make local` starts the organizer console and Portal; an event, team, and problem jobs have been prepared.
- [ ] The participant joins with a team key and starts the Docker environment with Start/resume.
- [ ] Correct and incorrect submissions were tested through the Participant Portal.
- [ ] `make down` stops the environment while preserving progress; clear and key reset are separate operations.

## Event Day

- [ ] Every team has signed in to the Participant Portal.
- [ ] Problem stacks are complete for every team.
- [ ] At least one team has submitted the Challenge.
- [ ] The first Battle score is visible for every team.
- [ ] The disruption runs only after every team is ready.
- [ ] The event end time and standings cutoff are announced.

## Cleanup

- [ ] Standings and required records are saved.
- [ ] Problem stacks are deleted from every team.
- [ ] `ACTION=destroy-all` has run in CodeBuild.
- [ ] `tenkacloud-lite` no longer exists.
- [ ] `tenkacloud-lite-problem-deploy` no longer exists.
- [ ] `tenkacloud-lite-launcher` is deleted.
- [ ] EC2, DynamoDB, S3, logs, and selected Turso competition rows have been checked.
- [ ] Private source archives and retained buckets have been deleted or assigned a retention period and cost owner.
- [ ] Shared CDKToolkit, assets, and competitor roles have an agreed retention or deletion decision.
- [ ] Story, hint, and operating-procedure improvements are recorded.
