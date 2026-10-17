import path from 'node:path';

// URL paths use '/', while filesystem paths on Windows use '\\'. Check the
// resolved location with the platform's path rules before serving any file.
export function resolveStaticPath(directory, requested, paths = path) {
  const file = paths.resolve(directory, `.${requested}`);
  const relative = paths.relative(directory, file);
  if (paths.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${paths.sep}`)) return null;
  return file;
}
