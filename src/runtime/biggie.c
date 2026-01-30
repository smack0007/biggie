#include <math.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>

typedef float_t float32;
typedef double_t float64;
typedef int8_t int8;
typedef int16_t int16;
typedef int32_t int32;
typedef int64_t int64;
typedef uint8_t uint8;
typedef uint16_t uint16;
typedef uint32_t uint32;
typedef uint64_t uint64;
typedef const char* string;

int println(const char* format, ...) {
  va_list args;
  va_start(args, format);
  int result = vprintf(format, args);
  printf("\n");
  va_end(args);
  return result;
}