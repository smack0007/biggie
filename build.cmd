@ECHO off

IF NOT EXIST "bin" (
  mkdir bin
)

IF NOT EXIST "bin\hello" (
  mkdir bin\hello
)

CALL ts-node --files --transpile-only --log-error .\src\main.ts .\samples\hello.ts
REM clang -o .\bin\hello\hello.exe .\bin\hello\hello.c
REM .\bin\hello\hello.exe
