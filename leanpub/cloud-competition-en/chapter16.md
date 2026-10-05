---
title: "End the Competition and Delete AWS Resources"
free: true
---

A cloud competition does not end when scoring stops. It ends only after you delete the problem stacks, TenkaCloud, and the launcher, then confirm that no billable resources remain.

For guided cleanup, open [Clean Up TenkaCloud](https://www.tenkacloud.com/portal-demo/?demo=1&goto=%2Fproblems%2F01HZX0M0CLEANUPTENKA0001) on the landing page. This chapter explains what to delete and in which order.

## Delete the Problem Stacks

First, use the Application Admin Console to delete `hello-world` and `hello-world-battle` from every team.

Wait until every deletion is complete.

CloudFormation created the SSM Parameter for `hello-world` and the VPC, EC2 instance, and IAM roles for `hello-world-battle`. Because the design does not ask participants to create new top-level resources manually, deleting the stacks removes the problem environments.

## Remove the Hosting Infrastructure and Competition Data

Open the CodeBuild project used for deployment.

Choose `Start build with overrides` and set:

```text
ACTION=destroy-all
```

Complete problem Teardown before removing the hosting infrastructure. `destroy-all` also purges the selected external Turso competition data and owned retained content after checking the target. It uses the database and existing SSM parameter verified from the deployed stacks.

Ordinary `destroy` deletes stack-owned DynamoDB tables by default and preserves external Turso rows. DynamoDB data survives only when the deployed template has a Retain policy, such as a deployment made with `RetainDataTables=true`. Changing the launcher setting just before deletion does not change an already deployed policy. Check that policy and take a backup before choosing a cleanup procedure.

For an older launcher, first check which actions its buildspec accepts and which stacks it owns. The current template is `infrastructure/templates/cloud-pipeline.yaml`. Update the existing launcher while preserving its physical name; do not send an unknown `ACTION` to an old buildspec.

## Delete the Launcher

After TenkaCloud has been removed successfully, delete the deployed launcher stack from CloudFormation. If you followed the tutorial, the stack is named `tenkacloud-lite-launcher`.

This also removes:

- The CodeBuild project
- The IAM role used by CodeBuild
- The launcher's log group

## Check for Leftover Resources

Confirm that none of these stacks remain:

- Problem stacks in each team account
- `tenkacloud-cloud` (`tenkacloud-lite` in an existing environment)
- `tenkacloud-cloud-problem-deploy` (`tenkacloud-lite-problem-deploy` in an existing environment)
- The launcher stack (`tenkacloud-lite-launcher` in the tutorial)

Also check EC2 instances, DynamoDB tables, retained S3 buckets, source buckets, and logs. A Retain-policy bucket itself can remain after `destroy-all`. For an event-only bucket, confirm ownership and backups, remove all object versions and delete markers, then delete the bucket. Include source archives containing private Problem Packs. If you retain a bucket for another event, record its expiry date and who will review its cost.

CDKToolkit, shared assets, and competitor-bootstrap roles are outside platform teardown. Check whether other stacks or events use them, then agree on retention or deletion with their owner. Check the selected Turso database for remaining competition rows. If a deletion failed, inspect the CloudFormation events and CodeBuild logs before declaring cleanup complete.

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
