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

Use Git, Make, Bun 1.3.11, Docker Engine and Compose for this same-PC lab. Next, clone TenkaCloud into a directory separate from TenkaCloudChallenge.

```bash
cd ..
git clone https://github.com/susumutomita/TenkaCloud.git
cd TenkaCloud
make install
make local
```

Before startup, `make local` downloads the repository URL and `ref` selected in `catalog-sources.json`, defaulting to TenkaCloudChallenge's `main`. Network access is required; acquisition failure stops startup. The `problems/` directory is a generated build view, not a Git submodule. Saved events retain immutable acquisition snapshots. To test an authoring branch, change the configured URL and `ref`; `make deploy` uses the same selection. See [catalog-sources.json](https://github.com/susumutomita/TenkaCloud/blob/main/catalog-sources.json) and [downloaded-catalog.ts](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/problem-pack/downloaded-catalog.ts).

The completed `sqli-demo` built in this book is already published on TenkaCloudChallenge's `main` branch. You do not create an authoring branch in TenkaCloud. Start the organizer console and Participant Portal with `make local`. In an interactive terminal, startup displays a new organizer key once and invalidates the previous organizer access. Open the organizer URL and sign in with that key.

The default organizer URL is `http://127.0.0.1:5174`; the participant URL is `http://127.0.0.1:5175`. Both work on the host PC. To admit another device on a trusted isolated network, specify an IPv4 already assigned to the host:

```bash
make local LOCAL_ARGS="--lan 100.96.12.34 --unsafe-lan"
```

Replace the example address with the host's real IP. Tailscale IPv4 addresses in `100.64.0.0/10` are accepted. The organizer still uses `http://127.0.0.1:5174` on the host; participants use `http://100.96.12.34:5175` and their own team key. Keep the organizer key private. On a participant device, `127.0.0.1` refers to that device, not the host.

This is an HTTP listener. Plain LAN supports native problems that do not use Docker, such as Crypto Battle. Starting, resuming or recovering Docker/Compose exercises without dedicated isolation is rejected with `network_isolation_required`. Mac/Docker Desktop does not support that mode. Run this chapter's `sqli-demo` on same-PC loopback first; loopback exercises have no dedicated guard isolation guarantee.

Remote Docker exercises require supported native Linux, explicit `--competition-network` and `--docker-network-pool`, and a pool that does not overlap LAN/VPN routes. Docker 28.4.x, a rootful local daemon and firewall/nsenter permissions are among the [guard prerequisites](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/local-host/linux-network-guard.ts). Selecting a LAN listener alone does not automatically change firewall or VPN settings.

Retained unisolated Docker units, even stopped ones, block remote host startup before listeners open. Jobs/units are not automatically stopped or migrated. Agree on maintenance with the organizer, preserve needed data, then stop and retire those environments through the original loopback host before creating isolated ones. Do not update or restart a running host without coordination.

These checks concern exercise containers. Tailscale connectivity alone does not establish restrictions on the rest of a participant device's network access or communication between devices. HTTPS hosting, real VM traffic and a complete multiplayer event are not established by this procedure.

Keep builds enabled on the first start. Add `--no-build` only after building the same code and selected catalog. If startup rejects a missing build or a catalog mismatch, omit the flag on the next start to rebuild.

### Join Before Tailscale Is Configured

Share only a dedicated event host. Participants do not need to join the organizer's company tailnet. Obtain the device owner's and administrator's approval before sharing a company PC or its services. These are steps for an approved setup; a real-device rehearsal including sharing remains incomplete. Remote Docker still requires the native Linux isolation prerequisites above.

#### Organizer Preparation

