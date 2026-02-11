#include <math.h>
#include <stdarg.h>
#include <stddef.h>
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

typedef struct String {
  char* data;
  ptrdiff_t length;
} String;
#define STR(str) ((String){str, sizeof(str) - 1})
typedef String string;

void println(string format, void* args[]) {
  int argIndex = 0;
  for (int i = 0; i < format.length; i += 1) {
    if (format.data[i] == '%') {
      i += 1;
      if (format.data[i] == 's') {
        char* data = (*(string*)args[argIndex]).data;
        printf("%s", data);
        argIndex += 1;
      } else if (format.data[i] == 'd') {
        int32 data = *(int32*)args[argIndex];
        printf("%d", data);
        argIndex += 1;
      }
    } else {
      putchar(format.data[i]);
    }
  }
  putchar('\n');
}
