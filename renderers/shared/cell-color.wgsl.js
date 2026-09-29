export default String.raw`fn hash(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
    return fract((p3.x + p3.y) * p3.z);
}

fn brightenRgb(color: vec3<f32>) -> vec3<f32> {
    let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
    if (luma <= 0.0) { return color; }
    let lifted = pow(luma, 0.22);
    let scaled = color * (lifted / luma);
    let peak = max(scaled.r, max(scaled.g, scaled.b));
    var chroma = 1.0;
    if (peak > 1.0) { chroma = (1.0 - lifted) / (peak - lifted); }
    return vec3<f32>(lifted) + (scaled - vec3<f32>(lifted)) * chroma;
}

fn processColor(inputColor: vec3<f32>, cx: u32, cy: u32) -> vec4<f32> {
    var c = clamp(inputColor, vec3<f32>(0.0), vec3<f32>(1.0));
    let avg = (c.r + c.g + c.b) * 0.333333333;
    var outColor = vec3<f32>(
        clamp(avg + (c.r - avg) * params.saturationBoost, 0.0, 1.0),
        clamp(avg + (c.g - avg) * params.saturationBoost, 0.0, 1.0),
        clamp(avg + (c.b - avg) * params.saturationBoost, 0.0, 1.0)
    );
    if (params.brightOutput != 0u && params.paletteCount == 0u) { outColor = brightenRgb(outColor); }
    outColor = clamp((outColor - vec3<f32>(0.5)) * params.contrastBoost + vec3<f32>(0.5), vec3<f32>(0.0), vec3<f32>(1.0));
    outColor = clamp(pow(outColor * params.brightness, vec3<f32>(1.0 / max(0.01, params.gamma))), vec3<f32>(0.0), vec3<f32>(1.0));
    if (params.quantizeBits > 0u) {
        let quantum = pow(2.0, f32(params.quantizeBits));
        outColor = floor(outColor * 255.0 / quantum) * quantum / 255.0;
    }
    var result = mix(outColor, vec3<f32>(3.0 / 255.0, 4.0 / 255.0, 5.0 / 255.0), clamp(params.bgBlend, 0.0, 1.0));
    if (params.ditherSize > 0u) {
        let scale = max(1u, params.ditherScale);
        let mx = (cx / scale) % params.ditherSize;
        let my = (cy / scale) % params.ditherSize;
        var threshold = features.ditherValues[my * params.ditherSize + mx];
        if (params.ditherInvert != 0u) { threshold = -threshold; }
        let delta = threshold * params.ditherStrength * (64.0 / 255.0) + params.ditherBias * (32.0 / 255.0);
        result = clamp(result + vec3<f32>(delta), vec3<f32>(0.0), vec3<f32>(1.0));
    }
    if (params.paletteCount > 0u) {
        let q = vec3<u32>(clamp(floor(result * 255.0 / 8.0), vec3<f32>(0.0), vec3<f32>(31.0)));
        let lutIndex = (q.r << 10u) | (q.g << 5u) | q.b;
        let paletteIndex = min(paletteLut[lutIndex], params.paletteCount - 1u);
        let mapped = features.paletteColors[paletteIndex];
        if (params.brightOutput != 0u) { return vec4<f32>(brightenRgb(mapped.rgb), pow(mapped.a, 0.22)); }
        return mapped;
    }
    return vec4<f32>(result, dot(result, vec3<f32>(0.2126, 0.7152, 0.0722)));
}

`;
