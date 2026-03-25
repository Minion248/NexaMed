// src/pages/LoginPage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const FIREBASE_ERRORS = {
  "auth/user-not-found":         "No account found with this email.",
  "auth/wrong-password":         "Incorrect password.",
  "auth/email-already-in-use":   "An account with this email already exists.",
  "auth/invalid-email":          "Please enter a valid email address.",
  "auth/too-many-requests":      "Too many attempts. Try again later.",
  "auth/network-request-failed": "Network error. Check your connection.",
  "auth/invalid-credential":     "Invalid email or password.",
  "auth/popup-closed-by-user":   "Google sign-in was cancelled.",
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

export default function LoginPage() {
  const [tab,  setTab]  = useState("login");
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");
  const [info, setInfo] = useState("");
  const [form, setForm] = useState({
    email: "", password: "", confirm: "",
    displayName: "", role: "EMT", station: "", badge: "",
  });

  const { login, register, loginGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();

  const field = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const switchTab = (t) => { setTab(t); setErr(""); setInfo(""); };

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(""); setInfo(""); setBusy(true);
    try {
      if (tab === "login") {
        await login(form.email, form.password);
        navigate("/", { replace: true });
      } else if (tab === "register") {
        if (!form.displayName.trim())        throw new Error("Full name is required.");
        if (form.password.length < 6)        throw new Error("Password must be at least 6 characters.");
        if (form.password !== form.confirm)  throw new Error("Passwords do not match.");
        await register(form.email, form.password, form.displayName, form.role);
        navigate("/", { replace: true });
      } else {
        await resetPassword(form.email);
        setInfo("Password reset email sent — check your inbox.");
      }
    } catch (e2) {
      setErr(FIREBASE_ERRORS[e2.code] || e2.message || "Something went wrong.");
    }
    setBusy(false);
  }

  async function handleGoogle() {
    setErr(""); setBusy(true);
    try {
      await loginGoogle();
      navigate("/", { replace: true });
    } catch (e2) {
      setErr(FIREBASE_ERRORS[e2.code] || e2.message || "Google sign-in failed.");
    }
    setBusy(false);
  }

  const IN = {
    width: "100%", background: "rgba(255,255,255,0.04)",
    border: "1px solid #1e3a5f", borderRadius: 10,
    color: "#e2e8f0", padding: "11px 14px", fontSize: 13,
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };
  const LB = { display: "block", fontSize: 10, fontWeight: 700, opacity: 0.45, letterSpacing: "1.5px", marginBottom: 6 };
  const PB = {
    width: "100%", padding: "13px", borderRadius: 12,
    background: busy ? "#374151" : "linear-gradient(135deg,#ef4444,#b91c1c)",
    color: "white", border: "none", cursor: busy ? "not-allowed" : "pointer",
    fontWeight: 900, fontSize: 13, letterSpacing: "2px", fontFamily: "inherit",
    boxShadow: busy ? "none" : "0 4px 18px rgba(239,68,68,0.3)",
  };
  const GB = {
    width: "100%", padding: "12px", borderRadius: 12,
    background: "rgba(255,255,255,0.05)", border: "1px solid #1e3a5f",
    color: "#e2e8f0", cursor: "pointer", fontWeight: 700, fontSize: 13,
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 10, fontFamily: "inherit",
  };
  const LK = { background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, padding: 0 };
  const TB = (a) => ({
    flex: 1, padding: "8px 4px", borderRadius: 8, border: "none",
    background: a ? "#ef4444" : "transparent",
    color: a ? "white" : "#94a3b8",
    fontWeight: a ? 800 : 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#060d18", fontFamily: '"IBM Plex Mono","Courier New",monospace', padding: 20, position: "relative", overflow: "hidden" }}>

      {/* Background grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(239,68,68,0.05) 1px,transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />
      {/* Glow */}
      <div style={{ position: "absolute", top: -160, left: "50%", transform: "translateX(-50%)", width: 600, height: 400, background: "radial-gradient(ellipse,rgba(239,68,68,0.1) 0%,transparent 70%)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 430, background: "#0d1b2e", border: "1px solid #1e3a5f", borderRadius: 20, padding: "36px 30px", boxShadow: "0 30px 80px rgba(0,0,0,0.7)", position: "relative", zIndex: 1, color: "#e2e8f0" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, background: "linear-gradient(135deg,#ef4444,#b91c1c)", borderRadius: 14, marginBottom: 12, boxShadow: "0 0 28px rgba(239,68,68,0.4)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <div style={{ fontWeight: 900, fontSize: 20 }}>Nexa<span style={{ color: "#ef4444" }}>Med</span></div>
          <div style={{ fontSize: 9, opacity: 0.3, letterSpacing: "3px", marginTop: 3 }}>EMT PCR COMMAND SYSTEM</div>
        </div>

        {/* Tabs */}
        {tab !== "forgot" && (
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4, marginBottom: 24 }}>
            <button style={TB(tab === "login")}    onClick={() => switchTab("login")}>SIGN IN</button>
            <button style={TB(tab === "register")} onClick={() => switchTab("register")}>REGISTER</button>
          </div>
        )}

        {/* Error / Info */}
        {err  && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#f87171", marginBottom: 16, lineHeight: 1.5 }}>⚠ {err}</div>}
        {info && <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#4ade80", marginBottom: 16, lineHeight: 1.5 }}>✓ {info}</div>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {tab === "register" && (
            <div><label style={LB}>FULL NAME</label>
              <input style={IN} placeholder="Muhammad Ali Khan" value={form.displayName} onChange={field("displayName")} required />
            </div>
          )}

          <div><label style={LB}>EMAIL ADDRESS</label>
            <input style={IN} type="email" placeholder="emt@rescue1122.pk" value={form.email} onChange={field("email")} required />
          </div>

          {tab !== "forgot" && (
            <div><label style={LB}>PASSWORD</label>
              <input style={IN} type="password" placeholder="••••••••" value={form.password} onChange={field("password")} required minLength={6} />
            </div>
          )}

          {tab === "register" && (
            <>
              <div><label style={LB}>CONFIRM PASSWORD</label>
                <input style={IN} type="password" placeholder="••••••••" value={form.confirm} onChange={field("confirm")} required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={LB}>ROLE</label>
                  <select style={{ ...IN, cursor: "pointer" }} value={form.role} onChange={field("role")}>
                    <option value="EMT">EMT</option>
                    <option value="Paramedic">Paramedic</option>
                    <option value="Dispatcher">Dispatcher</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div><label style={LB}>BADGE # (OPT)</label>
                  <input style={IN} placeholder="1122-001" value={form.badge} onChange={field("badge")} />
                </div>
              </div>
              <div><label style={LB}>STATION / UNIT (OPT)</label>
                <input style={IN} placeholder="Rescue 1122 Lahore Central" value={form.station} onChange={field("station")} />
              </div>
            </>
          )}

          {tab === "login" && (
            <div style={{ textAlign: "right", marginTop: -6 }}>
              <button type="button" style={LK} onClick={() => switchTab("forgot")}>Forgot password?</button>
            </div>
          )}

          <button type="submit" disabled={busy} style={{ ...PB, marginTop: 4 }}>
            {busy ? "PROCESSING…" : tab === "login" ? "SIGN IN" : tab === "register" ? "CREATE ACCOUNT" : "SEND RESET EMAIL"}
          </button>

          {tab !== "forgot" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: "#1e3a5f" }} />
                <span style={{ fontSize: 10, opacity: 0.35, letterSpacing: "2px" }}>OR</span>
                <div style={{ flex: 1, height: 1, background: "#1e3a5f" }} />
              </div>
              <button type="button" onClick={handleGoogle} disabled={busy} style={GB}>
                <GoogleIcon /> Continue with Google
              </button>
            </>
          )}
        </form>

        <div style={{ marginTop: 20, textAlign: "center", fontSize: 12, opacity: 0.6 }}>
          {tab === "login"    && <><span>No account? </span><button style={LK} onClick={() => switchTab("register")}>Register</button></>}
          {tab === "register" && <><span>Have account? </span><button style={LK} onClick={() => switchTab("login")}>Sign In</button></>}
          {tab === "forgot"   && <button style={LK} onClick={() => switchTab("login")}>← Back to Sign In</button>}
        </div>
      </div>

      <style>{`input:focus,select:focus{border-color:#3b82f6!important;outline:none} input::placeholder{opacity:0.35}`}</style>
    </div>
  );
}