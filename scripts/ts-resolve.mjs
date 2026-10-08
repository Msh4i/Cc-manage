export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context)
    } catch {
      // fall through to the default rule
    }
  }
  return next(specifier, context)
}
