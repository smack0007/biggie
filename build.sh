#!/bin/bash
ROOT_PATH=$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
BIN_PATH="./bin"
SAMPLES_PATH="./samples"
SRC_PATH="./src"

cd ${ROOT_PATH}
mkdir -p ${BIN_PATH}

mkdir -p ${BIN_PATH}/hello
deno run --allow-read ${SRC_PATH}/main.ts ${SAMPLES_PATH}/hello.big > ${BIN_PATH}/hello/hello.cpp
# deno run ${BIN_PATH}/hello/hello.mjs

clang++ ${BIN_PATH}/hello/hello.cpp -o ${BIN_PATH}/hello/hello
${BIN_PATH}/hello/hello
