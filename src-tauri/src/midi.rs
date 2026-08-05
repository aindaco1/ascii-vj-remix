use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use midir::{Ignore, MidiInput, MidiInputConnection, MidiOutput};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;

const MAX_EVENTS: usize = 2048;
const MAX_READ_EVENTS: usize = 256;
const MAX_SYSEX_BYTES: usize = 256 * 1024;
const MAX_SYSEX_PACKETS: usize = 2048;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MidiPortInfo {
    pub id: String,
    pub name: String,
    pub direction: String,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MidiPorts {
    pub inputs: Vec<MidiPortInfo>,
    pub outputs: Vec<MidiPortInfo>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MidiEvent {
    pub sequence: u64,
    pub timestamp_micros: u64,
    pub kind: String,
    pub channel: Option<u8>,
    pub number: Option<u8>,
    pub value: Option<u16>,
    pub byte_length: usize,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MidiConnectionStatus {
    pub connected: bool,
    pub input_name: Option<String>,
    pub output_name: Option<String>,
    pub queued_events: usize,
    pub capture_active: bool,
    pub captured_packets: usize,
    pub captured_bytes: usize,
    pub capture_overflow: bool,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MidiSysexDump {
    pub packets: Vec<String>,
    pub packet_count: usize,
    pub total_bytes: usize,
    pub overflow: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiSysexSendRequest {
    pub packets: Vec<String>,
    #[serde(default = "default_packet_delay_ms")]
    pub packet_delay_ms: u64,
}

fn default_packet_delay_ms() -> u64 {
    12
}

#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MidiSysexSendResult {
    pub packet_count: usize,
    pub total_bytes: usize,
}

#[derive(Default)]
struct SysexCapture {
    active: bool,
    current: Vec<u8>,
    packets: Vec<Vec<u8>>,
    total_bytes: usize,
    overflow: bool,
}

impl SysexCapture {
    fn start(&mut self) {
        self.active = true;
        self.current.clear();
        self.packets.clear();
        self.total_bytes = 0;
        self.overflow = false;
    }

    fn ingest(&mut self, bytes: &[u8]) {
        if !self.active || self.overflow {
            return;
        }
        for byte in bytes.iter().copied() {
            if byte >= 0xf8 {
                continue;
            }
            if byte == 0xf0 {
                self.current.clear();
                self.current.push(byte);
                continue;
            }
            if self.current.is_empty() {
                continue;
            }
            if self.total_bytes + self.current.len() + 1 > MAX_SYSEX_BYTES
                || self.packets.len() >= MAX_SYSEX_PACKETS
            {
                self.overflow = true;
                self.current.clear();
                return;
            }
            self.current.push(byte);
            if byte == 0xf7 {
                self.total_bytes += self.current.len();
                self.packets.push(std::mem::take(&mut self.current));
            }
        }
    }

    fn finish(&mut self) -> MidiSysexDump {
        self.active = false;
        self.current.clear();
        let packets = self
            .packets
            .iter()
            .map(|packet| BASE64.encode(packet))
            .collect::<Vec<_>>();
        MidiSysexDump {
            packet_count: packets.len(),
            total_bytes: self.total_bytes,
            packets,
            overflow: self.overflow,
        }
    }
}

struct MidiRuntime {
    input_connection: Option<MidiInputConnection<()>>,
    input_name: Option<String>,
    output_name: Option<String>,
}

impl Default for MidiRuntime {
    fn default() -> Self {
        Self {
            input_connection: None,
            input_name: None,
            output_name: None,
        }
    }
}

pub struct MidiState {
    runtime: Mutex<MidiRuntime>,
    events: Arc<Mutex<VecDeque<MidiEvent>>>,
    capture: Arc<Mutex<SysexCapture>>,
    sequence: Arc<Mutex<u64>>,
}

impl Default for MidiState {
    fn default() -> Self {
        Self {
            runtime: Mutex::new(MidiRuntime::default()),
            events: Arc::new(Mutex::new(VecDeque::new())),
            capture: Arc::new(Mutex::new(SysexCapture::default())),
            sequence: Arc::new(Mutex::new(0)),
        }
    }
}

fn port_id(direction: &str, index: usize, name: &str) -> String {
    format!("{direction}:{index}:{name}")
}

fn is_mioxc_port(name: &str) -> bool {
    name.to_ascii_lowercase().contains("mioxc")
}

fn list_input_ports() -> Result<Vec<MidiPortInfo>, String> {
    let input = MidiInput::new("ASCII VJ Remix MIDI discovery")
        .map_err(|error| format!("MIDI input initialization failed: {error}"))?;
    input
        .ports()
        .iter()
        .enumerate()
        .map(|(index, port)| {
            let name = input
                .port_name(port)
                .map_err(|error| format!("MIDI input name unavailable: {error}"))?;
            Ok(MidiPortInfo {
                id: port_id("input", index, &name),
                name,
                direction: "input".into(),
            })
        })
        .collect()
}

fn list_output_ports() -> Result<Vec<MidiPortInfo>, String> {
    let output = MidiOutput::new("ASCII VJ Remix MIDI discovery")
        .map_err(|error| format!("MIDI output initialization failed: {error}"))?;
    output
        .ports()
        .iter()
        .enumerate()
        .map(|(index, port)| {
            let name = output
                .port_name(port)
                .map_err(|error| format!("MIDI output name unavailable: {error}"))?;
            Ok(MidiPortInfo {
                id: port_id("output", index, &name),
                name,
                direction: "output".into(),
            })
        })
        .collect()
}

fn select_named_input(
    input: &MidiInput,
    requested: &str,
) -> Result<(midir::MidiInputPort, String), String> {
    for port in input.ports() {
        let name = input
            .port_name(&port)
            .map_err(|error| format!("MIDI input name unavailable: {error}"))?;
        if name == requested {
            return Ok((port, name));
        }
    }
    Err(format!("MIDI input is no longer available: {requested}"))
}

fn parse_event(sequence: u64, timestamp_micros: u64, message: &[u8]) -> MidiEvent {
    let status = message.first().copied().unwrap_or(0);
    let status_kind = status & 0xf0;
    let channel = if (0x80..=0xef).contains(&status) {
        Some((status & 0x0f) + 1)
    } else {
        None
    };
    let (kind, number, value) = match status_kind {
        0x80 => (
            "noteOff",
            message.get(1).copied(),
            message.get(2).copied().map(u16::from),
        ),
        0x90 => {
            let velocity = message.get(2).copied().unwrap_or(0);
            let kind = if velocity == 0 { "noteOff" } else { "noteOn" };
            (kind, message.get(1).copied(), Some(u16::from(velocity)))
        }
        0xa0 => (
            "polyPressure",
            message.get(1).copied(),
            message.get(2).copied().map(u16::from),
        ),
        0xb0 => (
            "cc",
            message.get(1).copied(),
            message.get(2).copied().map(u16::from),
        ),
        0xc0 => (
            "program",
            message.get(1).copied(),
            message.get(1).copied().map(u16::from),
        ),
        0xd0 => (
            "channelPressure",
            None,
            message.get(1).copied().map(u16::from),
        ),
        0xe0 => {
            let lsb = u16::from(message.get(1).copied().unwrap_or(0));
            let msb = u16::from(message.get(2).copied().unwrap_or(0));
            ("pitchBend", None, Some((msb << 7) | lsb))
        }
        0xf0 if status == 0xf0 => ("sysex", None, None),
        _ => ("system", None, None),
    };
    MidiEvent {
        sequence,
        timestamp_micros,
        kind: kind.into(),
        channel,
        number,
        value,
        byte_length: message.len(),
        bytes: if message.len() <= 16 {
            message.to_vec()
        } else {
            Vec::new()
        },
    }
}

#[tauri::command]
pub fn list_midi_ports() -> Result<MidiPorts, String> {
    Ok(MidiPorts {
        inputs: list_input_ports()?,
        outputs: list_output_ports()?,
    })
}

#[tauri::command]
pub fn connect_midi(
    input_name: String,
    output_name: String,
    state: State<'_, MidiState>,
) -> Result<MidiConnectionStatus, String> {
    if input_name.trim().is_empty() || output_name.trim().is_empty() {
        return Err("Both MIDI input and output must be selected".into());
    }
    if !is_mioxc_port(&input_name) || !is_mioxc_port(&output_name) {
        return Err("ASCII VJ Remix 0.9.5 supports the mioXC DIN interface only".into());
    }
    if !list_output_ports()?
        .iter()
        .any(|port| port.name == output_name)
    {
        return Err(format!("MIDI output is no longer available: {output_name}"));
    }

    let mut input = MidiInput::new("ASCII VJ Remix MIDI input")
        .map_err(|error| format!("MIDI input initialization failed: {error}"))?;
    input.ignore(Ignore::None);
    if let Ok(mut queue) = state.events.lock() {
        queue.clear();
    }
    let (port, selected_input_name) = select_named_input(&input, &input_name)?;
    let events = Arc::clone(&state.events);
    let capture = Arc::clone(&state.capture);
    let sequence = Arc::clone(&state.sequence);
    let connection = input
        .connect(
            &port,
            "ASCII VJ Remix mioXC input",
            move |timestamp, message, _| {
                if message.first() == Some(&0xf0)
                    || capture
                        .lock()
                        .map(|item| !item.current.is_empty())
                        .unwrap_or(false)
                {
                    if let Ok(mut target) = capture.lock() {
                        target.ingest(message);
                    }
                }
                let next_sequence = if let Ok(mut counter) = sequence.lock() {
                    *counter = counter.saturating_add(1);
                    *counter
                } else {
                    0
                };
                if let Ok(mut queue) = events.lock() {
                    if queue.len() >= MAX_EVENTS {
                        queue.pop_front();
                    }
                    queue.push_back(parse_event(next_sequence, timestamp, message));
                }
            },
            (),
        )
        .map_err(|error| format!("MIDI input connection failed: {error}"))?;

    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "MIDI state is unavailable")?;
    runtime.input_connection = Some(connection);
    runtime.input_name = Some(selected_input_name);
    runtime.output_name = Some(output_name);
    drop(runtime);
    midi_connection_status(&state)
}

#[tauri::command]
pub fn disconnect_midi(state: State<'_, MidiState>) -> Result<bool, String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "MIDI state is unavailable")?;
    runtime.input_connection.take();
    runtime.input_name = None;
    runtime.output_name = None;
    if let Ok(mut queue) = state.events.lock() {
        queue.clear();
    }
    if let Ok(mut capture) = state.capture.lock() {
        capture.active = false;
        capture.current.clear();
    }
    Ok(true)
}

fn midi_connection_status(state: &MidiState) -> Result<MidiConnectionStatus, String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "MIDI state is unavailable")?;
    let queued_events = state.events.lock().map(|queue| queue.len()).unwrap_or(0);
    let capture = state
        .capture
        .lock()
        .map_err(|_| "MIDI capture state is unavailable")?;
    Ok(MidiConnectionStatus {
        connected: runtime.input_connection.is_some(),
        input_name: runtime.input_name.clone(),
        output_name: runtime.output_name.clone(),
        queued_events,
        capture_active: capture.active,
        captured_packets: capture.packets.len(),
        captured_bytes: capture.total_bytes + capture.current.len(),
        capture_overflow: capture.overflow,
    })
}

#[tauri::command]
pub fn get_midi_state(state: State<'_, MidiState>) -> Result<MidiConnectionStatus, String> {
    midi_connection_status(&state)
}

#[tauri::command]
pub fn read_midi_events(max_events: Option<usize>, state: State<'_, MidiState>) -> Vec<MidiEvent> {
    let limit = max_events.unwrap_or(128).clamp(1, MAX_READ_EVENTS);
    let Ok(mut queue) = state.events.lock() else {
        return Vec::new();
    };
    let count = limit.min(queue.len());
    queue.drain(..count).collect()
}

#[tauri::command]
pub fn start_midi_sysex_capture(state: State<'_, MidiState>) -> Result<bool, String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "MIDI state is unavailable")?;
    if runtime.input_connection.is_none() {
        return Err("Connect the mioXC MIDI input before capturing SysEx".into());
    }
    drop(runtime);
    let mut capture = state
        .capture
        .lock()
        .map_err(|_| "MIDI capture state is unavailable")?;
    capture.start();
    Ok(true)
}

#[tauri::command]
pub fn finish_midi_sysex_capture(state: State<'_, MidiState>) -> Result<MidiSysexDump, String> {
    let mut capture = state
        .capture
        .lock()
        .map_err(|_| "MIDI capture state is unavailable")?;
    Ok(capture.finish())
}

fn decode_sysex_packets(request: MidiSysexSendRequest) -> Result<(Vec<Vec<u8>>, u64), String> {
    if request.packets.is_empty() || request.packets.len() > MAX_SYSEX_PACKETS {
        return Err("SysEx transfer must contain between 1 and 2048 packets".into());
    }
    let mut total_bytes = 0usize;
    let mut packets = Vec::with_capacity(request.packets.len());
    for encoded in request.packets {
        let packet = BASE64
            .decode(encoded)
            .map_err(|_| "SysEx profile contains invalid base64 data")?;
        if packet.len() < 2 || packet.first() != Some(&0xf0) || packet.last() != Some(&0xf7) {
            return Err("Every SysEx packet must start with F0 and end with F7".into());
        }
        total_bytes = total_bytes.saturating_add(packet.len());
        if total_bytes > MAX_SYSEX_BYTES {
            return Err("SysEx profile exceeds the 256 KiB safety limit".into());
        }
        packets.push(packet);
    }
    Ok((packets, request.packet_delay_ms.clamp(1, 100)))
}

fn send_sysex_packets(
    output_name: String,
    packets: Vec<Vec<u8>>,
    delay_ms: u64,
) -> Result<MidiSysexSendResult, String> {
    let output = MidiOutput::new("ASCII VJ Remix MIDI output")
        .map_err(|error| format!("MIDI output initialization failed: {error}"))?;
    let mut selected = None;
    for port in output.ports() {
        let name = output
            .port_name(&port)
            .map_err(|error| format!("MIDI output name unavailable: {error}"))?;
        if name == output_name {
            selected = Some(port);
            break;
        }
    }
    let port =
        selected.ok_or_else(|| format!("MIDI output is no longer available: {output_name}"))?;
    let mut connection = output
        .connect(&port, "ASCII VJ Remix UC-33e SysEx output")
        .map_err(|error| format!("MIDI output connection failed: {error}"))?;
    let total_bytes = packets.iter().map(Vec::len).sum();
    for packet in &packets {
        connection
            .send(packet)
            .map_err(|error| format!("MIDI SysEx send failed: {error}"))?;
        std::thread::sleep(Duration::from_millis(delay_ms));
    }
    Ok(MidiSysexSendResult {
        packet_count: packets.len(),
        total_bytes,
    })
}

#[tauri::command]
pub async fn send_midi_sysex(
    request: MidiSysexSendRequest,
    state: State<'_, MidiState>,
) -> Result<MidiSysexSendResult, String> {
    let output_name = state
        .runtime
        .lock()
        .map_err(|_| "MIDI state is unavailable")?
        .output_name
        .clone()
        .ok_or_else(|| "Connect the mioXC MIDI output before restoring SysEx".to_string())?;
    let (packets, delay_ms) = decode_sysex_packets(request)?;
    tauri::async_runtime::spawn_blocking(move || send_sysex_packets(output_name, packets, delay_ms))
        .await
        .map_err(|error| format!("MIDI SysEx worker failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_channel_messages() {
        let cc = parse_event(1, 22, &[0xb2, 10, 127]);
        assert_eq!(cc.kind, "cc");
        assert_eq!(cc.channel, Some(3));
        assert_eq!(cc.number, Some(10));
        assert_eq!(cc.value, Some(127));

        let note_off = parse_event(2, 24, &[0x90, 64, 0]);
        assert_eq!(note_off.kind, "noteOff");
        assert_eq!(note_off.channel, Some(1));

        let bend = parse_event(3, 25, &[0xe0, 0x7f, 0x7f]);
        assert_eq!(bend.value, Some(16383));
    }

    #[test]
    fn assembles_fragmented_sysex_packets() {
        let mut capture = SysexCapture::default();
        capture.start();
        capture.ingest(&[0xf0, 0x00, 0x01]);
        capture.ingest(&[0xf8, 0x02, 0xf7, 0xf0, 0x03, 0xf7]);
        let dump = capture.finish();
        assert_eq!(dump.packet_count, 2);
        assert_eq!(dump.total_bytes, 8);
        assert_eq!(
            BASE64.decode(&dump.packets[0]).unwrap(),
            vec![0xf0, 0x00, 0x01, 0x02, 0xf7]
        );
        assert_eq!(
            BASE64.decode(&dump.packets[1]).unwrap(),
            vec![0xf0, 0x03, 0xf7]
        );
    }

    #[test]
    fn validates_sysex_send_requests() {
        let valid = MidiSysexSendRequest {
            packets: vec![BASE64.encode([0xf0, 0x01, 0xf7])],
            packet_delay_ms: 0,
        };
        let (packets, delay) = decode_sysex_packets(valid).unwrap();
        assert_eq!(packets[0], vec![0xf0, 0x01, 0xf7]);
        assert_eq!(delay, 1);

        let invalid = MidiSysexSendRequest {
            packets: vec![BASE64.encode([0x90, 0x40, 0x7f])],
            packet_delay_ms: 12,
        };
        assert!(decode_sysex_packets(invalid).is_err());
    }

    #[test]
    fn scopes_the_initial_profile_to_mioxc_ports() {
        assert!(is_mioxc_port("mioXC MIDI In"));
        assert!(is_mioxc_port("ICONNECTIVITY mioxc"));
        assert!(!is_mioxc_port("Evolution UC-33 USB"));
    }
}
