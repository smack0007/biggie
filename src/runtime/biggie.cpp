#include <math.h>
#include <print>
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#define null NULL
typedef float_t float32;
typedef double_t float64;
typedef int8_t int8;
typedef int16_t int16;
typedef int32_t int32;
typedef int64_t int64;
typedef ptrdiff_t isize;
typedef uint8_t uint8;
typedef uint16_t uint16;
typedef uint32_t uint32;
typedef uint64_t uint64;
typedef size_t usize;

template <typename T>
struct __DeferFunc {
  T _func;

  __DeferFunc(T func) : _func(func) {}

  ~__DeferFunc() { _func(); }

  __DeferFunc(const __DeferFunc& other) : _func(other._func) {}

  __DeferFunc& operator=(const __DeferFunc& other) { _func = other._func; };
};

struct __CaptureDeferFunc {
  template <typename T>
  __DeferFunc<T> operator+(T t) {
    return t;
  }
};

#define __DEFER__(a, b) a##b
#define __DEFER(a, b) __DEFER__(a, b)
#define defer                                                                  \
  const auto& __DEFER(__defer_, __COUNTER__) = __CaptureDeferFunc() + [&]()

// typedef struct Array {
//   void* data;
//   ptrdiff_t length;
// } Array;
// #define ARRAY(arr, type) ((Array){arr, sizeof(arr) / sizeof(type)})
#define ARRAY_LENGTH(x) (sizeof(x) / sizeof((x)[0]))

typedef std::string string;
#define STRING(str) std::string(str)
#define STRING_CONCAT(s1, s2) __string_concat(s1, s2)
#define STRING_LENGTH(str) (str.length())

string __string_concat(string s1, string s2) { return s1 + s2; }

void println(string format) {
  printf("%.*s\n", (int)format.length(), format.data());
}

void println(string format, void* args[]) {
  int argIndex = 0;
  for (int i = 0; i < format.length(); i += 1) {
    if (format[i] == '%') {
      i += 1;
      if (format[i] == 's') {
        string data = (*(string*)args[argIndex]);
        printf("%.*s", (int)data.length(), data.data());
        argIndex += 1;
      } else if (format[i] == 'd') {
        int32 data = *(int32*)args[argIndex];
        printf("%d", data);
        argIndex += 1;
      }
    } else {
      putchar(format[i]);
    }
  }
  putchar('\n');
}
