function sayHello(name: string): string {
  return sprintf("Hello %s!", name);
}

function main(): i32 {
  println(
    sayHello("World")
  );
  return 42;
}
