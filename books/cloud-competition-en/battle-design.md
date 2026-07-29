---
title: "Design the AWS Battle"
free: true
---

The local Challenge and AWS Challenge are complete. The final problem is an AWS Battle that repeatedly scores system state.

A Battle does not end with one correct answer. Participants register targets for scoring, the organizer introduces a fault, and scoring continues after participants recover the service. This makes Battle the most design-intensive of the three formats.

This chapter defines the learning outcome, story, win condition, and safety boundary for `hello-world-battle`. The next chapter designs continuous scoring and the red team.

## Define the Participant Takeaway

The intended takeaway from `hello-world-battle` is:

> Given two web services running on EC2, connect to the server through AWS Systems Manager Session Manager, register URLs for scoring, and restore a stopped service.

Participants follow this sequence:

1. Connect to the server through AWS Systems Manager Session Manager
2. Confirm that the frontend and API are running
3. Register both service URLs in the Participant Portal
4. Confirm that continuous scoring has begun
5. The red team stops the frontend
6. Connect to the server and restore the service
7. Confirm that scoring returns to a healthy state

Do not add a complex application failure or database. Focus on the Battle fundamentals: server access, URL registration, continuous scoring, and recovery.

## Create the Story

Give URL registration and service restart a reason by defining the participant's role and current situation.

- Role: an SRE inheriting a small web system
- Current situation: the frontend and API are running but not registered for monitoring
- First action: connect to the server and inspect the running services
- Next action: register both URLs in the Participant Portal
- Event during the competition: the organizer's red team stops the frontend
- Participant response: reconnect to the server and start nginx

Those decisions produce this story:

> It is your second day as an SRE. Your predecessor handed over a small web system with an nginx frontend and a Python API. First connect to the server and register both service URLs for monitoring. If the red team introduces a fault during the competition, restore the stopped service.

The red team in this book is not another participant team. It is an organizer operating TenkaCloud to execute a fault defined by the problem against a selected team.

## Define the Win Condition

Instead of evaluating recovery once, a Battle checks service state on a schedule:

- `/` on the frontend returns HTTP 200
- `/healthz` on the API returns HTTP 200

Repeat those checks every minute against the two participant-registered URLs.

Do not score before the URLs are registered. If deploying a healthy environment automatically earns points, participants never learn the Battle startup action.

## Define the Safety Boundary

Participants can establish a session only to their team's EC2 instance.

- Do not use an SSH port or private key
- Connect through AWS Systems Manager Session Manager
- Expose only scoring ports 80 and 8080
- Allow participants to operate only the EC2 instance for their problem
- Allow the red team to stop nginx only on the selected team
- Automatically restart nginx ten minutes after the fault
- Delete the problem stack and EC2 instance at the end

Do not give the red team arbitrary command execution. Pair each defined fault with an operation that restores the original state.

## Specification Before Implementation

Summarize the design:

```text
hello-world-battle

Learning experience:
  Connect to a server, register URLs, experience continuous scoring, and recover a fault

Story:
  An SRE on their second day inherits an unmonitored web system

Win condition:
  Frontend / and API /healthz return HTTP 200

Safety boundary:
  Establish sessions only to the team's own EC2 instance
  Expose only ports 80 and 8080

Red team:
  The organizer stops nginx for the selected team
  TenkaCloud automatically starts it again after ten minutes
```

The next chapter turns this specification into clear game rules and continuous scoring.
