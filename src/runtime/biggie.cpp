#include <stdint.h>
#include <stdio.h>
#include <vector>
#define FMT_HEADER_ONLY
#include <fmt/core.h>

#define _CONCAT(a, b) a##b
#define CONCAT(a, b) _CONCAT(a, b)

typedef float_t f32;
typedef double_t f64;
typedef int8_t i8;
typedef int16_t i16;
typedef int32_t i32;
typedef int64_t i64;
typedef uint8_t u8;
typedef uint16_t u16;
typedef uint32_t u32;
typedef uint64_t u64;

typedef std::string string;

template <typename... T>
void println(fmt::format_string<T...> format, T &&...args) {
  fmt::println(format, std::forward<T>(args)...);
}

#include "array.cpp"
#include "defer.cpp"
