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
        if (x < -1.0 || x > 1.0) { return vec2f(3.2, 2.0); }
        return vec2f(0.0);
    }
    if (mode == 4.0) {
        if (abs(x) > 6.0) { return vec2f(9.0, 1.0); }
        if (abs(x) > 2.0 && abs(x) < 5.0 && sceneMod(z, 4.0) < 1.0) { return vec2f(7.5, 3.0); }
        return vec2f(0.0);
    }
    if (mode == 5.0) {
        if (x < -8.0 || x >= 8.0) { return vec2f(0.0); }
        let media: vec3f = sceneMedia(vec2f((x + 8.5) / 16.0, (z + 0.5) / 32.0));
        return vec2f(0.15 + sqrt(dot(media, vec3f(0.2126, 0.7152, 0.0722))) * effect(8).x, 4.0);
    }
    if (mode == 3.0 && x < 3.0) { return vec2f(0.0); }
    if (abs(x) < 3.0 || sceneMod(z, 8.0) < 2.0 || sceneMod(x + 3.0, 8.0) < 2.0) { return vec2f(0.0); }
    let n: f32 = sceneHash(vec2f(x, z));
    return vec2f(choose(1.4 + n * 6.0, 0.8 + n * 2.4, mode == 3.0), 1.0);
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
    if (hit.material == 4.0) {
        let block: vec2f = floor(p.xz - hit.normal.xz * 0.001);
        media = sceneMedia(vec2f((block.x + 8.5) / 16.0, (sceneMod(block.y, 32.0) + 0.5) / 32.0));
    }
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
    let angle: f32 = 0.65 + t * 0.7;
    let tilted: vec3f = vec3f(p.x, p.y * cos(angle) - p.z * sin(angle), p.y * sin(angle) + p.z * cos(angle));
    let torus: f32 = length(vec2f(length(tilted.xz) - 1.65, tilted.y)) - 0.22;
    return min(sphere, torus);
}
// Camera-plane rays preserve straight edges and work for every scene.
fn sceneRay(q: vec2f, yaw: f32, pitch: f32) -> vec3f {
    let forward: vec3f = vec3f(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch));
    let right: vec3f = vec3f(cos(yaw), 0.0, -sin(yaw));
    let up: vec3f = vec3f(-sin(yaw) * sin(pitch), cos(pitch), -cos(yaw) * sin(pitch));
    return forward + right * q.x + up * q.y;
}
fn sceneOrbitals(uv: vec2f) -> SceneSample {
    let plane: f32 = tan(effect(1).x * 0.5);
    let q: vec2f = (uv * 2.0 - 1.0) * vec2f(plane, -plane / max(0.2, effect(4).y));
    let orbit: f32 = choose(0.0, sin(effect(0).z * 0.22) * 0.35, effect(0).y == 1.0) + choose(0.0, effect(0).z * 0.25, effect(0).y == 2.0);
    let ro: vec3f = vec3f(sin(orbit) * 4.6, effect(1).y, -cos(orbit) * 4.6);
    let rd: vec3f = normalize(sceneRay(q, -orbit, effect(9).x));
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
    return SceneSample(mix(sceneSky(rd), sceneMedia(uv) * 0.12, effect(1).z), effect(7).w);
}
// Bounded distance estimators: recursive ruins, Mandelbulb and Mandelbox.
fn fractalBox(p: vec3f, bounds: vec3f) -> f32 {
    let q: vec3f = abs(p) - bounds;
    return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}
