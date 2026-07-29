---
title: "Set Up the Development Environment"
free: true
---

Before implementing the blockchain, we need a reproducible development environment.

This chapter sets up Zig in Docker, introduces Docker Compose for running multiple nodes on one machine, and adds a GitHub Actions workflow that checks formatting and tests on every change.

## What this chapter establishes

By the end of the chapter, you will have:

- Zig `0.14.0` available either locally or through Docker
- a minimal Zig project that prints `Hello, world`
- a Docker image that works on both `amd64` and `arm64`
- a three-container Compose environment
- a CI workflow that pins the Zig version and runs the test suite

The executable checkpoint for this chapter is available in [`references/chapter2/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter2).

## Install Zig

The simplest native installation is to download a binary archive from the official [Zig download page](https://ziglang.org/download/) and add the extracted directory to your `PATH`. The official [Getting Started guide](https://ziglang.org/learn/getting-started/) describes the process for each platform.

After installation, verify the compiler version:

```bash
zig version
```

The first edition of this book is pinned to the following version:

```text
0.14.0
```

A newer Zig release may require source or build-system changes. Use the supplied Docker environment when you want the exact toolchain used by the book.

On macOS, Homebrew can install Zig, but Homebrew normally tracks a newer release. Do not assume that `brew install zig` will provide `0.14.0`.

## Create a Zig project

Create an empty directory and initialize a project:

```bash
mkdir zig-blockchain
cd zig-blockchain
zig init
```

Zig creates the build configuration and starter sources:

```text
info: created build.zig
info: created build.zig.zon
info: created src/main.zig
info: created src/root.zig
info: see `zig build --help` for a menu of options
```

Replace `src/main.zig` with the following program:

```zig
const std = @import("std");

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();
    try stdout.print("Hello, {s}\n", .{"world"});
}
```

Build and run it:

```bash
zig build run
```

Expected output:

```text
Hello, world
```

Zig produces a native executable. It does not require a language-specific virtual machine at runtime.

For editor support, install the Zig Language Server, usually called ZLS. Visual Studio Code and other major editors can use ZLS for diagnostics, completion, symbol navigation, and formatting support.

## Build a reproducible Docker image

Running Zig natively is convenient, but the book uses Docker as the reproducibility boundary. Docker avoids differences in locally installed compilers, operating-system libraries, and CPU architecture.

Create a `Dockerfile` in the project root:

```Dockerfile
FROM alpine:latest

RUN apk add --no-cache curl tar xz

ARG ZIG_VERSION=0.14.0
ARG TARGETARCH
ENV ZIG_VERSION=${ZIG_VERSION}

RUN case "${TARGETARCH}" in \
      amd64) ZIG_ARCH=x86_64 ;; \
      arm64) ZIG_ARCH=aarch64 ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    ZIG_DIST="zig-linux-${ZIG_ARCH}-${ZIG_VERSION}" && \
    curl -fLO "https://ziglang.org/download/${ZIG_VERSION}/${ZIG_DIST}.tar.xz" && \
    mkdir -p /opt/zig && \
    tar -xf "${ZIG_DIST}.tar.xz" -C /opt/zig --strip-components=1 && \
    rm "${ZIG_DIST}.tar.xz"

ENV PATH="/opt/zig:${PATH}"

RUN addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    mkdir -p /app && \
    chown -R appuser:appgroup /app

WORKDIR /app
COPY --chown=appuser:appgroup . .
USER appuser

CMD ["zig", "build", "run"]
```

This image downloads the pinned Zig release directly from the official distribution site. `TARGETARCH` lets the same Dockerfile select the correct archive on Intel/AMD and ARM machines, including Apple Silicon hosts.

The container runs as an unprivileged user rather than as `root`. That keeps generated files from becoming root-owned when the project is mounted from the host later in the book.

Build the image and run the program:

```bash
docker build --build-arg ZIG_VERSION=0.14.0 -t zig-blockchain-book .
docker run --rm zig-blockchain-book
```

Expected output:

```text
Hello, world
```

You can also verify the compiler inside the image:

```bash
docker run --rm zig-blockchain-book zig version
```

Expected output:

```text
0.14.0
```

## Run multiple nodes with Docker Compose

A distributed system is easier to understand when several independent processes can run at the same time. Docker Compose gives each service its own container while attaching all services to a shared network.

Containers in the same Compose project can resolve one another by service name. For example, `node1` can connect to `node2:3000` without knowing the host machine's IP address.

Create `docker-compose.yml` in the project root:

```yaml
services:
  node1:
    build: .
    container_name: node1
    ports:
      - "3001:3000"
    environment:
      - NODE_ID=1

  node2:
    build: .
    container_name: node2
    ports:
      - "3002:3000"
    environment:
      - NODE_ID=2

  node3:
    build: .
    container_name: node3
    ports:
      - "3003:3000"
    environment:
      - NODE_ID=3
```

At this point, every service still runs the same Hello World program. The distinct `NODE_ID` values and host ports prepare the environment for later chapters, where each process becomes a blockchain node.

Start all three services:

```bash
docker compose up
```

Representative output:

```text
[+] Running 3/3
 ✔ Container node1  Recreated
 ✔ Container node2  Recreated
 ✔ Container node3  Recreated
Attaching to node1, node2, node3
node1  | Hello, world
node2  | Hello, world
node3  | Hello, world
node1 exited with code 0
node2 exited with code 0
node3 exited with code 0
```

The order of the lines is not significant. The containers run concurrently, so their output may be interleaved differently on each run.

Remove the fixed-name containers before continuing:

```bash
docker compose down --remove-orphans
```

This cleanup step matters because later checkpoints also use container names such as `node1`, `node2`, and `node3`.

## Add continuous integration with GitHub Actions

Continuous integration automatically builds and tests a project whenever code changes. It catches compiler errors, formatting drift, and test failures before they are merged.

Create `.github/workflows/ci.yml`:

```yaml
name: Zig CI

permissions:
  contents: read

on:
  push: {}
  pull_request: {}

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Zig
        uses: goto-bus-stop/setup-zig@v2
        with:
          version: 0.14.0
          cache: false

      - name: Check formatting
        run: zig fmt --check .

      - name: Run tests
        run: zig build test
```

The workflow runs for pushes and pull requests. It checks out the repository, installs the pinned compiler, checks formatting, and runs the Zig test suite.

Pinning the compiler in CI is essential. Without that pin, a new Zig release could change the standard library or build API and make a previously valid chapter fail for reasons unrelated to the lesson.

The production repository extends this workflow with additional book-specific gates. It verifies every checkpoint, runs multi-node acceptance scenarios, reconstructs Chapters 11 and 12 from their public patches, and executes the completed EVM scenario. Those gates are introduced when the corresponding features appear in the book.

## Verify the chapter checkpoint

Clone the canonical code repository and run the chapter snapshot:

```bash
git clone https://github.com/susumutomita/BlockChain.git
cd BlockChain

docker build --build-arg ZIG_VERSION=0.14.0 -t zig-blockchain-book .
docker run --rm \
  -w /app/references/chapter2 \
  zig-blockchain-book \
  zig build test

docker run --rm \
  -w /app/references/chapter2 \
  zig-blockchain-book \
  zig build run
```

The test command must succeed, and the run command must print:

```text
Hello, world
```

## Summary

You now have a pinned Zig toolchain, a native project, a multi-architecture Docker image, a three-service Compose environment, and a basic CI workflow.

The next chapter replaces Hello World with the first blockchain data structures: blocks, transactions, and SHA-256 hashes.
