import React, { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";

const ACCENT = "#7B7BFF";
const T = {
  bg: "#0A0A0F", surface: "rgba(21,21,29,.86)", surface2: "rgba(32,32,44,.85)",
  text: "#F4F4F8", muted: "#9C9CAC", faint: "#63636F", border: "rgba(255,255,255,.07)",
};

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind: 'error'|'info', text }

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setMsg({ kind: "info", text: "Account created — check your email for a confirmation link, then log in." });
        }
        // If email confirmation is disabled, onAuthStateChange in App.jsx takes over.
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setMsg({ kind: "error", text: err.message || "Something went wrong" });
    } finally {
      setBusy(false);
    }
  };

  const field = {
    background: T.surface2, border: `1px solid ${T.border}`, color: T.text,
    width: "100%", borderRadius: 14, padding: "11px 14px", fontSize: 14, outline: "none",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center", padding: 24,
      background: `radial-gradient(circle at 30% 20%, ${ACCENT}1E, transparent 50%), radial-gradient(circle at 75% 75%, #4ADE8018, transparent 50%), ${T.bg}`,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        input:focus-visible, button:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }`}</style>
      <div style={{
        width: "100%", maxWidth: 380, background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 28, padding: 28, backdropFilter: "blur(16px)",
        boxShadow: "0 2px 6px rgba(0,0,0,.45), 0 18px 48px rgba(0,0,0,.42)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 12, background: ACCENT, boxShadow: `0 0 18px ${ACCENT}77` }}>
            <Check size={18} color="#0A0A0F" strokeWidth={3} />
          </span>
          <div>
            <p style={{ color: T.text, fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em", margin: 0 }}>Kept</p>
            <p style={{ color: T.faint, fontSize: 12, margin: 0 }}>{mode === "login" ? "Welcome back" : "Create your account"}</p>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="email" required autoComplete="email" placeholder="Email"
            value={email} onChange={(e) => setEmail(e.target.value)} style={field} aria-label="Email" />
          <input type="password" required minLength={6} placeholder="Password (6+ characters)"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password} onChange={(e) => setPassword(e.target.value)} style={field} aria-label="Password" />
          <button type="submit" disabled={busy} style={{
            marginTop: 6, borderRadius: 16, padding: "12px 0", border: "none", cursor: "pointer",
            background: ACCENT, color: "#0A0A0F", fontWeight: 600, fontSize: 14,
            boxShadow: `0 8px 28px -6px ${ACCENT}77`, opacity: busy ? 0.7 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {busy && <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />}
            {mode === "login" ? "Log in" : "Sign up"}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </form>

        {msg && (
          <p role="alert" style={{
            marginTop: 12, fontSize: 12.5, lineHeight: 1.5, borderRadius: 12, padding: "9px 12px",
            background: msg.kind === "error" ? "#FF6B7A1A" : ACCENT + "16",
            color: msg.kind === "error" ? "#FF9A9A" : "#C9C9FF",
            border: `1px solid ${msg.kind === "error" ? "#FF6B7A40" : ACCENT + "35"}`,
          }}>{msg.text}</p>
        )}

        <p style={{ marginTop: 16, fontSize: 13, color: T.muted, textAlign: "center" }}>
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(null); }}
            style={{ background: "none", border: "none", color: ACCENT, fontWeight: 600, cursor: "pointer", fontSize: 13, padding: 0 }}>
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}
