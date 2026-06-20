function parseOtoolDependencies(output) {
  return String(output || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(' (')[0].trim())
    .filter(Boolean);
}

function isAllowedMacosDependency(dependency) {
  const value = String(dependency || '').trim();
  if (!value) return true;
  return value.startsWith('/System/Library/')
    || value.startsWith('/usr/lib/')
    || value.startsWith('@loader_path/')
    || value.startsWith('@executable_path/')
    || value.startsWith('@rpath/');
}

function forbiddenMacosDependencies(otoolOutput) {
  return parseOtoolDependencies(otoolOutput)
    .filter((dependency) => !isAllowedMacosDependency(dependency));
}

export {
  forbiddenMacosDependencies,
  isAllowedMacosDependency,
  parseOtoolDependencies
};
