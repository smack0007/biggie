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
typedef std::string string;
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

#define STRING_CONCAT(s1, s2) __string_concat(s1, s2)
inline string __string_concat(string s1, string s2) { return s1 + s2; }

#define STRING_LENGTH(str) __string_length(str)
inline size_t __string_length(const char* str) { return strlen(str); };
inline size_t __string_length(string str) { return str.length(); };

void println(string format) {
  printf("%.*s\n", (int)format.length(), format.data());
}

void __println(std::string value) { std::println("{}", value); }

template <typename... T>
void __println(std::format_string<T...> format, T&&... args) {
  std::println(format, std::forward<T>(args)...);
}

#define println(format, ...) __println(format, ##__VA_ARGS__)

template <typename E>
  requires std::is_enum_v<E>
struct std::formatter<E> : std::formatter<std::string> {
  constexpr auto format(const E& e, auto& ctx) const {
    using Base = std::formatter<std::string>;
    return Base::format(std::to_string(e), ctx);
  }
};