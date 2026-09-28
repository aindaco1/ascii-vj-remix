//! Shared, bounded visual contract. Geometry itself lives in the shared WGSL.
use super::palette;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::LazyLock;

static CONTRACT: LazyLock<BTreeMap<String, Value>> = LazyLock::new(||
    serde_json::from_str(include_str!("../../../renderers/shared/spatial-contract.json")).expect("spatial contract"));
pub(super) const GLYPHS: &str = "-|/\\~+#.";

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    pub scene_transport: Option<palette::Transport>,
    pub scene_clock_ms: Option<f64>,
    pub scene_reset_id: Option<u64>,
    #[serde(flatten)]
    values: BTreeMap<String, Value>,
}
#[derive(Debug, Clone)]
pub(super) struct Params {
    values: BTreeMap<String, Value>,
    pub transport: palette::Transport,
    reset_id: u64,
}
impl Default for Params {
    fn default() -> Self { Self::from_input(&Input::default()) }
}
impl Params {
    pub fn from_input(input: &Input) -> Self {
        let mut values = BTreeMap::new();
        for (key, rule) in CONTRACT.iter() {
            let fallback = &rule["default"];
            let candidate = input.values.get(key).unwrap_or(fallback);
            let value = if fallback.is_boolean() {
                Value::Bool(candidate.as_bool().unwrap_or(fallback.as_bool().unwrap()))
            } else if fallback.is_string() {
                if rule["options"].as_array().unwrap().iter().any(|o| &o[0] == candidate) { candidate.clone() } else { fallback.clone() }
            } else {
                let mut n = candidate.as_f64().filter(|n| n.is_finite()).unwrap_or(fallback.as_f64().unwrap());
                if rule["step"].as_f64() == Some(1.0) { n = n.round(); }
                Value::from(n.clamp(rule["min"].as_f64().unwrap(), rule["max"].as_f64().unwrap()))
            };
            values.insert(key.clone(), value);
        }
        Self { values, reset_id: input.scene_reset_id.unwrap_or(0), transport: palette::Transport::synchronized(input.scene_transport.as_ref(), input.scene_clock_ms, palette::now_ms()) }
    }
    pub fn number(&self, key: &str) -> f64 { self.values[key].as_f64().unwrap_or(0.0) }
    pub fn flag(&self, key: &str) -> bool { self.values[key].as_bool().unwrap_or(false) }
    pub fn option(&self, key: &str) -> f32 {
        CONTRACT[key]["options"].as_array().unwrap().iter().position(|v| v[0] == self.values[key]).unwrap_or(0) as f32
    }
    pub fn special_glyphs(&self) -> bool { (self.option("visualMode") > 0.0 && self.flag("sceneMaterialGlyphs")) || self.number("edgeAmount") > 0.0 }
    pub fn enabled(&self) -> bool { self.option("visualMode") > 0.0 || self.number("edgeAmount") > 0.0 || self.number("feedbackAmount") > 0.0 }
    pub fn tween(&mut self, from: &Self, to: &Self, eased: f64) {
        for (key, rule) in CONTRACT.iter() {
            if rule["default"].is_number() && key != "sceneSeed" {
                self.values.insert(key.clone(), Value::from(from.number(key) + (to.number(key) - from.number(key)) * eased));
            }
        }
    }
    pub fn add(&mut self, base: &Self, key: &str, amount: f64) {
        let rule = &CONTRACT[key];
        self.values.insert(key.to_string(), Value::from((base.number(key) + amount).clamp(rule["min"].as_f64().unwrap(), rule["max"].as_f64().unwrap())));
    }
    pub fn uniforms(&self, cols: u32, rows: u32, cell_w: u32, cell_h: u32, glyph_count: u32, history: &mut History, resource_key: u64, now: f64) -> [f32; 36] {
        let key = format!("{}:{cols}:{rows}:{resource_key}:{}:{}:{}:{}:{}:{}:{}", self.reset_id, self.option("visualMode"), self.number("sceneSeed"), self.option("sceneRoute"), self.number("sceneOffset"), self.special_glyphs(), self.number("edgeAmount") > 0.0, self.number("feedbackAmount") > 0.0);
        let valid = history.key == key && history.last_ms > 0.0 && now - history.last_ms < 1000.0;
        let dt = if self.flag("sceneFreeze") || history.last_ms <= 0.0 { 0.0 } else { ((now - history.last_ms) / 1000.0).clamp(0.0, 0.25) };
        history.key = key;
        history.last_ms = now;
        let special = self.special_glyphs();
        let base = glyph_count.saturating_sub(if special { 8 } else { 0 });
        let n = |key| self.number(key) as f32;
        let mut data = [0.0_f32; 36];
        data[..24].copy_from_slice(&[
            self.option("visualMode"), self.option("sceneRoute"), (self.transport.time_at(now) + self.number("sceneOffset")) as f32, n("sceneSeed"),
            n("sceneFov").to_radians(), n("sceneHeight"), n("sceneMedia"), self.option("sceneMediaFit"),
            n("sceneFog"), n("sceneLight"), n("sceneGlow"), n("sceneWet"),
            n("sceneRain"), if self.flag("sceneMaterialGlyphs") {1.0} else {0.0}, n("edgeAmount"), cols as f32,
            rows as f32, (cols * cell_w) as f32 / (rows * cell_h).max(1) as f32,
            if valid && self.number("feedbackAmount") > 0.0 { (0.5_f64.powf(dt / self.number("feedbackHalfLife")) * self.number("feedbackAmount").powf(dt * 60.0)) as f32 } else {0.0}, n("feedbackZoom") * dt as f32,
            n("feedbackRotate") * dt as f32, if valid {1.0} else {0.0}, base as f32, glyph_count as f32
        ]);
        for i in 0..8 { data[24 + i] = (base as f32 + i as f32 + 0.5) / glyph_count.max(1) as f32; }
        data[32] = n("sceneRelief"); data[33] = 0.0; data[34] = dt as f32; data[35] = if special {1.0} else {0.0};
        data
    }
}
#[derive(Default)]
pub(super) struct History { pub key: String, last_ms: f64 }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browser_native_uniform_contract_and_transport_match() {
        let fixtures: Value = serde_json::from_str(include_str!("../../../tests/fixtures/spatial-uniforms.json")).unwrap();
        for fixture in fixtures.as_array().unwrap() {
            let input: Input = serde_json::from_value(fixture["input"].clone()).unwrap();
            let mut params = Params::from_input(&input);
            // Golden times are in the sender's deterministic test clock domain.
            params.transport = palette::Transport::validated(input.scene_transport.as_ref());
            let mut history = History::default();
            let count = 10 + if params.special_glyphs() { 8 } else { 0 };
            for sample in fixture["samples"].as_array().unwrap() {
                let actual = params.uniforms(120,45,8,12,count,&mut history,0,sample["now"].as_f64().unwrap());
                for (index, expected) in sample["expected"].as_array().unwrap().iter().enumerate() {
                    assert!((f64::from(actual[index])-expected.as_f64().unwrap()).abs()<0.00001, "slot {index}: {} != {expected}",actual[index]);
                }
            }
        }
    }
    #[test]
    fn invalid_fields_and_unknown_payload_keys_do_not_enter_render_state() {
        let input: Input = serde_json::from_value(serde_json::json!({"visualMode":"bad","sceneFov":500,"sceneFreeze":"true","sourceMode":"camera"})).unwrap();
        let p=Params::from_input(&input);
        assert_eq!(p.option("visualMode"),0.0);assert_eq!(p.number("sceneFov"),110.0);assert!(!p.flag("sceneFreeze"));assert!(!p.values.contains_key("sourceMode"));
    }
}

#[cfg(target_os = "macos")]
pub(super) static AUDIO_ROUTES: LazyLock<Vec<(String,String,f64)>> = LazyLock::new(||
    serde_json::from_str(include_str!("../../../renderers/shared/spatial-audio.json")).expect("spatial audio routes"));
