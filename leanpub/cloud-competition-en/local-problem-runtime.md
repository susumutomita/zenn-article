---
title: "Build the Local Docker Environment and Scoring API"
free: true
---

Now convert the participant experience into Docker Compose and a small Node.js application.

This problem runs two HTTP servers in one container:

- Port 8080: the login page participants investigate
- Port 8081: `/verify`, where TenkaCloud sends submissions for evaluation

On the host, both are exposed only on `127.0.0.1`.

## Create the Dockerfile

`local/Dockerfile` copies `app/` into a Node.js image and starts it as an unprivileged user.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app
COPY app/ ./
USER node

EXPOSE 8080 8081

CMD ["node", "--experimental-sqlite", "server.mjs"]
```

The problem uses the SQLite implementation built into Node.js, so it does not need a separate database container.

## Restrict External Access with Docker Compose

Create `local/docker-compose.yml`.

```yaml
services:
  sqli-demo:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      FLAG_SEED: "${FLAG_SEED:-local-dev-seed}"
    ports:
      - "127.0.0.1:18080:8080"
      - "127.0.0.1:18081:8081"
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ]
      interval: "2s"
      timeout: "3s"
      retries: 20
    restart: "no"
```

Never expose an intentionally vulnerable training application on `0.0.0.0:18080`. Bind the host side to `127.0.0.1` so it cannot be reached from another computer.

TenkaCloud generates a random `FLAG_SEED` at startup and passes it as an environment variable. `local-dev-seed` is only a default for testing the Compose file without TenkaCloud.

## Generate a Flag for Each Run

In `local/app/server.mjs`, derive the flag and administrator password from `FLAG_SEED`.

```js
import { createHash } from "node:crypto";

const flagSeed = process.env.FLAG_SEED ?? "local-dev-seed";
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const flag = `TC{sqli_${sha256(`flag:${flagSeed}`).slice(0, 20)}}`;
const adminPassword = sha256(`pw:${flagSeed}`);
```

Because the flag is not hard-coded in source, reading the repository does not reveal the answer for a running instance. The value changes every time the problem starts.

## Build the Target Login Page

Insert `admin` and `guest` users into SQLite, then implement the login flow.

For this exercise, intentionally concatenate input directly into the SQL statement.

```js
function authenticate(username, password) {
  const sql =
    `SELECT username, role FROM users ` +
    `WHERE username = '${username}' AND password = '${password}'`;

  try {
    return db.prepare(sql).get();
  } catch {
    return undefined;
  }
}
```

This is not production code. It is a loopback-only exercise designed to let participants discover the danger of unsafe input handling.

After a successful login, return the flag only when the selected row has the `admin` role.

```js
if (row && row.role === "admin") {
  return send(
    response,
    200,
    "application/json",
    JSON.stringify({
      ok: true,
      flag,
    }),
  );
}
```

## Build `/verify`

The second HTTP server accepts only `POST /verify`.

```js
const verify = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/verify") {
    return send(
      response,
      404,
      "application/json",
      JSON.stringify({ error: "not_found" }),
    );
  }

  const raw = await readBody(request);
  let submission = "";

  try {
    submission = String(JSON.parse(raw).submission ?? "");
  } catch {
    submission = "";
  }

  const correct = submission.trim() === flag;
  return send(
    response,
    200,
    "application/json",
    JSON.stringify({
      correct,
      message: correct
        ? "Flag accepted."
        : "That is not the flag for this challenge.",
    }),
  );
});
```

For an incorrect answer, never return the expected flag or details of the comparison. Return only information that cannot help a participant guess the answer.

## Run the Completed Problem in the Participant Portal

Problem authoring and participant play happen in separate repositories.

| Repository | Role in this chapter |
| --- | --- |
| TenkaCloudChallenge | Create and validate the `sqli-demo` text, Docker environment, and scoring |
| TenkaCloud | Start the Participant Portal, local scoring API, and problem container |

Run the completion gate in the TenkaCloudChallenge repository you have been editing.

```bash
make agent-gate
```

Next, clone TenkaCloud into a directory separate from TenkaCloudChallenge.

```bash
cd ..
git clone https://github.com/susumutomita/TenkaCloud.git
cd TenkaCloud
make local-onboard
```

TenkaCloud reads the published problem catalog through a Git submodule named `problems/`. This is how it references TenkaCloudChallenge; it does not mean that problems belong to the TenkaCloud platform repository.

The completed `sqli-demo` built in this book is already published on TenkaCloudChallenge's `main` branch. You do not create an authoring branch in TenkaCloud. Start the published implementation by problem ID.

```bash
make local PROBLEM=sqli-demo
```

`make local` connects the local scoring API, Participant Portal, and selected problem container. Open the Participant Portal in a browser and follow the `Web` endpoint to the login page.

Verify the complete path:

1. The `Web` endpoint opens the login page
2. Solving the target reveals a flag unique to this run
3. Submit the flag through the Participant Portal
4. The submission is sent to `127.0.0.1:18081/verify`
5. A correct answer records points

When finished, run the following command from the TenkaCloud root.

```bash
make local-down
```

Do not stop only the container by hand. TenkaCloud's shutdown command removes the local scoring API, Portal configuration, and stored progress together.

## Review the Completed Implementation

The files built in this chapter are available here:

- [metadata.json](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/metadata.json)
- [Dockerfile](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/Dockerfile)
- [docker-compose.yml](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/docker-compose.yml)
- [server.mjs](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/app/server.mjs)

The first local Challenge is now complete. We created one continuous experience from the problem statement and Docker environment through `/verify` and submission in the Participant Portal.

The next chapter begins the second problem. We will design the learning outcome, story, win condition, and safety boundary for the AWS Challenge `hello-world`.
