#!/bin/bash
ROOT_PATH=$(dirname $0)
BIN_PATH="./bin"
SAMPLES_PATH="./samples"
SRC_PATH="./src"
set -e

cd ${ROOT_PATH}
mkdir -p ${BIN_PATH}

mkdir -p ${BIN_PATH}/hello
deno run --allow-read ${SRC_PATH}/main.ts ${SAMPLES_PATH}/hello.big > ${BIN_PATH}/hello/hello.js
deno run ${BIN_PATH}/hello/hello.js

# clang++ -std=c++20 -D_CRT_SECURE_NO_WARNINGS -I ./ext/fmt/include -I ./src/runtime  ${BIN_PATH}/hello/hello.cpp -o ${BIN_PATH}/hello/hello
# ${BIN_PATH}/hello/hello
