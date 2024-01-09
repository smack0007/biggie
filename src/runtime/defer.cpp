template <typename T>
struct __DeferFunc {
  T func;
  __DeferFunc(T func) : func(func) {}
  ~__DeferFunc() { func(); }
  __DeferFunc(const __DeferFunc &other) : func(other.func) {}
  __DeferFunc &operator=(const __DeferFunc &other) { func = other.lamda; };
};

struct __CaptureDeferFunc {
  template <typename T>
  __DeferFunc<T> operator+(T t) {
    return t;
  }
};

#define defer const auto &CONCAT(__defer_, __LINE__) = __CaptureDeferFunc() + [&]()