use super::{DecodedRgbFrame, NativeCameraSource};

#[derive(Debug)]
pub(super) struct NativeCameraFrameReader {
    inner: platform::NativeCameraFrameReader,
}

impl NativeCameraFrameReader {
    pub(super) fn start(source: &NativeCameraSource) -> Result<Self, String> {
        platform::NativeCameraFrameReader::start(source).map(|inner| Self { inner })
    }

    pub(super) fn read_latest_frame(&mut self) -> Result<Option<DecodedRgbFrame>, String> {
        self.inner.read_latest_frame()
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{DecodedRgbFrame, NativeCameraSource};
    use std::ffi::{c_char, c_void, CString};
    use std::ptr::NonNull;

    const ERROR_BUFFER_LEN: usize = 1024;

    #[link(name = "asciline_native_camera", kind = "static")]
    extern "C" {
        fn asciline_native_camera_start(
            device_label: *const c_char,
            capture_width: u32,
            capture_height: u32,
            capture_fps: f64,
            error: *mut c_char,
            error_len: usize,
        ) -> *mut c_void;
        fn asciline_native_camera_latest_metadata(
            handle: *mut c_void,
            width: *mut u32,
            height: *mut u32,
            sequence: *mut u64,
            age_ms: *mut f64,
        ) -> bool;
        fn asciline_native_camera_copy_latest(
            handle: *mut c_void,
            dst: *mut u8,
            dst_len: usize,
            width: *mut u32,
            height: *mut u32,
            sequence: *mut u64,
            age_ms: *mut f64,
        ) -> bool;
        fn asciline_native_camera_stop(handle: *mut c_void);
    }

    #[derive(Debug)]
    pub(super) struct NativeCameraFrameReader {
        handle: NonNull<c_void>,
        buffer: Vec<u8>,
        last_sequence: u64,
    }

    impl NativeCameraFrameReader {
        pub(super) fn start(source: &NativeCameraSource) -> Result<Self, String> {
            let label = source
                .device_label
                .as_ref()
                .map(|label| CString::new(label.as_str()))
                .transpose()
                .map_err(|_| "Native camera device label contains a NUL byte".to_string())?;
            let mut error = vec![0 as c_char; ERROR_BUFFER_LEN];
            let handle = unsafe {
                asciline_native_camera_start(
                    label
                        .as_ref()
                        .map_or(std::ptr::null(), |label| label.as_ptr()),
                    source.output_width,
                    source.output_height,
                    source.capture_fps,
                    error.as_mut_ptr(),
                    error.len(),
                )
            };
            let handle = NonNull::new(handle).ok_or_else(|| {
                let message = c_error_message(&error);
                if message.is_empty() {
                    "Native camera capture did not start".to_string()
                } else {
                    message
                }
            })?;
            Ok(Self {
                handle,
                buffer: Vec::new(),
                last_sequence: 0,
            })
        }

        pub(super) fn read_latest_frame(&mut self) -> Result<Option<DecodedRgbFrame>, String> {
            let mut width = 0u32;
            let mut height = 0u32;
            let mut sequence = 0u64;
            let mut age_ms = 0f64;
            let has_frame = unsafe {
                asciline_native_camera_latest_metadata(
                    self.handle.as_ptr(),
                    &mut width,
                    &mut height,
                    &mut sequence,
                    &mut age_ms,
                )
            };
            if !has_frame || sequence == self.last_sequence {
                return Ok(None);
            }
            let len = checked_rgb_len(width, height)?;
            if self.buffer.len() != len {
                self.buffer.resize(len, 0);
            }

            let copied = unsafe {
                asciline_native_camera_copy_latest(
                    self.handle.as_ptr(),
                    self.buffer.as_mut_ptr(),
                    self.buffer.len(),
                    &mut width,
                    &mut height,
                    &mut sequence,
                    &mut age_ms,
                )
            };
            if !copied {
                return Ok(None);
            }
            let len = checked_rgb_len(width, height)?;
            if self.buffer.len() < len {
                return Err("Native camera frame grew during copy".to_string());
            }
            self.last_sequence = sequence;
            Ok(Some(DecodedRgbFrame {
                index: sequence as usize,
                width,
                height,
                data: self.buffer[..len].to_vec(),
            }))
        }
    }

    impl Drop for NativeCameraFrameReader {
        fn drop(&mut self) {
            unsafe { asciline_native_camera_stop(self.handle.as_ptr()) };
        }
    }

    fn checked_rgb_len(width: u32, height: u32) -> Result<usize, String> {
        width
            .max(1)
            .checked_mul(height.max(1))
            .and_then(|pixels| pixels.checked_mul(3))
            .map(|len| len as usize)
            .ok_or_else(|| "Native camera frame is too large".to_string())
    }

    fn c_error_message(error: &[c_char]) -> String {
        let bytes = error
            .iter()
            .map(|value| *value as u8)
            .take_while(|value| *value != 0)
            .collect::<Vec<_>>();
        String::from_utf8_lossy(&bytes).trim().to_string()
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{DecodedRgbFrame, NativeCameraSource};
    use std::ptr;
    use windows::Win32::Media::MediaFoundation::{
        IMFActivate, IMFAttributes, IMFMediaSource, IMFSourceReader, MFCreateAttributes,
        MFCreateMediaType, MFCreateSourceReaderFromMediaSource, MFEnumDeviceSources,
        MFMediaType_Video, MFShutdown, MFStartup, MFVideoFormat_RGB32,
        MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME, MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
        MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID, MF_MT_DEFAULT_STRIDE, MF_MT_FRAME_RATE,
        MF_MT_FRAME_SIZE, MF_MT_MAJOR_TYPE, MF_MT_SUBTYPE, MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS,
        MF_SOURCE_READERF_ENDOFSTREAM, MF_SOURCE_READERF_ERROR,
        MF_SOURCE_READER_DISCONNECT_MEDIASOURCE_ON_SHUTDOWN,
        MF_SOURCE_READER_ENABLE_ADVANCED_VIDEO_PROCESSING, MF_SOURCE_READER_FIRST_VIDEO_STREAM,
        MF_VERSION,
    };
    use windows::Win32::System::Com::{
        CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_MULTITHREADED,
    };

    const FIRST_VIDEO_STREAM: u32 = MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32;

    #[derive(Debug)]
    pub(super) struct NativeCameraFrameReader {
        reader: IMFSourceReader,
        source: IMFMediaSource,
        width: u32,
        height: u32,
        stride: i32,
        sequence: usize,
        pending_frame: Option<DecodedRgbFrame>,
        com_initialized: bool,
        media_foundation_started: bool,
    }

    impl NativeCameraFrameReader {
        pub(super) fn start(source: &NativeCameraSource) -> Result<Self, String> {
            let com_initialized =
                unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok().is_ok() };
            if !com_initialized {
                return Err("Windows camera COM initialization failed".to_string());
            }

            if let Err(error) = unsafe { MFStartup(MF_VERSION, 0) } {
                unsafe { CoUninitialize() };
                return Err(format!("Windows Media Foundation startup failed: {error}"));
            }

            match Self::start_after_platform_init(source) {
                Ok(mut capture) => {
                    capture.com_initialized = true;
                    capture.media_foundation_started = true;
                    let mut first_frame = None;
                    for _ in 0..8 {
                        first_frame = capture.read_sample()?;
                        if first_frame.is_some() {
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(5));
                    }
                    if first_frame.is_none() {
                        return Err("Windows camera opened without producing a frame".to_string());
                    }
                    capture.pending_frame = first_frame;
                    Ok(capture)
                }
                Err(error) => {
                    let _ = unsafe { MFShutdown() };
                    unsafe { CoUninitialize() };
                    Err(error)
                }
            }
        }

        pub(super) fn read_latest_frame(&mut self) -> Result<Option<DecodedRgbFrame>, String> {
            if self.pending_frame.is_some() {
                return Ok(self.pending_frame.take());
            }
            self.read_sample()
        }

        fn start_after_platform_init(source: &NativeCameraSource) -> Result<Self, String> {
            let activation = select_camera(source.device_label.as_deref())?;
            let media_source = unsafe { activation.ActivateObject::<IMFMediaSource>() }
                .map_err(|error| format!("Windows camera activation failed: {error}"))?;

            let attributes = create_attributes(3)?;
            unsafe {
                attributes
                    .SetUINT32(&MF_SOURCE_READER_ENABLE_ADVANCED_VIDEO_PROCESSING, 1)
                    .map_err(|error| {
                        format!("Windows camera video processing setup failed: {error}")
                    })?;
                attributes
                    .SetUINT32(&MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, 1)
                    .map_err(|error| {
                        format!("Windows camera hardware transform setup failed: {error}")
                    })?;
                attributes
                    .SetUINT32(&MF_SOURCE_READER_DISCONNECT_MEDIASOURCE_ON_SHUTDOWN, 1)
                    .map_err(|error| format!("Windows camera shutdown setup failed: {error}"))?;
            }
            let reader = unsafe { MFCreateSourceReaderFromMediaSource(&media_source, &attributes) }
                .map_err(|error| format!("Windows camera source reader failed: {error}"))?;

            let output_type = unsafe { MFCreateMediaType() }
                .map_err(|error| format!("Windows camera output type failed: {error}"))?;
            let requested_fps = source.capture_fps.round().clamp(1.0, 60.0) as u32;
            unsafe {
                output_type
                    .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)
                    .map_err(|error| format!("Windows camera major type failed: {error}"))?;
                output_type
                    .SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_RGB32)
                    .map_err(|error| format!("Windows camera RGB output failed: {error}"))?;
                output_type
                    .SetUINT64(
                        &MF_MT_FRAME_SIZE,
                        pack_ratio(source.output_width, source.output_height),
                    )
                    .map_err(|error| format!("Windows camera frame size failed: {error}"))?;
                output_type
                    .SetUINT64(&MF_MT_FRAME_RATE, pack_ratio(requested_fps, 1))
                    .map_err(|error| format!("Windows camera frame rate failed: {error}"))?;
                reader
                    .SetCurrentMediaType(FIRST_VIDEO_STREAM, None, &output_type)
                    .map_err(|error| format!("Windows camera RGB32 conversion failed: {error}"))?;
            }

            let current_type = unsafe { reader.GetCurrentMediaType(FIRST_VIDEO_STREAM) }
                .map_err(|error| format!("Windows camera negotiated type failed: {error}"))?;
            let frame_size = unsafe { current_type.GetUINT64(&MF_MT_FRAME_SIZE) }
                .map_err(|error| format!("Windows camera negotiated size failed: {error}"))?;
            let (width, height) = unpack_ratio(frame_size);
            if width == 0 || height == 0 || width.max(height) > 4096 {
                return Err("Windows camera negotiated invalid frame dimensions".to_string());
            }
            let stride = unsafe { current_type.GetUINT32(&MF_MT_DEFAULT_STRIDE) }
                .map(|value| value as i32)
                .unwrap_or_else(|_| (width * 4) as i32);
            if stride == 0 || stride.unsigned_abs() < width.saturating_mul(4) {
                return Err("Windows camera negotiated invalid frame stride".to_string());
            }

            Ok(Self {
                reader,
                source: media_source,
                width,
                height,
                stride,
                sequence: 0,
                pending_frame: None,
                com_initialized: false,
                media_foundation_started: false,
            })
        }