fn fractalDistance(point: vec3f) -> f32 {
    let zoom: f32 = effect(9).y;
    let p: vec3f = point / zoom;
    let shape: f32 = effect(9).w;
    let detail: f32 = effect(9).z;
    if (effect(0).x == 7.0) {
        let cell: vec2f = floor(p.xz / 6.0);
        let height: f32 = 1.4 + sceneHash(vec2f(cell.x, sceneMod(cell.y, 16.0))) * 2.8;
        let q: vec3f = vec3f(sceneMod(p.x, 6.0) - 3.0, p.y - height, sceneMod(p.z, 6.0) - 3.0);
        var distance: f32 = fractalBox(q, vec3f(2.1, height, 2.1));
        var scale: f32 = 0.5;
        for (var i: i32 = 0; i < 8; i = i + 1) {
            if (f32(i) >= detail) { break; }
            let a: vec3f = fract(q * scale * 0.5 + 0.5) * 2.0 - 1.0;
            scale = scale * 3.0;
            let holes: vec3f = abs(1.0 - abs(a) * 3.0);
            let crossHole: f32 = min(max(holes.x, holes.y), min(max(holes.y, holes.z), max(holes.z, holes.x)));
            distance = max(distance, (crossHole - (0.7 + shape * 0.5)) / scale);
        }
        return min(distance, p.y + 0.3) * zoom;
    }
    var z: vec3f = p;
    var derivative: f32 = 1.0;
    if (effect(0).x == 9.0) {
        let power: f32 = 6.0 + shape * 3.0;
        for (var i: i32 = 0; i < 8; i = i + 1) {
            let radius: f32 = max(length(z), 0.00001);
            if (radius > 4.0 || f32(i) >= detail) { break; }
            let theta: f32 = acos(clamp(z.y / radius, -1.0, 1.0)) * power;
            var phi: f32 = 0.0;
            if (dot(z.xz, z.xz) > 0.000000000001) { phi = atan2(z.z, z.x) * power; }
            let raised: f32 = pow(radius, power - 1.0);
            derivative = raised * power * derivative + 1.0;
            z = (raised * radius) * vec3f(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi)) + p;
        }
        let radius: f32 = max(length(z), 0.00001);
        return 0.5 * log(radius) * radius / derivative * zoom;
    }
    let scale: f32 = -1.7 - shape * 0.6;
    for (var i: i32 = 0; i < 8; i = i + 1) {
        if (f32(i) >= detail) { break; }
        z = clamp(z, vec3f(-1.0), vec3f(1.0)) * 2.0 - z;
        let fold: f32 = clamp(1.0 / max(dot(z, z), 0.0001), 1.0, 4.0);
        z = z * fold * scale + p;
        derivative = derivative * fold * abs(scale) + 1.0;
    }
    return (length(z) / derivative - 0.002) * zoom;
}
fn fractalTint(phase: f32) -> vec3f {
    return 0.5 + cos(vec3f(phase) + vec3f(0.0, 2.1, 4.2)) * 0.45;
}
fn sceneMandelbrot(uv: vec2f) -> SceneSample {
    let time: f32 = effect(0).z;
    let spin: f32 = effect(9).x + choose(0.0, time * 0.07, effect(0).y == 2.0);
    let q: vec2f = (uv * 2.0 - 1.0) * vec2f(1.0, 1.0 / effect(4).y);
    let rotated: vec2f = vec2f(q.x * cos(spin) - q.y * sin(spin), q.x * sin(spin) + q.y * cos(spin));
    // A bounded zoom cycle stays within reliable float32 precision.
    let scale: f32 = 1.65 * exp(-2.8 * (0.5 - 0.5 * cos(time * 0.13))) / effect(9).y;
    let media: vec3f = sceneMapped(uv, effect(4).y);
    let c: vec2f = vec2f(-0.7435, 0.1314 + (effect(1).y - 1.25) * 0.1) + rotated * scale * tan(effect(1).x * 0.5) + (media.rg - 0.5) * (effect(1).z * effect(9).w * 0.035 * scale);
    var z: vec2f = vec2f(0.0);
    var count: f32 = 0.0;
    var escaped: bool = false;
    for (var i: i32 = 0; i < 128; i = i + 1) {
        if (f32(i) >= effect(9).z * 16.0) { break; }
        z = vec2f(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        count = f32(i);
        if (dot(z, z) > 64.0) { escaped = true; break; }
    }
    if (escaped) { count = count + 1.0 - log(log(length(z))) / log(2.0); }
    let bands: f32 = 0.7 + 0.3 * cos(count * 0.2);
    let tint: vec3f = fractalTint(count * 0.12 + time * 0.16 + effect(0).w * 0.1) * bands;
    // Fade slow-escaping boundary orbits into the interior instead of amplifying
    // float32-sensitive iteration differences into bright flickering specks.
    let fade: f32 = exp(-max(count, 0.0) * 0.035);
    let light: f32 = choose(0.18, 0.18 + (0.37 + bands * 0.65) * fade, escaped);
    var base: vec3f = vec3f(0.018,0.025,0.05);
    if (escaped) { base = mix(base, tint, fade); }
    let color: vec3f = mix(base, media * light, effect(1).z) * effect(2).y;
    return SceneSample(color, effect(7).y);
}
fn sceneFractal(uv: vec2f) -> SceneSample {
    let time: f32 = effect(0).z;
    let ruins: bool = effect(0).x == 7.0;
    let plane: f32 = tan(effect(1).x * 0.5);
    let q: vec2f = (uv * 2.0 - 1.0) * vec2f(plane, -plane / effect(4).y);
    let angle: f32 = choose(sin(time * 0.17) * 0.35, time * 0.18, effect(0).y == 2.0);
    let radius: f32 = choose(3.1, 4.6 + sin(time * 0.12) * 0.6, effect(0).x == 10.0);
    var ro: vec3f = vec3f(sin(angle) * radius, effect(1).y - 1.25, -cos(angle) * radius);
    var yaw: f32 = -angle;
    if (ruins) {
        ro = vec3f(sin(time * 0.12) * 0.35, effect(1).y, sceneMod(time, 96.0) + 0.5);
        yaw = choose(0.0, sin(time * 0.13) * 0.3, effect(0).y == 1.0) + choose(0.0, time * 0.18, effect(0).y == 2.0);
    }
    let rd: vec3f = normalize(sceneRay(q, yaw, effect(9).x));
    var sky: vec3f = vec3f(0.018,0.035,0.065);
    if (ruins) { sky = vec3f(0.78,0.82,0.84); }
    let backdrop: SceneSample = SceneSample(mix(sky, sceneMapped(uv, effect(4).y) * choose(0.16, 0.85, ruins), effect(1).z * 0.65), effect(7).w);
    var distance: f32 = 0.0;
    var farLimit: f32 = 32.0;
    if (effect(0).x == 9.0) {
        // The bulb is contained within radius two. Skip empty space exactly;
        // keep the estimator, cell density and iteration quality unchanged.
        let b: f32 = dot(ro, rd);
        let discriminant: f32 = b * b - dot(ro, ro) + 4.0 * effect(9).y * effect(9).y;
        if (discriminant < 0.0) { return backdrop; }
        let span: f32 = sqrt(discriminant);
        distance = max(0.0, -b - span);
        farLimit = min(farLimit, -b + span);
        if (farLimit < distance) { return backdrop; }
    }
    for (var i: i32 = 0; i < 64; i = i + 1) {
        let point: vec3f = ro + rd * distance;
        let d: f32 = fractalDistance(point);
        if (d < 0.012 + distance * 0.001) {
            let gradient: vec3f = vec3f(
                fractalDistance(point + vec3f(0.02,0.0,0.0)) - fractalDistance(point - vec3f(0.02,0.0,0.0)),
                fractalDistance(point + vec3f(0.0,0.02,0.0)) - fractalDistance(point - vec3f(0.0,0.02,0.0)),
                fractalDistance(point + vec3f(0.0,0.0,0.02)) - fractalDistance(point - vec3f(0.0,0.0,0.02)));
            let n: vec3f = gradient / max(length(gradient), 0.00001);
            let light: f32 = (0.18 + max(dot(n, normalize(vec3f(-0.5,0.8,-0.6))), 0.0) * 1.4) / (1.0 + f32(i) * 0.045) * effect(2).y;
            var tint: vec3f = fractalTint(length(point) * 2.2 + n.y * 3.0 + time * 0.12 + effect(0).w * 0.1);
            if (ruins) { tint = vec3f(0.68,0.72,0.73); }
            let media: vec3f = sceneMapped(vec2f(point.x, -point.y) * 0.2 + vec2f(0.5,0.6), 1.0);
            let color: vec3f = mix(tint * light, media * (0.12 + light), effect(1).z);
            return SceneSample(mix(color, sky, 1.0 - exp(-distance * effect(2).x)), effect(7).y);
        }
        distance = distance + max(0.004, d * 0.75);
        if (distance > farLimit) { break; }
    }
    return backdrop;
}
fn sceneSampleBase(uv: vec2f) -> SceneSample {
    if (effect(0).x == 8.0) { return sceneMandelbrot(uv); }
    if (effect(0).x >= 7.0) { return sceneFractal(uv); }
    if (effect(0).x == 6.0) { return sceneOrbitals(uv); }
    let time: f32 = effect(0).z;
    let route: f32 = effect(0).y;
    let cameraX: f32 = 0.5 + choose(0.0, sin(time * 0.22) * 0.85, route == 1.0);
    let angle: f32 = choose(0.0, sin(time * 0.14) * 0.32, route == 1.0) + choose(0.0, time * 0.25, route == 2.0);
    let ro: vec3f = vec3f(cameraX, effect(1).y + choose(0.0, effect(8).x, effect(0).x == 5.0), sceneMod(time, 32.0) + 0.5);
    let plane: f32 = tan(effect(1).x * 0.5);
    let q: vec2f = vec2f((uv.x * 2.0 - 1.0) * plane, (1.0 - uv.y * 2.0) * plane / max(0.2, effect(4).y));
    let rd: vec3f = sceneRay(q, angle, effect(9).x);
    var hit: SceneHit = sceneTrace(ro, rd, 40.0);
    var result: SceneSample = SceneSample(sceneSky(rd), effect(7).w);
    var surfaceDistance: f32 = hit.distance;
    if (effect(0).x == 3.0) {
        result.color = mix(result.color, sceneMedia(uv) * 0.65, effect(1).z);
    }
    if (hit.material > 0.0) { result = sceneSurface(hit); }
    if (rd.y < -0.0001) {
        let floorT: f32 = -ro.y / rd.y;
        if (floorT < hit.distance) {
            surfaceDistance = floorT;
            let floorP: vec3f = ro + rd * floorT;
            let lane: f32 = choose(0.0, 0.25, effect(0).x == 1.0 && abs(floorP.x - 0.5) < 0.045 && sceneMod(floorP.z, 4.0) < 1.6);
            let grid: f32 = choose(0.0, 0.08, effect(0).x == 2.0 && (fract(floorP.x) < 0.025 || fract(floorP.z) < 0.025));
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
    // Cathedral roof: two sloping planes form a tall nave. The tunnel has
    // a low, flat ceiling. Both reuse the same bounded intersection/shading.
    if (effect(0).x == 2.0 || effect(0).x == 4.0) {
        let vaulted: bool = effect(0).x == 4.0;
        let ceiling: f32 = choose(3.2, 9.0, vaulted);
        for (var side: i32 = 0; side < 2; side = side + 1) {
            let slope: f32 = choose(0.0, choose(-0.65, 0.65, side == 1), vaulted);
            let denominator: f32 = rd.y + slope * rd.x;
            if (denominator > 0.0001) {
                let ceilingT: f32 = (ceiling - ro.y - slope * (ro.x - 0.5)) / denominator;
                let p: vec3f = ro + rd * ceilingT;
                if (ceilingT > 0.0 && ceilingT < surfaceDistance && (!vaulted || slope * (p.x - 0.5) >= 0.0)) {
                    surfaceDistance = ceilingT;
                    let rib: f32 = choose(0.0, 0.45, sceneMod(p.z, 4.0) < 0.16);
                    let base: vec3f = vec3f(0.08,0.13,0.2) + vec3f(rib * 0.3, rib * 0.65, rib);
                    result = SceneSample(mix(base, sceneMapped(p.xz * 0.125, 1.0) * 0.8, effect(1).z), effect(7).y);
                }
            }
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
fn accentEnabled() -> bool {
    return effect(10).x != 5.0 && effect(10).y > 0.0 && effect(10).z > 0.0;
}
fn accentField(uv: vec2f) -> vec4f {
    let drift: f32 = effect(0).z * effect(11).y * 0.04;
    var z: vec2f = (uv * 2.0 - 1.0) * effect(12).z / (effect(11).x * vec2f(1.0, effect(4).y)) + vec2f(sin(drift), cos(drift * 0.73)) * 0.06;
    var trap: f32 = 1.0;
    var stripes: f32 = 0.0;
    var etch: f32 = 0.0;
    var count: f32 = 0.0;
    for (var i: i32 = 0; i < 24; i = i + 1) {
        z = vec2f(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + effect(12).xy;
        let r2: f32 = dot(z, z);
        trap = min(trap, min(abs(z.x), abs(z.y)));
        let s2: f32 = 2.0 * z.x * z.y / max(0.0001, r2);
        stripes = stripes + 3.0 * s2 - 4.0 * s2 * s2 * s2;
        etch = etch + abs(r2 - 1.0) / (r2 + 1.0);
        count = count + 1.0;
        if (r2 > 16.0) { break; }
    }
    return vec4f(exp(-trap * 18.0), stripes / count, sin(etch / count * 24.0 + drift), sin((z.x - z.y) / (1.0 + abs(z.x) + abs(z.y)) * 4.0));
}
fn accentMask(uv: vec2f, trails: bool) -> vec2f {
    let luma: vec3f = vec3f(0.2126, 0.7152, 0.0722);
    let px: vec2f = 1.0 / vec2f(effect(3).w, effect(4).x);
    let source: vec3f = sceneMedia(uv);
    let luminance: f32 = dot(source, luma);
    let gx: f32 = dot(sceneMedia(uv + vec2f(px.x, 0.0)) - sceneMedia(uv - vec2f(px.x, 0.0)), luma);
    let gy: f32 = dot(sceneMedia(uv + vec2f(0.0, px.y)) - sceneMedia(uv - vec2f(0.0, px.y)), luma);
    let edge: f32 = smoothstep(0.015, 0.22, length(vec2f(gx, gy)));
    let coverageField: f32 = 0.5 + 0.5 * sin(uv.x * 11.0 + effect(11).w) * cos(uv.y * 9.0 - effect(11).w);
    let coverage: f32 = choose(smoothstep(1.0 - effect(10).z - 0.08, 1.0 - effect(10).z + 0.08, coverageField), 1.0, effect(10).z >= 1.0);
    var mask: f32 = smoothstep(0.02, 0.18, luminance) * (1.0 - smoothstep(0.8, 0.98, luminance));
    if (effect(10).w == 0.0) { mask = edge; }
    if (effect(10).w == 2.0) { mask = (1.0 - edge) * smoothstep(0.015, 0.12, luminance); }
    if (trails) { mask = 1.0; }
    return vec2f(coverage * mask, edge);
}
fn accentDisplacement(mask: vec2f) -> f32 {
    return min(effect(10).y * 2.5, choose(1.0, 0.85, effect(11).z > 0.5)) * mask.x * (1.0 - mask.y);
}
fn sceneSample(uv: vec2f) -> SceneSample {
    var at: vec2f = uv;
    if (accentEnabled() && effect(10).x == 3.0 && effect(10).w != 3.0) {
        at = uv + accentField(uv).yw * accentDisplacement(accentMask(uv, false)) / vec2f(effect(3).w, effect(4).x);
    }
    return sceneSampleBase(at);
}
fn accentApply(cell: vec4f, uv: vec2f, trails: bool) -> vec4f {
    if (!trails && effect(10).x == 3.0 && effect(0).x != 0.0) { return cell; }
    let field: vec4f = accentField(uv);
    let subtle: bool = effect(11).z > 0.5;
    let luma: vec3f = vec3f(0.2126, 0.7152, 0.0722);
    let px: vec2f = 1.0 / vec2f(effect(3).w, effect(4).x);
    let mask: vec2f = accentMask(uv, trails);
    let amount: f32 = min(effect(10).y, choose(1.0, 0.5, subtle)) * mask.x;
    var result: vec4f = cell;
    if (trails) {
        result = cell * pow(max(0.00001, 1.0 - amount * (1.0 - field.x)), effect(8).z * 60.0);
    } else if (effect(10).x == 3.0) {
        let displacement: f32 = accentDisplacement(mask);
        let delta: vec2f = field.yw * displacement;
        let direction: vec2f = vec2f(choose(1.0, -1.0, delta.x < 0.0), choose(1.0, -1.0, delta.y < 0.0));
        let a: vec4f = sceneProcess(sceneMedia(uv + vec2f(direction.x * px.x, 0.0)), uv);
        let b: vec4f = sceneProcess(sceneMedia(uv + vec2f(0.0, direction.y * px.y)), uv);
        let c: vec4f = sceneProcess(sceneMedia(uv + direction * px), uv);
        result = mix(mix(cell, a, abs(delta.x)), mix(b, c, abs(delta.x)), abs(delta.y));
    } else if (effect(10).x == 4.0) {
        var shifted: vec3f = cell.gbr;
        if (field.w < 0.0) { shifted = cell.brg; }
        let delta: vec3f = shifted - cell.rgb;
        let tone: f32 = field.w * amount * 0.5;
        result = vec4f(cell.rgb + (delta - vec3f(dot(delta, luma))) * abs(field.w) * amount + cell.rgb * tone, cell.a + cell.a * tone);
    } else {
        var signal: f32 = (field.x - 0.55) * 2.0;
        if (effect(10).x == 1.0) { signal = field.z; }
        if (effect(10).x == 2.0) { signal = field.y; }
        result = vec4f(cell.rgb + cell.rgb * signal * amount, cell.a + cell.a * signal * amount * 0.65);
    }
    if (subtle) {
        var delta: vec3f = clamp(result.rgb - cell.rgb, max(vec3f(-0.22), -cell.rgb), min(vec3f(0.22), vec3f(1.0) - cell.rgb));
        delta = delta * min(1.0, 0.16 / max(0.00001, abs(dot(delta, luma))));
        result = vec4f(cell.rgb + delta, clamp(result.a, cell.a - 0.1, cell.a + 0.1));
    }
    return clamp(result, vec4f(0.0), vec4f(1.0));
}
fn sceneFinish(cell: vec4f, uv: vec2f, materialGlyph: f32) -> vec4f {
    var color: vec3f = cell.rgb;
    var alpha: f32 = cell.a;
    if (accentEnabled() && effect(10).w != 3.0) {
        let accented: vec4f = accentApply(cell, uv, false);
        color = accented.rgb;
        alpha = accented.a;
    }
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
        var oldAlpha: f32 = previous.a;
        if (accentEnabled() && effect(10).w == 3.0) {
            let tail: vec4f = accentApply(vec4f(oldColor, previous.a * effect(4).z), uv, true);
            oldColor = tail.rgb;
            oldAlpha = tail.a;
        }
        if (dot(oldColor, vec3f(0.2126,0.7152,0.0722)) > dot(color, vec3f(0.2126,0.7152,0.0722))) { alpha = oldAlpha; }
        color = max(color, oldColor);
    }
    return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), alpha);
}
`;
