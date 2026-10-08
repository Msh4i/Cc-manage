// Lets plain node import the mod's extensionless TypeScript files (the Mods engine resolves them without an extension).
// Use: node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/<script>.mjs
import { register } from 'node:module'

register(new URL('./ts-resolve.mjs', import.meta.url))