        fn read_sample(&mut self) -> Result<Option<DecodedRgbFrame>, String> {
            let mut flags = 0u32;
            let mut sample = None;
            unsafe {
                self.reader
                    .ReadSample(
                        FIRST_VIDEO_STREAM,
                        0,
                        None,
                        Some(&mut flags),
                        None,
                        Some(&mut sample),
                    )
                    .map_err(|error| format!("Windows camera frame read failed: {error}"))?;
            }
            if flags & MF_SOURCE_READERF_ERROR.0 as u32 != 0 {
                return Err("Windows camera source reader reported an error".to_string());
            }
            if flags & MF_SOURCE_READERF_ENDOFSTREAM.0 as u32 != 0 {
                return Err("Windows camera source ended unexpectedly".to_string());
            }
            let Some(sample) = sample else {
                return Ok(None);
            };
            let buffer = unsafe { sample.ConvertToContiguousBuffer() }
                .map_err(|error| format!("Windows camera sample buffer failed: {error}"))?;
            let mut bytes = ptr::null_mut();
            let mut current_length = 0u32;
            unsafe {
                buffer
                    .Lock(&mut bytes, None, Some(&mut current_length))
                    .map_err(|error| format!("Windows camera buffer lock failed: {error}"))?;
            }
            let copied = copy_rgb32_frame(
                bytes,
                current_length as usize,
                self.width,
                self.height,
                self.stride,
            );
            let unlock_result = unsafe { buffer.Unlock() };
            unlock_result
                .map_err(|error| format!("Windows camera buffer unlock failed: {error}"))?;
            let data = copied?;
            self.sequence = self.sequence.wrapping_add(1);
            Ok(Some(DecodedRgbFrame {
                index: self.sequence,
                width: self.width,
                height: self.height,
                data,
            }))
        }
    }

    impl Drop for NativeCameraFrameReader {
        fn drop(&mut self) {
            let _ = unsafe { self.source.Shutdown() };
            if self.media_foundation_started {
                let _ = unsafe { MFShutdown() };
            }
            if self.com_initialized {
                unsafe { CoUninitialize() };
            }
        }
    }

    fn create_attributes(capacity: u32) -> Result<IMFAttributes, String> {
        let mut attributes = None;
        unsafe { MFCreateAttributes(&mut attributes, capacity) }
            .map_err(|error| format!("Windows camera attributes failed: {error}"))?;
        attributes.ok_or_else(|| "Windows camera attributes were not created".to_string())
    }

    fn select_camera(device_label: Option<&str>) -> Result<IMFActivate, String> {
        let attributes = create_attributes(1)?;
        unsafe {
            attributes
                .SetGUID(
                    &MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
                    &MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID,
                )
                .map_err(|error| format!("Windows camera enumeration setup failed: {error}"))?;
        }

        let mut entries = ptr::null_mut();
        let mut count = 0u32;
        unsafe { MFEnumDeviceSources(&attributes, &mut entries, &mut count) }
            .map_err(|error| format!("Windows camera enumeration failed: {error}"))?;
        if entries.is_null() || count == 0 {
            return Err("No Windows camera devices are available".to_string());
        }

        let desired = device_label.map(normalized_label);
        let mut selected = None;
        unsafe {
            let activations = std::slice::from_raw_parts_mut(entries, count as usize);
            for activation in activations.iter().flatten() {
                let label = camera_label(activation).unwrap_or_default();
                if selected.is_none() && desired.is_none() {
                    selected = Some(activation.clone());
                }
                if desired.as_deref() == Some(normalized_label(&label).as_str()) {
                    selected = Some(activation.clone());
                    break;
                }
            }
            for activation in activations {
                ptr::drop_in_place(activation);
            }
            CoTaskMemFree(Some(entries.cast()));
        }

        selected.ok_or_else(|| {
            "The selected Windows camera is not available to native output".to_string()
        })
    }

    fn camera_label(activation: &IMFActivate) -> Result<String, String> {
        let length = unsafe { activation.GetStringLength(&MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME) }
            .map_err(|error| format!("Windows camera label length failed: {error}"))?;
        let mut value = vec![0u16; length as usize + 1];
        unsafe {
            activation
                .GetString(&MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME, &mut value, None)
                .map_err(|error| format!("Windows camera label failed: {error}"))?;
        }
        Ok(String::from_utf16_lossy(&value[..length as usize]))
    }

    fn normalized_label(value: &str) -> String {
        value.trim().to_lowercase()
    }

    fn pack_ratio(numerator: u32, denominator: u32) -> u64 {
        (u64::from(numerator) << 32) | u64::from(denominator)
    }

    fn unpack_ratio(value: u64) -> (u32, u32) {
        ((value >> 32) as u32, value as u32)
    }

    fn copy_rgb32_frame(
        bytes: *const u8,
        length: usize,
        width: u32,
        height: u32,
        stride: i32,
    ) -> Result<Vec<u8>, String> {
        if bytes.is_null() {
            return Err("Windows camera returned an empty frame buffer".to_string());
        }
        let row_bytes = width as usize * 4;
        let stride_bytes = stride.unsigned_abs() as usize;
        let required = stride_bytes
            .saturating_mul(height.saturating_sub(1) as usize)
            .saturating_add(row_bytes);
        if row_bytes == 0 || height == 0 || length < required {
            return Err("Windows camera returned a short RGB32 frame".to_string());
        }
        let source = unsafe { std::slice::from_raw_parts(bytes, length) };
        let mut rgb = Vec::with_capacity(width as usize * height as usize * 3);
        for y in 0..height as usize {
            let source_y = if stride < 0 {
                height as usize - 1 - y
            } else {
                y
            };
            let row = &source[source_y * stride_bytes..source_y * stride_bytes + row_bytes];
            for pixel in row.chunks_exact(4) {
                rgb.extend_from_slice(&[pixel[2], pixel[1], pixel[0]]);
            }
        }
        Ok(rgb)
    }

    #[cfg(test)]
    mod tests {
        use super::copy_rgb32_frame;

        #[test]
        fn converts_top_down_bgra_rows_to_rgb() {
            let bgra = [
                0, 0, 255, 255, 0, 255, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255,
            ];
            let rgb = copy_rgb32_frame(bgra.as_ptr(), bgra.len(), 2, 2, 8).unwrap();
            assert_eq!(rgb, [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
        }

        #[test]
        fn flips_bottom_up_bgra_rows_and_honors_padding() {
            let bgra = [
                255, 0, 0, 255, 255, 255, 255, 255, 9, 9, 9, 9, 0, 0, 255, 255, 0, 255, 0, 255,
            ];
            let rgb = copy_rgb32_frame(bgra.as_ptr(), bgra.len(), 2, 2, -12).unwrap();
            assert_eq!(rgb, [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::{DecodedRgbFrame, NativeCameraSource};

    #[derive(Debug)]
    pub(super) struct NativeCameraFrameReader;

    impl NativeCameraFrameReader {
        pub(super) fn start(_source: &NativeCameraSource) -> Result<Self, String> {
            Err("Native camera capture is not implemented on this platform".to_string())
        }

        pub(super) fn read_latest_frame(&mut self) -> Result<Option<DecodedRgbFrame>, String> {
            Ok(None)
        }
    }
}
