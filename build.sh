#!/bin/bash
ROOT_PATH=$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
BIN_PATH="./bin"
SAMPLES_PATH="./samples"
SRC_PATH="./src"

cd ${ROOT_PATH}
mkdir -p ${BIN_PATH}

mkdir -p ${BIN_PATH}/hello
ts-node --transpile-only --log-error ${SRC_PATH}/main.ts ${SAMPLES_PATH}/hello.big > ${BIN_PATH}/hello/hello.mjs
node ${BIN_PATH}/hello/hello.mjs

# clang -o ${BIN_PATH}/hello/hello ${BIN_PATH}/hello/hello.c
# ${BIN_PATH}/hello/hello
