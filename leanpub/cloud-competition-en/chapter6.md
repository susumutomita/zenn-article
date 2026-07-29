---
title: "Write the hello-world Text and Scoring"
free: true
---

`metadata.json` defines how TenkaCloud displays and scores a problem. Put the AWS environment in `template.yaml`, and put participant-facing content and scoring in `metadata.json`.

See the completed [metadata.json](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/hello-world/metadata.json).

## Overall Shape of metadata.json

```json
{
  "$schema": "../../SCHEMA.json",
  "id": "hello-world",
  "name": "Hello World (Sample)",
  "category": "Challenge",
  "status": "ready",
  "visibility": "public",
  "difficulty": 1,
  "estimatedDuration": "1 minute",
  "shortDescription": "...",
  "instructions": "...",
  "description": "...",
  "tags": ["sample", "challenge", "flag", "ssm"],
  "learningGoals": ["..."],
  "cfnTemplate": "template.yaml",
  "cfnParameters": {},
  "i18n": {
    "en": {}
  },
  "scoring": {}
}
```

`$schema` helps both editors and validation commands identify mistakes.

Make `id` match the directory name and set `category` to `Challenge`. To display the problem publicly in TenkaCloud, set `status` to `ready` and `visibility` to `public`.

## Participant-Facing Text

Each field has a distinct purpose.

| Field | Reader | Content |
| --- | --- | --- |
| `name` | Participant | Problem name |
| `shortDescription` | Participant | Introduction on the problem card and detail page |
| `instructions` | Participant | First action and goal |
| `description` | Author, organizer | Implementation, scoring, and design notes |
| `learningGoals` | Participant, organizer | Intended takeaways |

`instructions` is a Markdown string. Include three elements:

```json
{
  "instructions": "## Getting started\nThis introductory problem asks you to find a message left by the previous SRE.\n\n## First move\n- Console: open `ParameterConsoleUrl`\n- CLI: `aws ssm get-parameter --name /<NamePrefix>/hello --query Parameter.Value --output text`\n\n## Goal\nSubmit the SSM Parameter value through the Participant Portal."
}
```

The instructions should reveal the first action without revealing the answer.

## Pass a Random Value to CloudFormation

`cfnTemplate` names the template used by the problem.

```json
{
  "cfnTemplate": "template.yaml",
  "cfnParameters": {
    "FlagSeed": "__RANDOM_PASSWORD__"
  }
}
```

TenkaCloud replaces `__RANDOM_PASSWORD__` with a random value for each deployment. It becomes the `FlagSeed` from the previous chapter and is used by both the SSM Parameter and correct-answer Output.

## Define Flag Scoring

```json
{
  "scoring": {
    "kind": "flag",
    "flagOutputKey": "ParameterValue",
    "points": 100,
    "wrongAnswerPenalty": 5,
    "hints": [
      {
        "id": "hint-1",
        "content": "Open ParameterConsoleUrl from the Outputs, or run aws ssm get-parameter.",
        "penalty": 20
      },
      {
        "id": "hint-2",
        "content": "The value has the form TC{...}. Submit the complete Parameter value.",
        "penalty": 30
      }
    ]
  }
}
```

`flagOutputKey` must match `Outputs.ParameterValue` in `template.yaml`. If the names differ, TenkaCloud cannot obtain the correct answer.

The difficulty-one Challenge awards 100 points. A wrong answer deducts 5 points, and total hint penalties must not exceed 50. TenkaCloudChallenge validation enforces this policy.

## Keep Japanese and English in Sync

The public catalog keeps Japanese at the top level and English under `i18n.en`.

```json
{
  "i18n": {
    "en": {
      "name": "Hello World (Sample)",
      "shortDescription": "Find the message left in an SSM Parameter.",
      "instructions": "## Getting started\nFind the message left by the previous SRE.\n\n## First move\nOpen ParameterConsoleUrl or use aws ssm get-parameter.\n\n## Goal\nSubmit the complete TC{...} value.",
      "description": "Minimal Challenge using one SSM Parameter.",
      "learningGoals": [
        "Read a value from SSM Parameter Store through the AWS Console or CLI",
        "Experience TenkaCloud's deploy, submit, and score flow"
      ],
      "hints": [
        {
          "id": "hint-1",
          "content": "Open ParameterConsoleUrl or use aws ssm get-parameter."
        },
        {
          "id": "hint-2",
          "content": "Submit the complete value from TC{ to }."
        }
      ]
    }
  }
}
```

Use the same hint IDs in both languages. Keep point values and penalties only at the top level rather than duplicating them in the English object.

The next chapter finishes the README files and architecture diagram.
