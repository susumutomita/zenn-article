---
title: "How to Use the Book and Its Code"
free: true
---

This book is designed around a tight feedback loop: read a small explanation, change the code, run the nearest test, and observe the program. Do not begin by copying the completed implementation. The point is to watch the blockchain grow through a sequence of bounded changes.

This chapter defines the relationship between the manuscript and the executable examples. It also explains the workflow used in each implementation section and the commands that prove a checkpoint is working. Unless stated otherwise, every path is relative to the root of the code repository.

## Canonical code repository

The executable code for this book lives in [susumutomita/BlockChain](https://github.com/susumutomita/BlockChain). The manuscript lives in the separate [zenn-article repository](https://github.com/susumutomita/zenn-article), but the `BlockChain` repository is the source of truth for code that readers run.

Clone the code first:

```bash
git clone https://github.com/susumutomita/BlockChain.git
cd BlockChain
git switch main
```

The first English edition is pinned to Zig `0.14.0`. The repository's `Dockerfile` and CI use the same version. A different Zig release may change standard-library or build APIs and may not compile the examples without migration work.

Before modifying anything, verify the completed project:

```bash
docker build --build-arg ZIG_VERSION=0.14.0 -t zig-blockchain-book .
docker run --rm zig-blockchain-book zig build test
```

Once this passes, the environment is ready for the manuscript and code to be compared.

## The six-part workflow for an implementation section

Each implementation section follows the same six-part contract.

1. `Target path`
   Identify the file to change relative to the repository root, such as `src/blockchain.zig` or `references/chapter3/step2/src/main.zig`.
2. `Starting checkpoint`
   Confirm the state immediately before the section's change. If you begin in the middle of a chapter, test the starting checkpoint before editing it.
3. `Change in this section`
   Match the explanatory code with the complete change required by the chapter. Chapters 11 and 12 provide `references/book-patches/chapter11.patch` and `chapter12.patch`, so readers do not have to infer missing imports, helper functions, protocol code, or tests from explanatory excerpts.
4. `Test`
   Run the test closest to the changed function or type. Check rejection paths as well as successful input.
5. `Run`
   Execute `zig build run` or the Docker and multi-node command specified in the section.
6. `Expected result`
   Verify the property established by the section: the shape of a log, a valid chain link, the required number of leading zero bytes, a particular error category, or a replicated update on another node. Timestamps, nonces, hashes, and ports may differ between runs. Compare the required condition rather than expecting every byte of output to match the manuscript.

A section card uses this form:

```text
Target path:        references/chapter3/step2/src/main.zig
Starting checkpoint: ch03-sec01-block-struct
Change:             Add SHA-256 hash calculation
Test:               zig build test
Run:                zig build run
Expected result:    A 32-byte hash is printed in hexadecimal
```

## Logical checkpoint names

The manuscript names logical checkpoints with this pattern:

```text
chNN-secNN-short-name
```

- `NN` is a two-digit chapter or section number.
- `short-name` describes the completed capability in lowercase words separated by hyphens.
- Examples include `ch03-sec02-hash`, `ch04-sec02-mine-block`, and `ch08-sec03-relay-block`.
- A section normally begins from the checkpoint completed by the preceding section.

Some directories under `references/` predate this naming scheme and still use paths such as `chapter3/step1`. Use the mapping below to translate those physical paths into the logical checkpoints used by the manuscript.

Future Git tags may prefix the logical name with `book/`, for example `book/ch04-sec02-mine-block`. Not every section currently has a Git tag. Never run `git checkout` for a checkpoint marked as unavailable in the mapping.

## Mapping chapters to code snapshots

Each project under `references/` is normally self-contained and has its own `build.zig`. Chapter 10 contains a standalone EVM execution engine. Chapter 11 integrates the EVM into the blockchain. Chapter 12 adds the CLI and P2P EVM transaction path. The EVM section below fixes the exact relationship between sections, files, and tests.

The Japanese Zenn edition splits chapters 7, 8, and 10 into two files to stay under Zenn's per-file size limit. Each pair is one continuous logical chapter and uses the same working directory and ending snapshot. The English edition keeps the same logical checkpoints even when its final distribution groups files differently.

| Logical chapter | Main implementation | Corresponding code | Status |
| --- | --- | --- | --- |
| Chapter 2 | Zig, Docker, and build environment | [`references/chapter2/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter2) | Chapter snapshot |
| Chapter 3 | Blocks, hashes, and transactions | [`references/chapter3/step1/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step1) to [`step2/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step2) to [`step3/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step3) | Section snapshots |
| Chapter 4 | Nonce, Proof of Work, mining, and tests | [`references/chapter3/step4/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step4) to [`step4-2/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step4-2) to [`step5/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step5) | Section snapshots; directory numbering differs from the manuscript chapter number |
| Chapter 5 | Modularized blockchain | [`references/chapter5/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter5) | Chapter snapshot |
| Chapter 6 | P2P communication and a two-node connection | [`references/chapter6/step1/nodeA/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter6/step1/nodeA), [`nodeB/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter6/step1/nodeB), and [`step2/nodeA/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter6/step2/nodeA) | Section snapshots; step 2 uses one executable in listen and connect modes, so it does not need a separate node B snapshot |
| Chapter 7 | Block sharing between nodes | [`references/chapter7/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter7) | One snapshot for both parts of the chapter |
| Chapter 8 | Multiple peers, relay, and chain synchronization | [`references/chapter8/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter8) | One snapshot for both parts of the chapter |
| Chapter 9 | EVM introduction and 256-bit values | [`references/chapter9/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter9) | Snapshot that runs only `EVMu256` |
| Chapter 10 | Stack, memory, storage, and opcodes | [`references/chapter10/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter10) | One snapshot for both parts; completes `EVM result: 5 + 3 = 8` |
| Chapter 11 | Solidity execution and blockchain integration | [`references/chapter11/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter11) | Dedicated snapshot; does not yet include the Chapter 12 CLI, `EVM_TX`, or 64 KiB frame |
| Chapter 12 | CLI, P2P, and EVM transactions | [`references/EVMchapter/`](https://github.com/susumutomita/BlockChain/tree/main/references/EVMchapter) | Chapter 11 plus the complete Chapter 12 patch |
| Chapter 13 | EVM, P2P, and Proof-of-Work tests | [`references/EVMchapter/`](https://github.com/susumutomita/BlockChain/tree/main/references/EVMchapter) and [`src/`](https://github.com/susumutomita/BlockChain/tree/main/src) | Tests colocated with the completed modules |
| Chapter 14 | Acceptance of the completed node | [`contract/`](https://github.com/susumutomita/BlockChain/tree/main/contract) and [`src/`](https://github.com/susumutomita/BlockChain/tree/main/src) | Integrated scenario against the completed root project |
| Chapter 15 | Proof-of-Stake design | None | Not provided; a design exercise that is not integrated into the root `src/` |
| Chapter 16 | zkEVM, optimization, and future work | None | Conceptual material and advanced exercises |

There is also Proof-of-Work-like code under `references/chapter4/step1` through `step3`. For the current Chapter 4, use `references/chapter3/step4`, `step4-2`, and `step5` as listed above. Do not select a checkpoint only because its directory name looks similar.

The `references/books/` directory contains historical manuscript material. It is not part of the current reader path.

## Mapping the EVM sections to code

Chapters 9 and 10 build independent snapshots in stages. Chapter 11 ends at `references/chapter11/`. Chapter 12 ends at `references/EVMchapter/`. Excerpts in the prose explain the important mechanics, while the chapter patches contain the complete applicable changes, including imports, CLI parsing, helper functions, JSON handling, P2P behavior, and tests.

| Section | Target file | Check at the end of the section |
| --- | --- | --- |
| Chapter 9: 256-bit values | `references/chapter9/src/evm_types.zig` | `zig build test` and `zig build run` |
| Chapter 10: stack | `references/chapter10/src/evm_types.zig` | `zig test src/evm_types.zig --test-filter "EvmStack"` |
| Chapter 10: memory | `references/chapter10/src/evm_types.zig` | `zig test src/evm_types.zig --test-filter "EvmMemory"` |
| Chapter 10: storage | `references/chapter10/src/evm_types.zig` | `zig test src/evm_types.zig --test-filter "EvmStorage"` |
| Chapter 10: execution context | `references/chapter10/src/evm_types.zig` | `zig test src/evm_types.zig --test-filter "EvmContext"` |
| Chapter 10: execution loop and opcodes | `references/chapter10/src/evm.zig` | `zig test src/evm.zig` and `zig build run` |
| Chapter 11: Solidity contract | `references/chapter11/contract/SimpleAdder.sol` | Run `solc --bin --abi` to generate `Adder.bin` and `Adder.abi` |
| Chapter 11: ABI calldata | `references/chapter11/src/evm.zig` | `zig test src/evm.zig --test-filter "ABI calldata"` |
| Chapter 11: detailed errors | `references/chapter11/src/evm.zig` | `zig test src/evm.zig --test-filter "EVM execution with error info"` |
| Chapter 11: deployment block | `references/chapter11/src/blockchain.zig` | Run `zig build test --summary all` in the reader's working copy |
| Chapter 12: deploy and call CLI | `references/EVMchapter/src/main.zig` | Deploy and call on one node |
| Chapter 12: JSON conversion | `references/EVMchapter/src/parser.zig` | `zig test src/p2p.zig --test-filter JSON` |
| Chapter 12: `EVM_TX` and synchronization | `references/EVMchapter/src/p2p.zig` | `zig test src/p2p.zig` and a two-node check |

If a standalone `zig test` command fails to link on macOS 26, use the verification script:

```bash
sh scripts/verify-book-code.sh references/chapter10
sh scripts/verify-book-code.sh references/chapter11
sh scripts/verify-book-code.sh references/EVMchapter
```

The script runs all tests for the selected chapter snapshot inside Docker.

### Complete changes for Chapters 11 and 12

Chapter 11 starts from the P2P implementation in Chapter 8 and the EVM implementation in Chapter 10, then applies `references/book-patches/chapter11.patch`. Chapter 12 starts from the completed Chapter 11 working tree and applies `references/book-patches/chapter12.patch`. The manuscript gives the exact commands used to create each working copy.

After applying a patch, evaluate the reader's own `.zig-book-work/chapter11/` or `.zig-book-work/chapter12/`, not the checked-in example under `references/`. Run the following in the working copy:

```bash
zig fmt --check .
zig build test --summary all
zig build
```

Chapter 12 also runs one-node and two-node acceptance against that same working copy.

The repository's maintenance gate reconstructs both chapters from their starting points and proves that the results match the checked-in chapter snapshots:

```bash
sh scripts/rebuild-book-code.sh
BOOK_REBUILD_ACCEPTANCE=1 sh scripts/rebuild-book-code.sh
```

The first command rebuilds the trees and checks formatting, build output, and all tests. The second also runs the real TCP acceptance scenario for Chapter 12. This gate detects drift between the patches and the reference trees. It does not replace the chapter-end gate that validates the reader's own working copy.

## Learning snapshots and the evolving completed project

The repository contains two kinds of code with different purposes. Do not mix them.

### `references/` contains learning snapshots

A directory under `references/` represents the code at the end of a chapter or section. It lets you implement the next concept without seeing features that have not been introduced yet.

To inspect a change between two snapshots, run a comparison such as:

```bash
git diff --no-index \
  references/chapter3/step1/src/main.zig \
  references/chapter3/step2/src/main.zig
```

`git diff --no-index` returns exit code `1` when differences exist. That exit code does not mean the comparison failed.

### Root `src/` is the evolving completed implementation

The root [`src/`](https://github.com/susumutomita/BlockChain/tree/main/src) integrates the blockchain, P2P layer, EVM, and CLI. Bug fixes and improvements may move it beyond the exact state described by an earlier chapter.

Use the root project to inspect the final design. Use `references/` to reproduce an intermediate section. Copying the current root code into an early checkpoint can introduce types and functions that the manuscript has not explained yet.

Chapters 13 and 14 test and accept the completed system rather than add another major feature, so they refer to the completed EVM snapshot or the root project. Proof of Stake in Chapter 15 is not integrated into the root project and must not be presented as a completed root implementation.

## Verifying a snapshot

The Docker image built at the beginning contains the root project and `references/`. Select a snapshot with `-w` to test and run it in the same Zig `0.14.0` environment.

```bash
# Test Chapter 3, step 2
docker run --rm \
  -w /app/references/chapter3/step2 \
  zig-blockchain-book zig build test

# Run Chapter 3, step 2
docker run --rm \
  -w /app/references/chapter3/step2 \
  zig-blockchain-book zig build run

# Test Chapter 5
docker run --rm \
  -w /app/references/chapter5 \
  zig-blockchain-book zig build test

# Test only the end of Chapter 11
docker run --rm \
  -w /app/references/chapter11 \
  zig-blockchain-book zig build test

# Test the completed EVM snapshot
docker run --rm \
  -w /app/references/EVMchapter \
  zig-blockchain-book zig build test
```

When the matching Zig `0.14.0` toolchain is available locally, you can enter a snapshot and run the same operations without Docker:

```bash
cd references/chapter5
zig fmt --check .
zig build test
zig build run
```

The root project's basic verification commands are:

```bash
cd "$(git rev-parse --show-toplevel)"
zig fmt --check .
zig build test
zig build
```

Start one node from the root project with:

```bash
zig build run -- --listen 9000
```

The P2P and EVM chapters may also require multiple terminals, `docker compose`, or the Solidity compiler `solc`. In those cases, use the command specified by the chapter.

After a Compose exercise, always clean up from the same checkpoint directory before moving to another one:

```bash
docker compose down --remove-orphans
```

Early snapshots use fixed container names such as `node1`, `node2`, and `node3` to keep the exercise easy to follow. Leaving one checkpoint running can therefore cause name collisions when another checkpoint starts.

## Use Docker on macOS 26

On macOS 26, native `zig build` or `zig test` may fail at link time because of the combination of Zig `0.14.0` and the available `libSystem` stubs. This does not necessarily indicate a problem in the book's code. The standard path on macOS 26 is the Docker workflow described above.

The `Dockerfile` selects the correct Zig distribution from Docker's `TARGETARCH`, supporting both `amd64` and `arm64`. Apple Silicon therefore uses a native Linux Zig toolchain in the container instead of requiring x86 emulation.

For a native check of one file on Apple Silicon, specify the deployment target completely:

```bash
zig test src/blockchain.zig -target aarch64-macos.15.0.0
```

A full `zig build` must also link the build runner. Use Docker for whole chapters, multi-file projects, P2P scenarios, and the EVM exercises.

## Reading execution results

This implementation is educational. It is not intended to interoperate with a production blockchain or an Ethereum node. Each chapter implements only the subset required by its learning objective.

When output differs from the manuscript, check the system in this order:

1. Did the build and tests pass?
2. Did the process listen on the requested port?
3. Does each block's `prev_hash` equal the preceding block's `hash`?
4. Does the Proof-of-Work hash satisfy the difficulty defined by the chapter?
5. Was malformed input, an invalid block, or an unsupported instruction rejected with the expected error category?
6. In a P2P exercise, does the receiving node show the update as well as the sending node?
7. In an EVM exercise, do the halt reason, return value, and storage update match the section's expected behavior?

If a value is wrong, do not immediately replace the working tree with the completed root implementation. Return to the preceding checkpoint and repeat the six-part workflow. That process identifies the exact change where observed behavior diverged from the expected result.
