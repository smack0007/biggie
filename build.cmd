@ECHO off

IF NOT EXIST "bin" (
  mkdir bin
)

IF NOT EXIST "bin\hello" (
  mkdir bin\hello
)

CALL ts-node --transpile-only --log-error .\src\main.ts .\samples\hello.td > .\bin\hello\hello.c
clang -o .\bin\hello\hello.exe .\bin\hello\hello.c
.\bin\hello\hello.exe
