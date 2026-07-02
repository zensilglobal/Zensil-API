"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.ok) {
        router.push("/");
        router.refresh();
      } else {
        setErr(data.error || "Sign in failed");
      }
    } catch {
      setErr("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="crest" style={{ justifyContent: "center" }}>
          <div className="mark">Z</div>
          <div className="word">
            <b>ZENSIL</b>
            <span>Ops Console</span>
          </div>
        </div>
        <p className="tiny muted" style={{ textAlign: "center", marginTop: 14 }}>
          Sign in to the operations console
        </p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {err && <div className="login-err">{err}</div>}
          <button type="submit" className="btn gold" style={{ width: "100%", justifyContent: "center", marginTop: 20, padding: "12px" }} disabled={loading}>
            <Sparkles size={15} /> {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
