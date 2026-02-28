#!/bin/bash
set -eu

SRC_PATH="$(dirname $0)/src"

mkdir -p $(dirname ${2})

deno run -q --allow-read --allow-write ${SRC_PATH}/main.ts ${1} -o ${2}.c

clang -std=c23 -D_CRT_SECURE_NO_WARNINGS -I ./src/runtime  ${2}.c -o ${2}