1. Install Tailscale from the [official download](https://tailscale.com/download) on an approved dedicated host. Sign in with the approved event account. Record the selected tailnet, host name and its own IPv4; compare `tailscale ip -4` and `tailscale status`. For a VM, use the VM's own address.
2. Agree with each participant on their sign-in method, account and receiving tailnet. Issuing and accepting shares requires Owner / Admin / IT admin privileges in the respective tailnets. Check the selected identity when personal and company accounts coexist.
3. Administrators on both sides review effective [grants](https://tailscale.com/docs/features/access-control/grants) / [ACLs](https://tailscale.com/docs/features/access-control/acls). Scope access from the receiving user to the dedicated host's TCP 5175. Only for Docker exercise gateways, also scope the configured `--gateway-ports` TCP range, default 5200–5239. Do not permit 5174, SSH, unnecessary services or raw container ports. Adding a narrow permission does not constrain an existing broader allowance.
4. In Machines, verify the event host name and IP, then use Share → Copy invite link → Copy share link to issue an individual single-use invitation. Leave reusable links disabled. Give its link only to the intended recipient: it grants access. Sharing exposes a machine, not a guaranteed single port. Read the [official sharing rules](https://tailscale.com/docs/features/sharing).

#### First-Time Participant Preparation

1. Install the official app on your device. On iPhone, follow the [iOS guide](https://tailscale.com/docs/install/ios), approve the VPN configuration and sign in with your agreed account. The organizer does not need to give you company credentials.
2. Open the invitation and verify the browser's sign-in method, account and receiving tailnet before accepting. In the app, select the same receiving account / tailnet and check Connected. If another tailnet is selected, stop and compare identities first.
3. Find the event host name supplied by the organizer and check its shared IP. Do not use your phone's own IP, a different Mac or an old registration. A shared host can appear across tailnets, so visibility alone does not prove common membership.
4. Compare that IP with the participant URL printed by the host and open `http://<event-host-IPv4>:5175/`. This LAN setup checks IP-based Host / Origin values; do not substitute a MagicDNS hostname. If sharing assigns a different recipient-side IP because of a conflict, stop and ask the organizer rather than proceeding with that address.

#### Verify, Play and Finish

Keep the Host Console on `127.0.0.1:5174`; do not forward or proxy it to participants. Give each participant only their team key. Before starting the event, verify only the 5175 page and login from the participant device. Gateways listen only while in use; every port in the range is not expected to answer continuously.

Administrators check and test effective policy for allowed 5175 / required gateways and denied 5174 / unnecessary services. Native-only events need no gateway permission. Port permissions, Tailscale machine sharing, the exercise Linux guard and application team-key authorization are separate boundaries. Sharing alone does not isolate exercises or the rest of a participant device.

On a participant PC, check only the approved event host, replacing the example IP:

```sh
EVENT_HOST_IP=100.96.12.34
curl --fail "http://${EVENT_HOST_IP}:5175/healthz"
nc -vz -w 3 "$EVENT_HOST_IP" 5175
nc -vz -w 3 "$EVENT_HOST_IP" 5174
```

Expect health `status: ok` / `role: participant`, successful TCP 5175 and unreachable 5174. On a phone, open the same `/healthz` in the browser. A failed 5174 connection alone does not prove ACL enforcement; administrators also verify policy tests. Check the actual issued gateway URL and active port, not responses from every unused port.

Start the event after everyone connects. Check native actions and scores; for Docker, use the portal-issued gateway URL to reach that team’s exercise. Check correct/incorrect submissions and hints where the problem supports them. End Event stops scoring; preserve needed results. Use Stop (keep data) to retain environments, then have the organizer stop the host through the maintenance procedure. Before selecting Teardown, confirm the deletion target and data impact.

Finally, the organizer uses the event host's Share dialog to Revoke invite for the recipient and cancel unused invitations. Verify in the Share dialog that the recipient and unused invitations are revoked. Failed participant reconnection is a supplementary check: failure after host shutdown alone does not prove revocation. This revokes sharing without deleting someone else's device. Joining again requires a fresh invitation and acceptance. Use a recipient-side removal menu only after verifying its target and scope; do not confuse it with generic Remove machine.

Check HTTP responses, replacing the example host IP:

```bash
# Run on the host
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:5174/
# Run on the participant device
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' http://100.96.12.34:5175/
```

Expect `200` before opening the login pages. If unreachable, check the startup URLs, that the IP belongs to the host and the existing network route. HTTP success does not verify authentication, scoring or Docker access.

Implementation references: [listener options](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/local-host/options.ts), [server](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/local-host/server.ts), [LAN engine composition](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/local-host/application.ts) and [Docker rejection conditions](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/local-host/docker-engine.ts). Run these checks from TenkaCloud's root for listener/origin behavior, unisolated LAN rejection, acquisition failures and snapshot/build consistency. These tests do not prove isolation on a real network.

```bash
make catalog-download catalog-prepare
bun test scripts/local-host/tests/public-mode.test.ts scripts/local-host/tests/catalog-startup.test.ts scripts/local-host/tests/lan-isolation.test.ts
```

For the `sqli-demo` steps below, return to default `make local` and the loopback participant URL, `http://127.0.0.1:5175`. Coordinate any shutdown/restart of a running LAN host with the organizer first.

Create an event and team, select `sqli-demo`, prepare the problem environments, and start from Schedule. Join with the participant URL and team key, then choose Start / resume to start the Docker environment. Follow the `Web` endpoint to the login page.

Verify the complete path:

1. The `Web` endpoint opens the login page
2. Solving the target reveals a flag unique to this run
3. Submit the flag through the Participant Portal
4. The submission is sent to that team’s problem environment at `/verify`
5. A correct answer records points

When finished, run the following command from the TenkaCloud root.

```bash
make down
```

`make down` stops the host and containers while preserving events, scores, keys, Docker writable layers, and volumes. It does not preserve process memory. Restart with the same data directory and use Start / resume. `make local-clear` deletes competition data and owned Docker data after confirmation; `make local-reset` reissues organizer access while preserving competition data. Noninteractive startup retains the existing key and does not print it.

## Review the Completed Implementation

The files built in this chapter are available here:

- [metadata.json](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/metadata.json)
- [Dockerfile](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/Dockerfile)
- [docker-compose.yml](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/docker-compose.yml)
- [server.mjs](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/app/server.mjs)

The first local Challenge is now complete. We created one continuous experience from the problem statement and Docker environment through `/verify` and submission in the Participant Portal.

The next chapter begins the second problem. We will design the learning outcome, story, win condition, and safety boundary for the AWS Challenge `hello-world`.
