---
title: "Define the Takeaway from the Local Problem"
free: true
---

Competition design does not begin with a Dockerfile or vulnerable code. First decide what participants should understand and be able to do when the competition ends.

Participants invest their time in the event. Centering the experience they can take away—not the technology an author wants to showcase—helps remove unnecessary mechanisms and scoring.

This chapter designs only the first local Challenge, `sqli-demo`. We will not consider the AWS Challenge or Battle yet.

## Express Learning as an Action

"Understand SQL injection" is not specific enough to determine the content or success condition. Describe the learning outcome in three parts:

1. The situation
2. The action
3. What the participant can verify or explain afterward

The intended takeaway from `sqli-demo` can be written like this:

> Given a login form that unsafely embeds input in a SQL statement, investigate how different inputs change its behavior, bypass authentication, and explain why the query must be parameterized.

That statement determines what the problem needs.

| Requirement | What this book provides |
| --- | --- |
| Investigation target | A staff-only login page |
| Participant action | Enter different usernames and passwords and compare behavior |
| Evidence of success | A flag shown only after signing in as the administrator |
| Scoring | `/verify` evaluates the flag submitted through the Participant Portal |
| Learning after completion | Explain how unsafe SQL is constructed and how to fix it |

## Choose One Central Action

The central action in this problem is changing the login input and observing the behavior.

We do not add database server provisioning, AWS deployment, or several vulnerabilities to discover. Unrelated preparation makes it harder to understand where participants are getting stuck.

The first local Challenge should create this experience:

1. Open the problem in the Participant Portal
2. Open the web application
3. Investigate how different inputs change the login result
4. Sign in as the administrator and discover the flag
5. Submit the flag through the Participant Portal
6. Review the scoring result and explanation

## Leave Space for Participants to Think

If the problem statement lists every action, participants only follow a procedure. If it hides even the entry point, they cannot begin the investigation.

`sqli-demo` reveals these facts from the beginning:

- The target is a staff-only login page
- Signing in as the administrator reveals a passphrase
- The URL of the target web page

It does not reveal:

- The name of the vulnerability
- The input that bypasses authentication
- The flag for the current run

Participants understand the goal and entry point, then investigate input handling themselves.

## A Design Note Before Implementation

Summarize the decisions on one page:

```text
Problem name:
  Staff-only login

Participant takeaway:
  Investigate input behavior and explain the cause and fix for the authentication bypass

First action:
  Open the login page from the Participant Portal

Central operation:
  Change the username and password inputs and observe the result

Success condition:
  /verify accepts the flag obtained from the administrator page

Recovery when stuck:
  Progress from examining input handling to a concrete SQL injection input

Shutdown:
  Stop the local environment with make local-down
```

At this stage, we have not decided the fields in `metadata.json` or the contents of the Dockerfile. We first fix the participant experience, then convert it into a story, win condition, and safety boundary in the next chapter.
