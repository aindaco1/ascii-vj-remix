use midir::{Ignore, MidiInput, MidiOutput};
use std::time::Duration;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let input = MidiInput::new("ASCII VJ Remix MIDI probe")?;
    let output = MidiOutput::new("ASCII VJ Remix MIDI probe")?;

    println!("MIDI inputs:");
    for (index, port) in input.ports().iter().enumerate() {
        println!("  {index}: {}", input.port_name(port)?);
    }

    println!("MIDI outputs:");
    for (index, port) in output.ports().iter().enumerate() {
        println!("  {index}: {}", output.port_name(port)?);
    }

    if std::env::args().any(|argument| argument == "--connect") {
        let mut input = MidiInput::new("ASCII VJ Remix MIDI connection probe")?;
        input.ignore(Ignore::None);
        let input_port = input
            .ports()
            .into_iter()
            .find(|port| {
                input
                    .port_name(port)
                    .is_ok_and(|name| name.to_ascii_lowercase().contains("mioxc"))
            })
            .ok_or("mioXC input not found")?;
        let input_connection = input.connect(
            &input_port,
            "ASCII VJ Remix MIDI connection probe",
            |_timestamp, _message, _| {},
            (),
        )?;

        let output = MidiOutput::new("ASCII VJ Remix MIDI connection probe")?;
        let output_port = output
            .ports()
            .into_iter()
            .find(|port| {
                output
                    .port_name(port)
                    .is_ok_and(|name| name.to_ascii_lowercase().contains("mioxc"))
            })
            .ok_or("mioXC output not found")?;
        let output_connection =
            output.connect(&output_port, "ASCII VJ Remix MIDI connection probe")?;
        std::thread::sleep(Duration::from_millis(250));
        drop(output_connection);
        drop(input_connection);
        println!("mioXC input/output connection probe passed.");
    }
    Ok(())
}
