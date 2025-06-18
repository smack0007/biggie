#include <fmt/format.h>
#include <vector>

template <typename T> class Array {
  std::vector<T> _data;

public:
  Array(const std::initializer_list<T> data) { _data = std::vector<T>(data); }

  Array(const Array &source) { _data = source._data; }

  Array(Array &&source) { _data = source._data; }

  T operator[](size_t i) const { return _data[i]; }
  T* operator&() const { return const_cast<T *>(&_data[0]); }

  size_t length() const { return _data.size(); }

  size_t push(T element) {
    _data.push_back(element);
    return _data.size();
  }

  T pop() {
    T result = _data[_data.size() - 1];
    _data.pop_back();
    return result;
  }
};

template <typename T> struct fmt::formatter<Array<T>> {
  template <typename ParseContext> constexpr auto parse(ParseContext &ctx) { return ctx.begin(); }

  template <typename FormatContext> auto format(Array<T> const &array, FormatContext &ctx) {
    fmt::format_to(ctx.out(), "[");

    for (size_t i = 0; i < array.length(); i++) {
      fmt::format_to(ctx.out(), " {0}", array[i]);

      if (i != array.length() - 1) {
        fmt::format_to(ctx.out(), ",");
      } else {
        fmt::format_to(ctx.out(), " ");
      }
    }

    return fmt::format_to(ctx.out(), "]");
  }
};