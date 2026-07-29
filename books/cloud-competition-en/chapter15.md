---
title: "Rehearse and Run the Event"
free: true
---

Before the real event, the organizer should play through both problems as a participant. Do more than confirm that the pages open: test participant access, scoring, disruption, recovery, and deletion.

## Rehearse the Hello World Challenge

Sign in to the Participant Portal with the test team's login key.

Open `hello-world` and use `ParameterConsoleUrl` to view the SSM Parameter. When using the CLI, specify the parameter name shown on the problem page:

```bash
aws ssm get-parameter \
  --name /<NamePrefix>/hello \
  --query Parameter.Value \
  --output text
```

Submit the displayed `TC{...}` value in the Participant Portal.

Confirm that:

- The story and first action are visible.
- The participant can enter their team AWS account.
- The participant can read the SSM Parameter.
- The participant cannot operate another team's resources.
- A correct answer awards 100 points.
- Wrong-answer and hint penalties match the definition.

## Rehearse the Hello World Battle

Open `hello-world-battle`.

First connect to the EC2 instance with `SsmStartSessionCommand`:

```bash
aws ssm start-session --target <InstanceId>
```

Then use `Ec2HostHint` to register both URLs in the Participant Portal:

```text
frontend: http://<Ec2HostHint>
api:      http://<Ec2HostHint>:8080
```

Confirm that scoring begins and both endpoints become healthy.

## Rehearse the Red-Team Disruption and Recovery

As the organizer, open the red-team feature in the Application Admin Console and select the test team. Run the `frontend-down` disruption defined by the problem.

Confirm that nginx stops and that the frontend fails on the next scoring interval.

As the participant, connect through AWS Systems Manager Session Manager and start nginx:

```bash
sudo systemctl start nginx
sudo systemctl status nginx
```

Confirm that the frontend returns to healthy on the next scoring interval.

Next, test automatic recovery. Run the disruption again, do not recover manually, and wait 10 minutes. Confirm that the scheduled revert starts nginx and restores scoring.

This single rehearsal covers red-team target selection, fault injection, manual recovery by a participant, and automatic recovery by TenkaCloud.

## Run the Live Event

On the day of the event:

1. Confirm that both TenkaCloud Lite stacks are healthy.
2. Open the Application Admin Console and Participant Portal.
3. Confirm that every team's problem stacks are complete.
4. Distribute the Participant Portal URL and login keys.
5. Use `hello-world` to confirm access and submissions.
6. Use `hello-world-battle` to confirm endpoint registration.
7. Trigger the disruption after scoring has started for every team.
8. Finalize the standings at the announced end time.
9. Delete the problem stacks and TenkaCloud Lite.

Before explaining the problems, confirm that every participant can enter the Participant Portal. Do not trigger the Battle disruption until every team has registered its URLs and completed the first scoring interval.

The next chapter closes the event safely and removes the AWS resources.
