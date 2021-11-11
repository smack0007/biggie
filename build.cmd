@ECHO off

IF NOT EXIST "bin" (
  mkdir bin
)

IF NOT EXIST "bin\hello" (
  mkdir bin\hello
)

CALL ts-node .\src\compile.ts .\samples\hello.ts > .\bin\hello\hello.c
clang -o .\bin\hello\hello.exe .\bin\hello\hello.c
.\bin\hello\hello.exe
