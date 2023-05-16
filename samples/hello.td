func sayHello(name: string): void {
  println("Hello {0}!", name);
}

func sayGoodbye(name: string): void {
  println("Goodbye {0}!", name);
}

func main(): i32 {
  defer sayGoodbye("Lamp");
  defer sayGoodbye("World");
  sayHello("World");
  return 42;
}
