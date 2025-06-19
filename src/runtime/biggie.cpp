#include <stdint.h>
#include <stdio.h>
#include <vector>
#define FMT_HEADER_ONLY
#include <fmt/core.h>

#define _CONCAT(a, b) a##b
#define CONCAT(a, b) _CONCAT(a, b)

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

typedef std::string string;

template <typename... T>
void println(fmt::format_string<T...> format, T &&...args) {
  fmt::println(format, std::forward<T>(args)...);
}

#include "array.cpp"
#include "defer.cpp"
