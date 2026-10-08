// The only doors to the outside world. register.ts implements them with $.fs and $.process;
// tests implement them in memory. No other file in src/ touches files or processes.
export type Io = {
  read: (path: string) => Promise<string | undefined> // undefined when missing
  write: (path: string, text: string) => Promise<void> // creates parent folders
  list: (dir: string) => Promise<string[]> // file names; [] when missing
  move: (from: string, to: string) => Promise<void>
  exec: (argv: string[]) => Promise<{ code: number; out: string }>
}
