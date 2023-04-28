#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

typedef int32_t i32;
typedef int64_t i64;
typedef uint32_t u32;
typedef uint64_t u64;

typedef char* string;

#define int i64
#define uint u64

int println(const char* format, ...) {
  va_list args;
  va_start(args, format);
  int ret = vprintf(format, args);
  va_end(args);
  puts("");
  return ret;
}
