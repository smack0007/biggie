@ECHO off
CALL ts-node compile.ts program.ts > program.c
clang -o program.exe program.c
program
