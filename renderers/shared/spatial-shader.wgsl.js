// Original scene/effect math. This deliberately small typed WGSL subset is also
// lowered to GLSL by spatial-shader.js; native wgpu includes this exact source.
export default /* wgsl */ `
struct SceneHit {
    distance: f32,
    normal: vec3f,
    point: vec3f,
    material: f32,
};
struct SceneSample {
    color: vec3f,
    glyph: f32,
};
fn sceneHash(p: vec2f) -> f32 {
    let q: vec2f = floor(p);
    return fract((q.x * 17.0 + q.y * 43.0 + effect(0).w * 13.0) / 97.0);
}
fn sceneMod(x: f32, period: f32) -> f32 { return x - floor(x / period) * period; }
fn sceneMap(cell: vec2f) -> vec2f {
    let mode: f32 = effect(0).x;
    let z: f32 = sceneMod(cell.y, 32.0);
    let x: f32 = cell.x;
    if (abs(x) > 24.0) { return vec2f(0.0); }
    if (mode == 2.0) {
        if (x < -2.0 || x > 2.0) { return vec2f(4.0, 2.0); }
        return vec2f(0.0);
    }
    if (mode == 4.0) {
        if (abs(x) > 6.0) { return vec2f(7.0, 1.0); }
        if (abs(x) > 2.0 && sceneMod(z, 5.0) < 1.0) { return vec2f(6.0, 3.0); }
        return vec2f(0.0);
    }
    if (mode == 3.0 && x < 2.0) { return vec2f(0.0); }
    if (abs(x) < 3.0 || sceneMod(z, 8.0) < 2.0 || sceneMod(x + 3.0, 8.0) < 2.0) { return vec2f(0.0); }
    let n: f32 = sceneHash(vec2f(x, z));
    if (mode == 5.0) {
        let media: vec3f = sceneMedia(fract(vec2f(x * 0.0625, z * 0.03125)));
        return vec2f(0.15 + dot(media, vec3f(0.2126, 0.7152, 0.0722)) * effect(8).x, 4.0);
    }
    return vec2f(1.4 + n * 6.0, 1.0);
}
fn sceneTrace(ro: vec3f, rd: vec3f, farLimit: f32) -> SceneHit {
    var cell: vec2f = floor(ro.xz);
    let stepDir: vec2f = vec2f(choose(-1.0, 1.0, rd.x >= 0.0), choose(-1.0, 1.0, rd.z >= 0.0));
    let delta: vec2f = 1.0 / max(abs(rd.xz), vec2f(0.00001));
    var side: vec2f = (stepDir * (cell - ro.xz) + stepDir * 0.5 + 0.5) * delta;
    var entered: f32 = 0.0;
    var normal: vec3f = vec3f(0.0, 0.0, -stepDir.y);
    for (var i: i32 = 0; i < 64; i = i + 1) {
        let block: vec2f = sceneMap(cell);
        let exitDistance: f32 = min(side.x, side.y);
        if (block.x > 0.0) {
            let atEntry: f32 = ro.y + rd.y * entered;
            if (atEntry >= 0.0 && atEntry <= block.x && entered > 0.001) {
                return SceneHit(entered, normal, ro + rd * entered, block.y);
            }
            if (rd.y < -0.00001 && atEntry > block.x) {
                let top: f32 = (block.x - ro.y) / rd.y;
                if (top >= entered && top <= exitDistance && top < farLimit) {
                    return SceneHit(top, vec3f(0.0, 1.0, 0.0), ro + rd * top, block.y);
                }
            }
        }
        if (side.x < side.y) {
            entered = side.x;
            side.x = side.x + delta.x;
            cell.x = cell.x + stepDir.x;
            normal = vec3f(-stepDir.x, 0.0, 0.0);
        } else {
            entered = side.y;
            side.y = side.y + delta.y;
            cell.y = cell.y + stepDir.y;
            normal = vec3f(0.0, 0.0, -stepDir.y);
        }
        if (entered >= farLimit) { break; }
    }
    return SceneHit(farLimit, vec3f(0.0), ro + rd * farLimit, 0.0);
}
fn sceneMapped(uvIn: vec2f, surfaceAspect: f32) -> vec3f {
    var uv: vec2f = fract(uvIn);
    let fit: f32 = effect(1).w;
    let ratio: f32 = sceneSourceAspect() / surfaceAspect;
    if (fit == 1.0) {
        uv = (uv - 0.5) * vec2f(max(1.0, 1.0 / ratio), max(1.0, ratio)) + 0.5;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { return vec3f(0.01); }
    }
    if (fit == 2.0) { uv = (uv - 0.5) * vec2f(min(1.0, 1.0 / ratio), min(1.0, ratio)) + 0.5; }
    return sceneMedia(uv);
}
fn sceneSky(rd: vec3f) -> vec3f {
    let sky: vec3f = mix(vec3f(0.035, 0.065, 0.15), vec3f(0.18, 0.04, 0.19), exp(-abs(rd.y) * 9.0));
    let star: f32 = choose(0.0, 0.45, sceneHash(floor(rd.xz * 120.0 / max(0.1, rd.y))) > 0.989 && rd.y > 0.15);
    return sky + vec3f(star);
}
fn sceneSurface(hit: SceneHit) -> SceneSample {
    let p: vec3f = hit.point;
    let side: f32 = choose(p.x, p.z, abs(hit.normal.x) > 0.5);
    let uv: vec2f = vec2f(side * 0.125, 1.0 - p.y * 0.25);
    let windowCell: vec2f = floor(vec2f(sceneMod(side, 32.0) * 3.0, p.y * 2.5));
    let windowUV: vec2f = fract(vec2f(side * 3.0, p.y * 2.5));
    let lit: f32 = choose(0.0, 1.0, sceneHash(windowCell) > 0.32 && windowUV.x > 0.18 && windowUV.x < 0.76 && windowUV.y > 0.18 && windowUV.y < 0.72 && hit.normal.y < 0.5);
    let tint: vec3f = mix(vec3f(0.03, 0.62, 0.95), vec3f(1.0, 0.16, 0.46), sceneHash(floor(vec2f(p.x - hit.normal.x * 0.001, sceneMod(p.z - hit.normal.z * 0.001, 32.0)))));
    let light: f32 = (0.25 + 0.6 * max(0.0, dot(hit.normal, normalize(vec3f(-0.6, 0.8, -0.4))))) * effect(2).y;
    let contact: f32 = 0.45 + 0.55 * smoothstep(0.0, 0.7, p.y);
    let pulse: f32 = 0.85 + 0.15 * sin(effect(0).z * 0.8 + sceneHash(windowCell) * 6.28);
    let windowGlow: f32 = exp(-length(windowUV - vec2f(0.47, 0.45)) * 5.0) * effect(2).z * 0.25;
    var color: vec3f = vec3f(0.16, 0.2, 0.29) * light * contact + tint * (lit * 0.85 + windowGlow) * effect(2).z * pulse;
    var media: vec3f = sceneMapped(uv, 2.0);
    if (hit.normal.y > 0.5) { media = sceneMapped(p.xz * 0.125, 1.0); }
    color = mix(color, media * (0.5 + light), effect(1).z);
    if (hit.material == 3.0) { color = color + tint * 0.25 * effect(2).z; }
    let fog: f32 = 1.0 - exp(-hit.distance * effect(2).x);
    color = mix(color, vec3f(0.065, 0.095, 0.17), fog);
    let glyph: f32 = choose(effect(7).y, effect(7).z, lit > 0.5);
    return SceneSample(color, glyph);
}
fn orbitalDistance(p: vec3f) -> f32 {
    let t: f32 = effect(0).z * 0.3;
    let center: vec3f = vec3f(sin(t) * 0.9, cos(t * 0.7) * 0.4, 0.0);
    let sphere: f32 = length(p - center) - 0.95;
    let torus: f32 = length(vec2f(length(p.xz) - 1.65, p.y)) - 0.22;
    return min(sphere, torus);
}
fn sceneOrbitals(uv: vec2f) -> SceneSample {
    let plane: f32 = tan(effect(1).x * 0.5);
    let q: vec2f = (uv * 2.0 - 1.0) * vec2f(plane, -plane / max(0.2, effect(4).y));
    let ro: vec3f = vec3f(0.0, effect(1).y - 0.6, -5.0);
    let rd: vec3f = normalize(vec3f(q, 1.0));
    var t: f32 = 0.0;
    for (var i: i32 = 0; i < 48; i = i + 1) {
        let p: vec3f = ro + rd * t;
        let d: f32 = orbitalDistance(p);
        if (d < 0.006) {
            let n: vec3f = normalize(vec3f(orbitalDistance(p + vec3f(0.01,0.0,0.0)) - d, orbitalDistance(p + vec3f(0.0,0.01,0.0)) - d, orbitalDistance(p + vec3f(0.0,0.0,0.01)) - d));
            let light: f32 = 0.2 + max(0.0, dot(n, normalize(vec3f(-0.4, 0.8, -0.6))));
            let bands: f32 = 0.5 + 0.5 * sin(p.y * 18.0 + effect(0).z);
            let color: vec3f = mix(vec3f(0.08,0.8,0.98), vec3f(1.0,0.12,0.6), bands) * light * effect(2).y;
            return SceneSample(mix(color, sceneMapped(vec2f(p.x, -p.y) * 0.25 + 0.5, 1.0), effect(1).z), effect(7).y);
        }
        t = t + max(0.004, d);
        if (t > 14.0) { break; }
    }
    return SceneSample(mix(sceneSky(rd), sceneMedia(uv) * 0.55, effect(1).z), effect(7).w);
}
fn sceneSample(uv: vec2f) -> SceneSample {
    if (effect(0).x == 6.0) { return sceneOrbitals(uv); }
    let time: f32 = effect(0).z;
    let route: f32 = effect(0).y;
    let cameraX: f32 = 0.5 + choose(0.0, sin(time * 0.22) * 0.85, route == 1.0);
    let angle: f32 = choose(0.0, sin(time * 0.14) * 0.32, route == 1.0) + choose(0.0, time * 0.25, route == 2.0);
    let ro: vec3f = vec3f(cameraX, effect(1).y, sceneMod(time, 32.0) + 0.5);
    let plane: f32 = tan(effect(1).x * 0.5);
    let q: vec2f = vec2f((uv.x * 2.0 - 1.0) * plane, (1.0 - uv.y * 2.0) * plane / max(0.2, effect(4).y));
    let rd: vec3f = vec3f(sin(angle) + cos(angle) * q.x, q.y, cos(angle) - sin(angle) * q.x);
    var hit: SceneHit = sceneTrace(ro, rd, 40.0);
    var result: SceneSample = SceneSample(sceneSky(rd), effect(7).w);
    var surfaceDistance: f32 = hit.distance;
    if (hit.material > 0.0) { result = sceneSurface(hit); }
    if (rd.y < -0.0001) {
        let floorT: f32 = -ro.y / rd.y;
        if (floorT < hit.distance) {
            surfaceDistance = floorT;
            let floorP: vec3f = ro + rd * floorT;
            let lane: f32 = choose(0.0, 0.25, abs(floorP.x - 0.5) < 0.045 && sceneMod(floorP.z, 4.0) < 1.6);
            let grid: f32 = choose(0.0, 0.08, fract(floorP.x) < 0.025 || fract(floorP.z) < 0.025);
            var floorColor: vec3f = vec3f(0.07, 0.10, 0.15) + vec3f(lane, lane * 0.7, grid);
            floorColor = mix(floorColor, sceneMapped(floorP.xz * 0.125, 1.0) * 0.55, effect(1).z);
            if (effect(2).w > 0.0) {
                let ripple: f32 = sin(floorP.z * 12.566370614 + time * 3.0) * sin(floorP.x * 12.0 - time) * 0.018;
                let reflectedRay: vec3f = vec3f(rd.x + ripple, -rd.y, rd.z);
                let reflection: SceneHit = sceneTrace(floorP + vec3f(0.0, 0.015, 0.0), reflectedRay, max(0.1, 40.0 - floorT));
                var reflected: vec3f = sceneSky(reflectedRay);
                if (reflection.material > 0.0) { reflected = sceneSurface(reflection).color; }
                let fresnel: f32 = 0.25 + 0.65 * pow(1.0 - min(1.0, abs(normalize(rd).y)), 3.0);
                floorColor = mix(floorColor, reflected, effect(2).w * fresnel);
            }
            result = SceneSample(mix(floorColor, vec3f(0.065, 0.095, 0.17), 1.0 - exp(-floorT * effect(2).x)), effect(7).x);
        }
    }
    let ceiling: f32 = choose(4.0, 7.0, effect(0).x == 4.0);
    if ((effect(0).x == 2.0 || effect(0).x == 4.0) && rd.y > 0.0001) {
        let ceilingT: f32 = (ceiling - ro.y) / rd.y;
        if (ceilingT > 0.0 && ceilingT < surfaceDistance) {
            surfaceDistance = ceilingT;
            let p: vec3f = ro + rd * ceilingT;
            let rib: f32 = choose(0.0, 0.45, sceneMod(sceneMod(p.z, 32.0), 5.0) < 0.12);
            let base: vec3f = vec3f(0.08,0.13,0.2) + vec3f(rib * 0.3, rib * 0.65, rib);
            result = SceneSample(mix(base, sceneMapped(p.xz * 0.125, 1.0) * 0.8, effect(1).z), effect(7).y);
        }
    }
    if (effect(3).x > 0.0) {
        // Four world-space sheets; compare their ray distance with the opaque hit.
        // The streaks move down in world coordinates and cannot bleed through walls.
        for (var i: i32 = 0; i < 4; i = i + 1) {
            let depth: f32 = 3.0 + f32(i) * 5.0;
            if (depth < surfaceDistance) {
                let p: vec3f = ro + rd * depth;
                let rainCell: vec2f = floor(vec2f(p.x, sceneMod(p.z, 32.0)) * 3.0);
                let drop: f32 = sceneHash(rainCell);
                let stroke: f32 = fract(p.y * 0.7 + time * 2.5 + drop);
                if (drop > 1.0 - effect(3).x * 0.25 && fract(p.x * 3.0) < 0.06 && stroke > 0.62) {
                    result.color = result.color + vec3f(0.3,0.5,0.7) * (1.0 - depth / 40.0);
                    result.glyph = effect(6).y;
                }
            }
        }
    }
    return result;
}
fn sceneFinish(cell: vec4f, uv: vec2f, materialGlyph: f32) -> vec4f {
    var color: vec3f = cell.rgb;
    var alpha: f32 = cell.a;
    if (effect(8).w > 0.5) { alpha = min(0.999, alpha) * effect(5).z / effect(5).w; }
    // Fade the material override with the procedural/media blend, so source
    // luminance and shapes choose glyphs on media-dominant surfaces.
    let cellXY: vec2f = floor(uv * vec2f(effect(3).w, effect(4).x));
    let materialMask: f32 = sceneMod(cellXY.x + cellXY.y * 3.0, 16.0) / 16.0;
    if (effect(0).x > 0.0 && effect(3).y > 0.5 && materialMask >= effect(1).z && dot(color, vec3f(0.2126,0.7152,0.0722)) > 0.075) { alpha = materialGlyph; }
    if (effect(3).z > 0.0 && effect(0).x == 0.0) {
        let px: vec2f = vec2f(1.0 / effect(3).w, 1.0 / effect(4).x);
        let gx: f32 = dot(sceneMedia(uv + vec2f(px.x,0.0)) - sceneMedia(uv - vec2f(px.x,0.0)), vec3f(0.2126,0.7152,0.0722));
        let gy: f32 = dot(sceneMedia(uv + vec2f(0.0,px.y)) - sceneMedia(uv - vec2f(0.0,px.y)), vec3f(0.2126,0.7152,0.0722));
        let strength: f32 = length(vec2f(gx,gy));
        let previous: vec4f = sceneHistory(uv);
        let threshold: f32 = mix(0.35, 0.045, effect(3).z);
        if (strength > threshold) {
            if (abs(gx) > abs(gy) * 2.0) { alpha = effect(6).y; }
            else if (abs(gy) > abs(gx) * 2.0) { alpha = effect(6).x; }
            else { alpha = choose(effect(6).z, effect(6).w, gx * gy > 0.0); }
            if (effect(5).y > 0.5 && strength < threshold * 1.35 && previous.a >= effect(6).x && previous.a <= effect(6).w) { alpha = previous.a; }
        }
    }
    if (effect(4).z > 0.0) {
        let angle: f32 = effect(5).x;
        let p: vec2f = (uv - 0.5) * exp(-effect(4).w);
        let oldUV: vec2f = vec2f(p.x * cos(angle) - p.y * sin(angle), p.x * sin(angle) + p.y * cos(angle)) + 0.5;
        let previous: vec4f = sceneHistory(oldUV);
        var oldColor: vec3f = previous.rgb * effect(4).z;
        if (effect(8).y > 0.5) { oldColor = max(vec3f(0.0), oldColor - vec3f(effect(8).z * (60.0 / 255.0))); }
        if (dot(oldColor, vec3f(0.2126,0.7152,0.0722)) > dot(color, vec3f(0.2126,0.7152,0.0722))) { alpha = previous.a; }
        color = max(color, oldColor);
    }
    return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), alpha);
}
`;
