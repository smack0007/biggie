#!/bin/bash
set -eu

SRC_PATH="$(dirname $0)/src"
OUTPUT_DIR="$(dirname ${2})"

mkdir -p "${OUTPUT_DIR}"

deno run -q --allow-read "--allow-write=${OUTPUT_DIR}" ${SRC_PATH}/main.ts "${1}" -o "${2}.cpp"
clang++ -std=c++23 -D_CRT_SECURE_NO_WARNINGS -I ./src/runtime "${2}.cpp" -o "${2}"
