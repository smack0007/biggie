function sayHello(name: string): void {
  println("Hello %s!", name);
}

function main(): i32 {
  sayHello("World");
  return 42;
}
