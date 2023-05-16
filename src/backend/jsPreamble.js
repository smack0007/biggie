import * as process from "node:process";

function exit(status) {
  process.exit(status);
}

function println(format, ...args) {
  for (let i = 0; i < args.length; i++) {
    format = format.replaceAll(`{${i}}`, args[i]);
  }
  
  console.info(format);
}