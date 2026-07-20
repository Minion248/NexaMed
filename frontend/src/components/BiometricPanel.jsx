// src/components/BiometricPanel.jsx
import { useEffect, useRef, useState } from "react";

const BACKEND = "http://127.0.0.1:8000";

const TRACKS = [
  {
    id:          "face",
    biometricType: "face",
    mockToken:   "face_vector_01",
    title:       "Face Recognition Link",
    icon:        "👤",
    color:       "#6366f1",
    accepts:     "image/*",
  },
  {
    id:          "fingerprint",
    biometricType: "fingerprint",
    mockToken:   "fp_hash_02",
    title:       "Thumbprint Scanner Link",
    icon:        "🖐",
    color:       "#0ea5e9",
    accepts:     "image/*",
  },
  {
    id:          "iris",
    biometricType: "iris",
    mockToken:   "iris_scan_03",
    title:       "Iris Scanner Array Link",
    icon:        "👁",
    color:       "#8b5cf6",
    accepts:     "image/*",
  },
];

const PANEL_BG    = "#0a1424";
const BORDER      = "#1e3a5f";
const TEXT        = "#e2e8f0";
const SUBTLE_TEXT = "rgba(226,232,240,0.55)";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BiometricPanel({ onVerificationSuccess, onVerificationFailure }) {
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [statusMsg, setStatusMsg]     = useState("");
  const [activeTrack, setActiveTrack] = useState(null);
  const [cameraTrackId, setCameraTrackId] = useState(null);
  const [cameraError, setCameraError] = useState("");

  const faceInputRef = useRef(null);
  const fpInputRef    = useRef(null);
  const irisInputRef  = useRef(null);
  const fileInputRefs = { face: faceInputRef, fingerprint: fpInputRef, iris: irisInputRef };

  const videoRef  = useRef(null);
  const streamRef = useRef(null);

  // Always release the camera when the component unmounts
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  async function runVerificationPipeline(biometricType, mockToken, realFileBase64 = null) {
    if (loading) return;

    setLoading(true);
    setActiveTrack(biometricType);
    setStatusMsg("Extracting features & querying registry...");

    // Artificial processing delay so the pipeline reads as a real device round-trip
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Real captured/uploaded images go through image-recognition mode (image_data);
    // the hardware-simulator buttons go through the direct vault-token mode
    // (token) since they aren't actual images, just device stub outputs.
    const payload = realFileBase64
      ? { biometric_type: biometricType, image_data: realFileBase64 }
      : { biometric_type: biometricType, token: mockToken };

    try {
      const resp = await fetch(`${BACKEND}/nadra/biometric-lookup`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(15000),
      });

      if (resp.ok) {
        const data = await resp.json();
        setStatusMsg("Identity verified.");
        onVerificationSuccess?.(data);
        return;
      }

      if (resp.status === 404) {
        setStatusMsg("Identity failure — no registry match.");
        onVerificationFailure?.();
        return;
      }

      // Unexpected server error — surface it locally, still resolve the pipeline
      setStatusMsg(`Lookup failed (HTTP ${resp.status}).`);
      onVerificationFailure?.();
    } catch (err) {
      setStatusMsg(
        err.name === "TimeoutError" || err.name === "AbortError"
          ? "Lookup timed out — check backend."
          : `Lookup error: ${err.message}`
      );
      onVerificationFailure?.();
    } finally {
      setLoading(false);
      setActiveTrack(null);
      setTimeout(() => setStatusMsg(""), 3500);
    }
  }

  // ── Option B: Upload ────────────────────────────────────────────────────
  async function handleFileCapture(track, e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const base64 = await fileToBase64(file);
    runVerificationPipeline(track.biometricType, track.mockToken, base64);
  }

  // ── Option A: Scan (live camera) ────────────────────────────────────────
  async function openCamera(track) {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setCameraTrackId(track.id);
    } catch (err) {
      setCameraError(`Camera unavailable: ${err.message}`);
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraTrackId(null);
  }

  function captureFrame(track) {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width  = video.videoWidth  || 320;
    canvas.height = video.videoHeight || 240;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/png");
    closeCamera();
    runVerificationPipeline(track.biometricType, track.mockToken, base64);
  }

  // Attach the live stream to the <video> element once it mounts for the open track
  useEffect(() => {
    if (cameraTrackId && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraTrackId]);

  const iconBtn = (color, extra = {}) => ({
    fontSize: 11, fontWeight: 600, color: "#fff",
    background: color, border: "none", borderRadius: 6,
    padding: "6px 9px", cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.6 : 1, whiteSpace: "nowrap",
    ...extra,
  });

  return (
    <div style={{
      background: PANEL_BG,
      border: `1px solid ${BORDER}`,
      borderRadius: 12,
      overflow: "hidden",
      fontFamily: "system-ui, sans-serif",
    }}>
      {/* ── Accordion header ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsSimulatorOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: TEXT, display: "flex", alignItems: "center", gap: 8 }}>
          🖥 Simulate Biometric Scanner
          {loading && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#38bdf8", fontWeight: 600 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" style={{ animation: "biometric-spin 0.9s linear infinite" }}>
                <circle cx="12" cy="12" r="10" stroke="#38bdf8" strokeWidth="3" fill="none" strokeDasharray="30 70" />
              </svg>
              {statusMsg}
            </span>
          )}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 6" style={{
          transform: isSimulatorOpen ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.25s ease", opacity: 0.6, flexShrink: 0,
        }}>
          <path d="M1 1l4 4 4-4" stroke={TEXT} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── Collapsible body ─────────────────────────────────────────────── */}
      <div style={{
        maxHeight: isSimulatorOpen ? 900 : 0,
        opacity: isSimulatorOpen ? 1 : 0,
        overflow: "hidden",
        transition: "max-height 0.35s ease, opacity 0.25s ease",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 14px 14px" }}>

          {TRACKS.map(track => (
            <div key={track.id} style={{
              display: "flex", flexDirection: "column", gap: 8,
              padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}`,
              background: activeTrack === track.biometricType ? "rgba(255,255,255,0.04)" : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>{track.icon}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: TEXT, fontWeight: 600 }}>{track.title}</span>

                <input
                  ref={fileInputRefs[track.id]}
                  type="file"
                  accept={track.accepts}
                  style={{ display: "none" }}
                  onChange={(e) => handleFileCapture(track, e)}
                />

                <button type="button" disabled={loading}
                  title="Open live camera"
                  onClick={() => (cameraTrackId === track.id ? closeCamera() : openCamera(track))}
                  style={iconBtn(track.color)}>
                  📷 Scan
                </button>
                <button type="button" disabled={loading}
                  title="Upload a photo"
                  onClick={() => fileInputRefs[track.id].current?.click()}
                  style={iconBtn(track.color)}>
                  📁 Upload
                </button>
                <button type="button" disabled={loading}
                  title={`Simulate with ${track.mockToken}`}
                  onClick={() => runVerificationPipeline(track.biometricType, track.mockToken)}
                  style={{
                    fontSize: 11, fontWeight: 600, color: track.color,
                    background: "transparent", border: `1px solid ${track.color}`, borderRadius: 6,
                    padding: "6px 9px", cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.6 : 1, whiteSpace: "nowrap",
                  }}>
                  ▶️ Simulate
                </button>
              </div>

              {/* Live camera preview — only rendered for the track currently scanning */}
              {cameraTrackId === track.id && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: 200, borderRadius: 8, border: `1px solid ${track.color}`, background: "#000" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => captureFrame(track)}
                      style={iconBtn(track.color)}>
                      📸 Capture
                    </button>
                    <button type="button" onClick={closeCamera}
                      style={iconBtn("#4b5563")}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Track 4 — Failed / Unregistered Scan */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 12px", borderRadius: 8, border: "1px solid #7f1d1d",
            background: activeTrack === "fail" ? "rgba(239,68,68,0.08)" : "transparent",
          }}>
            <span style={{ fontSize: 16 }}>⛔</span>
            <span style={{ flex: 1, fontSize: 12.5, color: TEXT, fontWeight: 600 }}>
              Failed / Unregistered Scan
            </span>
            <button
              type="button"
              disabled={loading}
              onClick={() => runVerificationPipeline("fail", "INVALID_BIOMETRIC_BLOB")}
              style={{
                fontSize: 11.5, fontWeight: 700, color: "#fff",
                background: "#ef4444", border: "none", borderRadius: 6,
                padding: "6px 10px", cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1, whiteSpace: "nowrap",
              }}
            >
              ⚠️ Trigger Fail Rule
            </button>
          </div>

          {cameraError && (
            <div style={{ fontSize: 10.5, color: "#f87171" }}>{cameraError}</div>
          )}
          {!loading && statusMsg && (
            <div style={{ fontSize: 11, color: SUBTLE_TEXT }}>{statusMsg}</div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes biometric-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
