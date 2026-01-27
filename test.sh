#!/bin/bash
set -eu

ROOT_PATH=$(dirname $0)

deno test --allow-read=. --allow-run tests/