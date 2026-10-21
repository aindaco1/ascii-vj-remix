use std::error::Error;
use std::time::Duration;

// Opt-in release acceptance: uses the application's locked reqwest/rustls graph.
#[test]
#[ignore = "contacts public TLS test endpoints; run explicitly for release acceptance"]
fn compromised_emudhra_chains_are_rejected() {
    tauri::async_runtime::block_on(async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let control = client.get("https://example.com/").send().await.unwrap();
        assert!(control.status().is_success(), "valid HTTPS control failed");
        for issuer in ["dv-g3b", "dv-g3c", "ov-g3b", "ov-g3c", "ev-g3b", "ev-g3c"] {
            for cross_sign in ["", "-aaa"] {
                let host = format!("{issuer}{cross_sign}-emudhra.we-have-a-problem.com");
                let error = client
                    .get(format!("https://{host}/"))
                    .send()
                    .await
                    .expect_err("compromised certificate chain was accepted");
                let mut causes = error.to_string();
                let mut source = error.source();
                while let Some(cause) = source {
                    causes.push_str(&format!("; {cause:?}"));
                    source = cause.source();
                }
                assert!(
                    causes.contains("CertDistrusted"),
                    "{host}: failure did not establish certificate rejection: {causes}"
                );
                println!("REJECTED {host}: {causes}");
            }
        }
    });
}
