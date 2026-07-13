#!/bin/sh
set -eu

ARTICLE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BLOCKCHAIN_ROOT=${BLOCKCHAIN_ROOT:-"$ARTICLE_ROOT/../BlockChain"}

if [ "${1:-}" = "--" ]; then
    shift
fi

if [ ! -x "$BLOCKCHAIN_ROOT/scripts/verify-book-code.sh" ]; then
    echo "BlockChain verification script not found: $BLOCKCHAIN_ROOT/scripts/verify-book-code.sh" >&2
    echo "Set BLOCKCHAIN_ROOT to the local BlockChain checkout." >&2
    exit 1
fi

pnpm exec zenn list:books >/dev/null
sh "$BLOCKCHAIN_ROOT/scripts/verify-book-code.sh" "$@"
