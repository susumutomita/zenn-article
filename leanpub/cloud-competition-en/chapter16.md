---
title: "End the Competition and Delete AWS Resources"
free: true
---

A cloud competition does not end when scoring stops. It ends only after you delete the problem stacks, TenkaCloud Lite, and the launcher, then confirm that no billable resources remain.

For guided cleanup, open [Clean Up TenkaCloud Lite](https://www.tenkacloud.com/portal-demo/?demo=1&goto=%2Fproblems%2F01HZX0M0CLEANUPTENKA0001) on the landing page. This chapter explains what to delete and in which order.

## Delete the Problem Stacks

First, use the Application Admin Console to delete `hello-world` and `hello-world-battle` from every team.

Wait until every deletion is complete.

CloudFormation created the SSM Parameter for `hello-world` and the VPC, EC2 instance, and IAM roles for `hello-world-battle`. Because the design does not ask participants to create new top-level resources manually, deleting the stacks removes the problem environments.

## Remove TenkaCloud Lite Completely

Open the CodeBuild project used for deployment.

Choose `Start build with overrides` and set:

```text
ACTION=destroy-all
```

`destroy-all` removes the Lite stacks, retained DynamoDB tables, and problem-deployment logs.

Use `ACTION=destroy` only when you intentionally want to retain history. `destroy` leaves retained DynamoDB tables behind, so account for them before redeployment and when reviewing cost.

If the launcher is old, update its stack with the latest `lite-pipeline.yaml` before running `destroy-all`. Do not pass an unknown `ACTION` to an old buildspec.

## Delete the Launcher

After TenkaCloud Lite has been removed successfully, delete the `tenkacloud-lite-launcher` stack from CloudFormation.

This also removes:

- The CodeBuild project
- The IAM role used by CodeBuild
- The launcher's log group

## Check for Leftover Resources

Confirm that none of these stacks remain:

- Problem stacks in each team account
- `tenkacloud-lite`
- `tenkacloud-lite-problem-deploy`
- `tenkacloud-lite-launcher`

Also check EC2 instances and DynamoDB tables in the AWS Management Console. If a deletion failed, inspect the CloudFormation events and CodeBuild logs before declaring the cleanup complete.

## Record What You Learned

After cleanup, review the participant experience:

- Was the first action clear?
- Where did participants get stuck?
- Did the hints appear in the right order?
- Did scoring changes make success and failure understandable?
- Were the disruption time and recovery window appropriate?
- Which screens or procedures confused the organizer?

Do not look only at scores. Record what participants actually did and asked, then use that evidence to improve the story, hints, architecture diagram, and operating procedure for the next event.

The final chapter uses the local Challenge, AWS Challenge, and AWS Battle from this book as starting points for your own problem.
