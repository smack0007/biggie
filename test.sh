#!/bin/bash
set -eu

ROOT_PATH=$(dirname $0)

deno test src/

deno test --allow-env --allow-read=. --allow-run tests/