import source from './spatial-shader.wgsl.js';
export const spatialWGSL = source;
// A bounded syntax lowering for the typed, expression-only scene module above.
// Resource access is supplied by each renderer; this is not a general translator.
export function spatialGLSL() {
    return source
        .replace(/struct (\w+)\s*\{([^}]+)\};/g, (_, name, fields) => `struct ${name} {${fields.replace(/(\w+):\s*(\w+),/g, '$2 $1;')}};`)
        .replace(/fn (\w+)\(([^)]*)\) -> (\w+)\s*\{/g, (_, name, args, type) => `${type} ${name}(${args.replace(/(\w+):\s*(\w+)/g, '$2 $1')}) {`)
        .replace(/\b(?:let|var) (\w+):\s*(\w+)/g, '$2 $1')
        .replace(/\bf32\b/g, 'float').replace(/\bi32\b/g, 'int')
        .replace(/\bvec([234])f\b/g, 'vec$1');
}
