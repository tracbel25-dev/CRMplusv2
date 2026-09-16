import { access } from 'node:fs/promises';

const extensions = ['.ts', '.tsx', '.js', '.mjs'];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!context.parentURL || !specifier.startsWith('.') || /\.[a-z0-9]+$/i.test(specifier)) throw error;
    for (const extension of extensions) {
      const candidate = `${specifier}${extension}`;
      const url = new URL(candidate, context.parentURL);
      try {
        await access(url);
        return nextResolve(candidate, context);
      } catch {
        // tenta a próxima extensão
      }
    }
    throw error;
  }
}
