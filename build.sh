#!/bin/bash
set -eu

SRC_PATH="$(dirname $0)/src"

mkdir -p $(dirname ${2})

deno run -q --allow-read ${SRC_PATH}/main.ts ${1} > ${2}.c

clang -std=c17 -D_CRT_SECURE_NO_WARNINGS -I ./ext/fmt/include -I ./src/runtime  ${2}.c -o ${2}

