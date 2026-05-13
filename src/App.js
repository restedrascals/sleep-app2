import { useState, useEffect, useCallback } from "react";

// ============================================================
// CONFIGURATION — paste your Supabase credentials here
// ============================================================
const SUPABASE_URL = "https://multcyytkvxkjtafkjah.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_p7aBSLRAIp7rSNfOICr_Rw_VN5gM-Ci";

// ============================================================
// SUPABASE HELPERS
// ============================================================
async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const db = {
  select: (table, query = "") => sbFetch(`${table}?${query}`),
  insert: (table, data) =>
    sbFetch(table, { method: "POST", body: JSON.stringify(data) }),
  update: (table, query, data) =>
    sbFetch(`${table}?${query}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  upsert: (table, data) =>
    sbFetch(table, {
      method: "POST",
      prefer: "return=representation",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(data),
    }),
  delete: (table, query) =>
    sbFetch(`${table}?${query}`, { method: "DELETE" }),
};

// ============================================================
// INTAKE QUESTIONS
// ============================================================
const INTAKE_QUESTIONS = [
  {
    section: "About Your Child",
    questions: [
      {
        id: "q_age",
        label: "How old is your child?",
        type: "text",
        placeholder: "e.g. 8 months",
      },
      {
        id: "q_siblings",
        label: "Does your child have siblings?",
        type: "textarea",
        placeholder: "Names and ages",
      },
      {
        id: "q_birth_history",
        label: "Tell me about your child's birth history.",
        type: "textarea",
        placeholder: "Full term, early, any complications...",
      },
    ],
  },
  {
    section: "Health History",
    questions: [
      {
        id: "q_medical",
        label: "Does your child have any medical conditions or diagnoses?",
        type: "textarea",
        placeholder: "Reflux, allergies, tongue tie, etc.",
      },
      {
        id: "q_medications",
        label: "Is your child currently on any medications?",
        type: "textarea",
        placeholder: "Name, dose, reason",
      },
      {
        id: "q_health_concerns",
        label: "Any other health concerns we should be aware of?",
        type: "textarea",
        placeholder: "",
      },
    ],
  },
  {
    section: "Current Sleep Situation",
    questions: [
      {
        id: "q_sleep_location",
        label: "Where does your child currently sleep?",
        type: "textarea",
        placeholder: "Cot, bassinet, your bed...",
      },
      {
        id: "q_sleep_environment",
        label: "Describe the child's environment where they sleep?",
        type: "textarea",
        placeholder: "e.g. Light, noise, approximate temperature",
      },
      {
        id: "q_bedtime_person",
        label: "Who usually puts the child to bed?",
        type: "textarea",
        placeholder: "",
      },
      {
        id: "q_life_events",
        label: "Are there any significant events in life that would impact the sleep?",
        type: "textarea",
        placeholder: "e.g. New sibling, house move, illness, travel...",
      },
      {
        id: "q_sleep_associations",
        label: "How does your child fall asleep?",
        type: "textarea",
        placeholder: "Feeding, rocking, patting, dummy...",
      },
      {
        id: "q_naps",
        label: "Describe a typical nap situation.",
        type: "textarea",
        placeholder: "How many, how long, where, how they fall asleep",
      },
      {
        id: "q_night_wakings",
        label: "How often does your child wake overnight?",
        type: "textarea",
        placeholder: "Approximate times and what helps them back to sleep",
      },
      {
        id: "q_schedule",
        label: "What does a typical day look like? (rough schedule)",
        type: "textarea",
        placeholder: "Wake time, feeds, naps, bedtime routine...",
      },
    ],
  },
  {
    section: "Feeding",
    questions: [
      {
        id: "q_feeding_method",
        label: "How is your child fed?",
        type: "text",
        placeholder: "Breastfed, formula, solids, combination...",
      },
      {
        id: "q_night_feeds",
        label: "How many night feeds does your child currently have?",
        type: "text",
        placeholder: "",
      },
      {
        id: "q_feeding_sleep",
        label: "Does feeding play a role in getting your child to sleep?",
        type: "textarea",
        placeholder: "",
      },
    ],
  },
  {
    section: "Your Goals & Concerns",
    questions: [
      {
        id: "q_main_concern",
        label: "What is your main concern about your child's sleep?",
        type: "textarea",
        placeholder: "",
      },
      {
        id: "q_goals",
        label: "What are your sleep goals?",
        type: "textarea",
        placeholder: "What would success look like for you?",
      },
      {
        id: "q_tried",
        label: "What have you already tried?",
        type: "textarea",
        placeholder: "",
      },
      {
        id: "q_other",
        label: "Is there anything else you'd like me to know?",
        type: "textarea",
        placeholder: "",
      },
    ],
  },
];

// ============================================================
// TIME HELPERS
// ============================================================
function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToDuration(mins) {
  if (mins === null || isNaN(mins)) return "--";
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function calcNapDuration(nap) {
  const s = timeToMinutes(nap.start);
  const e = timeToMinutes(nap.end);
  if (s === null || e === null) return null;
  let diff = e - s;
  if (diff < 0) diff += 1440;
  return diff;
}

function calcWakeWindow(t1, t2) {
  const a = timeToMinutes(t1);
  const b = timeToMinutes(t2);
  if (a === null || b === null) return null;
  let diff = b - a;
  if (diff < 0) diff += 1440;
  return diff;
}

function calcTotalSleep(log) {
  let total = 0;
  (log.naps || []).forEach((n) => {
    const d = calcNapDuration(n);
    if (d) total += d;
  });
  if (log.wake_time && log.bedtime) {
    const w = timeToMinutes(log.wake_time);
    const b = timeToMinutes(log.bedtime);
    let night = w - b;
    if (night < 0) night += 1440;
    total += night;
  }
  return total;
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysRemaining(startDate, length) {
  if (!startDate) return null;
  const start = new Date(startDate);
  const end = new Date(start.getTime() + length * 86400000);
  const now = new Date();
  const diff = Math.ceil((end - now) / 86400000);
  return diff;
}

function daysSince(startDate) {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const now = new Date();
  return Math.floor((now - start) / 86400000);
}

// ============================================================
// STYLES
// ============================================================
const S = {
  app: {
    minHeight: "100vh",
    background: "#f8f5f0",
    fontFamily: "'Georgia', serif",
    color: "#2d2a26",
  },
  header: {
    background: "#2d2a26",
    color: "#f8f5f0",
    padding: "16px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: "400",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  container: { maxWidth: "900px", margin: "0 auto", padding: "24px 16px" },
  card: {
    background: "#fff",
    borderRadius: "12px",
    border: "1px solid #e8e3dc",
    padding: "24px",
    marginBottom: "16px",
  },
  btn: {
    background: "#2d2a26",
    color: "#f8f5f0",
    border: "none",
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "14px",
    cursor: "pointer",
    letterSpacing: "0.04em",
  },
  btnOutline: {
    background: "transparent",
    color: "#2d2a26",
    border: "1px solid #2d2a26",
    borderRadius: "8px",
    padding: "9px 18px",
    fontSize: "14px",
    cursor: "pointer",
  },
  btnDanger: {
    background: "#c0392b",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "9px 18px",
    fontSize: "14px",
    cursor: "pointer",
  },
  btnSmall: {
    background: "#2d2a26",
    color: "#f8f5f0",
    border: "none",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "12px",
    cursor: "pointer",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #ddd8d0",
    borderRadius: "8px",
    fontSize: "14px",
    fontFamily: "inherit",
    boxSizing: "border-box",
    background: "#fdfcfb",
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #ddd8d0",
    borderRadius: "8px",
    fontSize: "14px",
    fontFamily: "inherit",
    boxSizing: "border-box",
    background: "#fdfcfb",
    minHeight: "80px",
    resize: "vertical",
  },
  label: {
    display: "block",
    fontSize: "13px",
    color: "#6b6560",
    marginBottom: "6px",
    fontWeight: "400",
  },
  sectionTitle: {
    fontSize: "13px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#a09890",
    fontFamily: "sans-serif",
    marginBottom: "16px",
    marginTop: "0",
  },
  h2: { fontSize: "22px", fontWeight: "400", margin: "0 0 20px" },
  badge: (color) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    background: color === "green" ? "#e8f5e9" : color === "red" ? "#fdecea" : color === "amber" ? "#fff8e1" : "#f0f0f0",
    color: color === "green" ? "#2e7d32" : color === "red" ? "#c62828" : color === "amber" ? "#e65100" : "#555",
  }),
  progressBar: (pct, color) => ({
    height: "6px",
    background: "#ede9e3",
    borderRadius: "3px",
    overflow: "hidden",
  }),
  progressFill: (pct, color) => ({
    height: "100%",
    width: `${Math.min(100, pct)}%`,
    background: pct > 90 ? "#e74c3c" : pct > 70 ? "#f39c12" : "#4caf50",
    borderRadius: "3px",
    transition: "width 0.3s",
  }),
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "12px",
  },
  row: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
  statCard: {
    background: "#f8f5f0",
    borderRadius: "8px",
    padding: "12px 16px",
    textAlign: "center",
  },
  statVal: { fontSize: "22px", fontWeight: "500", margin: "0" },
  statLabel: { fontSize: "12px", color: "#9a9590", marginTop: "4px", margin: "4px 0 0" },
  divider: { border: "none", borderTop: "1px solid #ede9e3", margin: "20px 0" },
  tab: (active) => ({
    padding: "8px 16px",
    border: "none",
    background: active ? "#2d2a26" : "transparent",
    color: active ? "#f8f5f0" : "#6b6560",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
  }),
  loginBox: {
    maxWidth: "360px",
    margin: "80px auto",
    background: "#fff",
    borderRadius: "16px",
    padding: "40px",
    border: "1px solid #e8e3dc",
    textAlign: "center",
  },
};

// ============================================================
// LOGIN SCREEN — CLIENT
// ============================================================
function ClientLogin({ onLogin }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const results = await db.select(
        "clients",
        `access_code=eq.${encodeURIComponent(code.trim())}&select=*`
      );
      if (results && results.length > 0) {
        sessionStorage.setItem("client_id", results[0].id);
        onLogin(results[0]);
      } else {
        setError("Code not recognised. Please check with your consultant.");
      }
    } catch (e) {
      setError("Connection error. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div style={S.app}>
      <div style={S.loginBox}>
        <img src="data:image/png;base64,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" alt="Rested Rascals" style={{ height:"72px", objectFit:"contain", marginBottom:"12px" }} />
        <h1 style={{ fontSize: "22px", fontWeight: "400", marginBottom: "8px" }}>Rested Rascals</h1>
        <p style={{ color: "#9a9590", fontSize: "14px", marginBottom: "28px" }}>
          Enter the code your consultant gave you
        </p>
        <input
          style={{ ...S.input, textAlign: "center", fontSize: "20px", letterSpacing: "0.2em", marginBottom: "16px" }}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. MOON42"
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
        {error && <p style={{ color: "#c0392b", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}
        <button style={{ ...S.btn, width: "100%" }} onClick={handleLogin} disabled={loading}>
          {loading ? "Checking..." : "Enter"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// COACH LOGIN
// ============================================================
function CoachLogin({ onLogin }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const settings = await db.select("app_settings", "id=eq.1&select=*");
      if (settings && settings[0]?.coach_password_hash === pw) {
        sessionStorage.setItem("coach_authed", "1");
        onLogin();
      } else {
        setError("Incorrect password.");
      }
    } catch (e) {
      setError("Connection error.");
    }
    setLoading(false);
  }

  return (
    <div style={S.loginBox}>
      <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔐</div>
      <h2 style={{ fontWeight: "400", marginBottom: "20px" }}>Coach Dashboard</h2>
      <input
        type="password"
        style={{ ...S.input, marginBottom: "12px" }}
        placeholder="Password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
      />
      {error && <p style={{ color: "#c0392b", fontSize: "13px" }}>{error}</p>}
      <button style={{ ...S.btn, width: "100%", marginTop: "4px" }} onClick={handleLogin} disabled={loading}>
        {loading ? "Checking..." : "Log In"}
      </button>
    </div>
  );
}

// ============================================================
// CLIENT APP
// ============================================================
function ClientApp({ client, onLogout }) {
  const [tab, setTab] = useState("diary");
  const [intake, setIntake] = useState(null);
  const [intakeResponses, setIntakeResponses] = useState({});
  const [intakeSaved, setIntakeSaved] = useState(false);
  const [logs, setLogs] = useState({});
  const [selectedDate, setSelectedDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [autoSaveTimer, setAutoSaveTimer] = useState(null);

  useEffect(() => {
    loadIntake();
    loadLogs();
  }, []);

  async function loadIntake() {
    try {
      const res = await db.select(
        "intake_responses",
        `client_id=eq.${client.id}&select=*`
      );
      if (res && res.length > 0) {
        setIntake(res[0]);
        setIntakeResponses(res[0].responses || {});
        setIntakeSaved(!!res[0].completed_at);
      }
    } catch (e) {}
  }

  async function loadLogs() {
    try {
      const res = await db.select(
        "sleep_logs",
        `client_id=eq.${client.id}&order=log_date.desc&select=*`
      );
      const map = {};
      (res || []).forEach((l) => (map[l.log_date] = l));
      setLogs(map);
    } catch (e) {}
  }

  function getLog(date) {
    return logs[date] || { log_date: date, wake_time: "", bedtime: "", naps: [], night_notes: "" };
  }

  function updateLog(date, field, value) {
    const current = getLog(date);
    const updated = { ...current, [field]: value };
    setLogs((prev) => ({ ...prev, [date]: updated }));
    scheduleAutoSave(date, updated);
  }

  function scheduleAutoSave(date, log) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    const t = setTimeout(() => saveLog(date, log), 1200);
    setAutoSaveTimer(t);
  }

  async function saveLog(date, logData) {
    setSaving(true);
    try {
      await db.upsert("sleep_logs", {
        ...(logData.id ? { id: logData.id } : {}),
        client_id: client.id,
        log_date: date,
        wake_time: logData.wake_time || null,
        bedtime: logData.bedtime || null,
        naps: logData.naps || [],
        night_notes: logData.night_notes || null,
        updated_at: new Date().toISOString(),
      });
      await loadLogs();
    } catch (e) {}
    setSaving(false);
  }

  async function saveIntake() {
    setSaving(true);
    try {
      if (intake?.id) {
        await db.update(
          "intake_responses",
          `id=eq.${intake.id}`,
          { responses: intakeResponses, completed_at: new Date().toISOString() }
        );
      } else {
        await db.insert("intake_responses", {
          client_id: client.id,
          responses: intakeResponses,
          completed_at: new Date().toISOString(),
        });
      }
      await loadIntake();
      setIntakeSaved(true);
    } catch (e) {}
    setSaving(false);
  }

  const log = getLog(selectedDate);
  const totalSleep = calcTotalSleep(log);

  // Get last 7 days for date picker
  const recentDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split("T")[0];
  });

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div style={{display:"flex", alignItems:"center", gap:"10px"}}>
          <img src="data:image/png;base64,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" alt="Rested Rascals" style={{height:"40px", width:"40px", objectFit:"contain"}} />
          <div>
            <p style={{ ...S.headerTitle, fontSize: "16px" }}>Rested Rascals</p>
            <p style={{ margin: 0, fontSize: "13px", opacity: 0.6 }}>{client.child_name || client.name}</p>
          </div>
        </div>
        <button style={{ ...S.btnOutline, color: "#f8f5f0", borderColor: "#f8f5f0" }} onClick={onLogout}>
          Log out
        </button>
      </div>

      <div style={S.container}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", background: "#fff", padding: "6px", borderRadius: "10px", border: "1px solid #e8e3dc" }}>
          {[["diary", "Sleep Diary"], ["intake", "Questionnaire"]].map(([id, label]) => (
            <button key={id} style={{ ...S.tab(tab === id), flex: 1 }} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "diary" && (
          <>
            {/* Date Selector */}
            <div style={{ ...S.card, padding: "16px 20px" }}>
              <p style={S.sectionTitle}>Select date</p>
              <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
                {recentDates.map((d) => {
                  const hasData = !!logs[d]?.wake_time || !!logs[d]?.bedtime;
                  const isSelected = d === selectedDate;
                  const dt = new Date(d + "T00:00:00");
                  const dayName = dt.toLocaleDateString("en-AU", { weekday: "short" });
                  const dayNum = dt.getDate();
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      style={{
                        minWidth: "52px",
                        padding: "8px 4px",
                        border: isSelected ? "2px solid #2d2a26" : "1px solid #ddd8d0",
                        borderRadius: "8px",
                        background: isSelected ? "#2d2a26" : hasData ? "#f0ede7" : "#fff",
                        color: isSelected ? "#f8f5f0" : "#2d2a26",
                        cursor: "pointer",
                        textAlign: "center",
                        fontSize: "12px",
                      }}
                    >
                      <div style={{ opacity: 0.7 }}>{dayName}</div>
                      <div style={{ fontWeight: "600", fontSize: "16px" }}>{dayNum}</div>
                      {hasData && !isSelected && <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#4caf50", margin: "3px auto 0" }} />}
                    </button>
                  );
                })}
              </div>
              <input
                type="date"
                style={{ ...S.input, marginTop: "12px" }}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            {/* Stats */}
            <div style={{ ...S.grid2, marginBottom: "16px" }}>
              <div style={S.statCard}>
                <p style={S.statVal}>{minutesToDuration(totalSleep)}</p>
                <p style={S.statLabel}>Total sleep (24h)</p>
              </div>
              <div style={S.statCard}>
                <p style={S.statVal}>{(log.naps || []).length}</p>
                <p style={S.statLabel}>Naps today</p>
              </div>
              <div style={S.statCard}>
                <p style={S.statVal}>
                  {log.wake_time && log.naps?.[0]?.start
                    ? minutesToDuration(calcWakeWindow(log.wake_time, log.naps[0].start))
                    : "--"}
                </p>
                <p style={S.statLabel}>First wake window</p>
              </div>
            </div>

            {/* Wake & Bed */}
            <div style={S.card}>
              <p style={S.sectionTitle}>Times</p>
              <div style={S.grid2}>
                <div>
                  <label style={S.label}>Morning wake time</label>
                  <input
                    type="time"
                    style={S.input}
                    value={log.wake_time || ""}
                    onChange={(e) => updateLog(selectedDate, "wake_time", e.target.value)}
                  />
                </div>
                <div>
                  <label style={S.label}>Bedtime</label>
                  <input
                    type="time"
                    style={S.input}
                    value={log.bedtime || ""}
                    onChange={(e) => updateLog(selectedDate, "bedtime", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Naps */}
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <p style={{ ...S.sectionTitle, margin: 0 }}>Naps</p>
                <button
                  style={S.btnSmall}
                  onClick={() => {
                    const naps = [...(log.naps || []), { start: "", end: "", notes: "" }];
                    updateLog(selectedDate, "naps", naps);
                  }}
                >
                  + Add nap
                </button>
              </div>

              {(log.naps || []).length === 0 && (
                <p style={{ color: "#a09890", fontSize: "14px", textAlign: "center", padding: "20px 0" }}>
                  No naps logged yet
                </p>
              )}

              {(log.naps || []).map((nap, i) => {
                const prevEnd = i === 0 ? log.wake_time : log.naps[i - 1]?.end;
                const ww = prevEnd && nap.start ? calcWakeWindow(prevEnd, nap.start) : null;
                const dur = calcNapDuration(nap);

                return (
                  <div key={i} style={{ borderTop: i > 0 ? "1px solid #ede9e3" : "none", paddingTop: i > 0 ? "16px" : "0", marginTop: i > 0 ? "16px" : "0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontWeight: "500", fontSize: "14px" }}>Nap {i + 1}</span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        {dur && <span style={{ ...S.badge("green"), fontSize: "11px" }}>{minutesToDuration(dur)}</span>}
                        {ww && <span style={{ fontSize: "11px", color: "#a09890" }}>WW: {minutesToDuration(ww)}</span>}
                        <button
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#c0392b", fontSize: "16px" }}
                          onClick={() => {
                            const naps = log.naps.filter((_, j) => j !== i);
                            updateLog(selectedDate, "naps", naps);
                          }}
                        >×</button>
                      </div>
                    </div>
                    <div style={{ ...S.grid2, marginBottom: "8px" }}>
                      <div>
                        <label style={S.label}>Start</label>
                        <input
                          type="time"
                          style={S.input}
                          value={nap.start || ""}
                          onChange={(e) => {
                            const naps = log.naps.map((n, j) => j === i ? { ...n, start: e.target.value } : n);
                            updateLog(selectedDate, "naps", naps);
                          }}
                        />
                      </div>
                      <div>
                        <label style={S.label}>End</label>
                        <input
                          type="time"
                          style={S.input}
                          value={nap.end || ""}
                          onChange={(e) => {
                            const naps = log.naps.map((n, j) => j === i ? { ...n, end: e.target.value } : n);
                            updateLog(selectedDate, "naps", naps);
                          }}
                        />
                      </div>
                    </div>
                    <input
                      style={S.input}
                      placeholder="Notes about this nap (optional)"
                      value={nap.notes || ""}
                      onChange={(e) => {
                        const naps = log.naps.map((n, j) => j === i ? { ...n, notes: e.target.value } : n);
                        updateLog(selectedDate, "naps", naps);
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Night Notes */}
            <div style={S.card}>
              <label style={{ ...S.sectionTitle, display: "block" }}>Night notes</label>
              <textarea
                style={S.textarea}
                placeholder="Overnight wakings, feeds, anything notable..."
                value={log.night_notes || ""}
                onChange={(e) => updateLog(selectedDate, "night_notes", e.target.value)}
              />
            </div>

            <p style={{ textAlign: "right", fontSize: "12px", color: "#a09890", marginTop: "-8px" }}>
              {saving ? "Saving..." : "Auto-saved ✓"}
            </p>
          </>
        )}

        {tab === "intake" && (
          <div>
            {intakeSaved && (
              <div style={{ ...S.badge("green"), marginBottom: "16px", display: "block", padding: "10px 16px" }}>
                ✓ Questionnaire submitted — thank you!
              </div>
            )}
            {INTAKE_QUESTIONS.map((section) => (
              <div key={section.section} style={S.card}>
                <p style={S.sectionTitle}>{section.section}</p>
                {section.questions.map((q) => (
                  <div key={q.id} style={{ marginBottom: "16px" }}>
                    <label style={S.label}>{q.label}</label>
                    {q.type === "textarea" ? (
                      <textarea
                        style={S.textarea}
                        placeholder={q.placeholder}
                        value={intakeResponses[q.id] || ""}
                        onChange={(e) => setIntakeResponses((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      />
                    ) : (
                      <input
                        style={S.input}
                        placeholder={q.placeholder}
                        value={intakeResponses[q.id] || ""}
                        onChange={(e) => setIntakeResponses((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
            <button style={{ ...S.btn, width: "100%", padding: "14px" }} onClick={saveIntake} disabled={saving}>
              {saving ? "Saving..." : "Submit Questionnaire"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// COACH APP
// ============================================================
function CoachApp({ onLogout }) {
  const [view, setView] = useState("dashboard"); // dashboard | client | settings
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientTab, setClientTab] = useState("overview");
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClients();
    loadSettings();
  }, []);

  async function loadClients() {
    try {
      const res = await db.select("clients", "order=name.asc&select=*");
      setClients(res || []);
    } catch (e) {}
    setLoading(false);
  }

  async function loadSettings() {
    try {
      const res = await db.select("app_settings", "id=eq.1&select=*");
      if (res && res.length > 0) setSettings(res[0]);
    } catch (e) {}
  }

  function openClient(client) {
    setSelectedClient(client);
    setClientTab("overview");
    setView("client");
  }

  if (loading) return <div style={{ padding: "60px", textAlign: "center", color: "#a09890" }}>Loading...</div>;

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div>
          <div style={{display:"flex", alignItems:"center", gap:"10px"}}>
            <img src="data:image/png;base64,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" alt="Rested Rascals" style={{height:"40px", width:"40px", objectFit:"contain"}} />
            <p style={{ ...S.headerTitle, fontSize: "16px" }}>
              {view === "client" && selectedClient
                ? `← ${selectedClient.name}`
                : "Rested Rascals"}
            </p>
          </div>
          {view === "client" && <p style={{ margin: 0, fontSize: "12px", opacity: 0.5 }}>Coach dashboard</p>}
        </div>
        <div style={S.row}>
          {view === "client" && (
            <button style={{ ...S.btnOutline, color: "#f8f5f0", borderColor: "#f8f5f0" }} onClick={() => { setView("dashboard"); loadClients(); }}>
              All clients
            </button>
          )}
          <button style={{ ...S.btnOutline, color: "#f8f5f0", borderColor: "#f8f5f0" }} onClick={() => setView("settings")}>
            ⚙
          </button>
          <button style={{ ...S.btnOutline, color: "#f8f5f0", borderColor: "#f8f5f0" }} onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      <div style={S.container}>
        {view === "dashboard" && (
          <Dashboard
            clients={clients}
            onOpenClient={openClient}
            onReload={loadClients}
            settings={settings}
          />
        )}
        {view === "client" && selectedClient && (
          <ClientDetail
            client={selectedClient}
            tab={clientTab}
            setTab={setClientTab}
            onReload={() => loadClients()}
            settings={settings}
          />
        )}
        {view === "settings" && (
          <Settings
            settings={settings}
            onSave={async (updated) => {
              await db.update("app_settings", "id=eq.1", updated);
              await loadSettings();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard({ clients, onOpenClient, onReload, settings }) {
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("active");
  const [newClient, setNewClient] = useState({
    name: "", child_name: "", child_dob: "", access_code: "", status: "active",
    support_start_date: today(),
    support_length_days: settings?.default_support_days || 28,
    contact_reminder_days: settings?.default_reminder_days || 7,
  });
  const [saving, setSaving] = useState(false);

  const filtered = clients.filter((c) => filter === "all" || c.status === filter);
  const active = clients.filter((c) => c.status === "active");

  async function addClient() {
    if (!newClient.name || !newClient.access_code) return;
    setSaving(true);
    try {
      await db.insert("clients", newClient);
      await onReload();
      setShowAdd(false);
      setNewClient({ name: "", child_name: "", child_dob: "", access_code: "", status: "active", support_start_date: today(), support_length_days: settings?.default_support_days || 28, contact_reminder_days: settings?.default_reminder_days || 7 });
    } catch (e) { alert("Error: check access code is unique."); }
    setSaving(false);
  }

  return (
    <>
      <div style={{ ...S.row, justifyContent: "space-between", marginBottom: "20px" }}>
        <h2 style={{ ...S.h2, margin: 0 }}>Clients</h2>
        <button style={S.btn} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ New client"}
        </button>
      </div>

      {/* Summary */}
      <div style={{ ...S.grid2, marginBottom: "20px" }}>
        <div style={S.statCard}>
          <p style={S.statVal}>{active.length}</p>
          <p style={S.statLabel}>Active</p>
        </div>
        <div style={S.statCard}>
          <p style={S.statVal}>{active.filter((c) => daysRemaining(c.support_start_date, c.support_length_days) <= 5).length}</p>
          <p style={S.statLabel}>Ending soon</p>
        </div>
        <div style={S.statCard}>
          <p style={S.statVal}>{clients.filter((c) => c.status === "closed").length}</p>
          <p style={S.statLabel}>Closed</p>
        </div>
      </div>

      {/* Add Client Form */}
      {showAdd && (
        <div style={{ ...S.card, background: "#f8f5f0", border: "1px solid #ddd8d0" }}>
          <p style={S.sectionTitle}>New client</p>
          <div style={S.grid2}>
            <div>
              <label style={S.label}>Parent name *</label>
              <input style={S.input} value={newClient.name} onChange={(e) => setNewClient((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Child's name</label>
              <input style={S.input} value={newClient.child_name} onChange={(e) => setNewClient((p) => ({ ...p, child_name: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Child's DOB</label>
              <input type="date" style={S.input} value={newClient.child_dob} onChange={(e) => setNewClient((p) => ({ ...p, child_dob: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Access code *</label>
              <input style={{ ...S.input, textTransform: "uppercase", letterSpacing: "0.1em" }} value={newClient.access_code} onChange={(e) => setNewClient((p) => ({ ...p, access_code: e.target.value.toUpperCase() }))} placeholder="e.g. MOON42" />
            </div>
            <div>
              <label style={S.label}>Support start</label>
              <input type="date" style={S.input} value={newClient.support_start_date} onChange={(e) => setNewClient((p) => ({ ...p, support_start_date: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Support length (days)</label>
              <input type="number" style={S.input} value={newClient.support_length_days} onChange={(e) => setNewClient((p) => ({ ...p, support_length_days: Number(e.target.value) }))} />
            </div>
          </div>
          <button style={{ ...S.btn, marginTop: "16px" }} onClick={addClient} disabled={saving}>
            {saving ? "Adding..." : "Add client"}
          </button>
        </div>
      )}

      {/* Filter */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
        {["active", "closed", "all"].map((f) => (
          <button key={f} style={{ ...S.tab(filter === f), fontSize: "13px", padding: "6px 14px" }} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Client List */}
      {filtered.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: "#a09890", padding: "40px" }}>
          No {filter} clients yet.
        </div>
      )}

      {filtered.map((c) => {
        const daysLeft = daysRemaining(c.support_start_date, c.support_length_days);
        const progress = c.support_start_date ? Math.min(100, (daysSince(c.support_start_date) / c.support_length_days) * 100) : 0;
        const daysSinceContact = c.support_start_date ? daysSince(c.support_start_date) % c.contact_reminder_days : 0;
        const contactDue = daysSinceContact >= c.contact_reminder_days - 1;

        return (
          <div
            key={c.id}
            style={{ ...S.card, cursor: "pointer", transition: "box-shadow 0.15s" }}
            onClick={() => onOpenClient(c)}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div>
                <p style={{ margin: "0 0 2px", fontWeight: "500", fontSize: "16px" }}>{c.name}</p>
                <p style={{ margin: 0, fontSize: "13px", color: "#9a9590" }}>
                  {c.child_name && `Child: ${c.child_name}`}
                  {c.child_dob && ` · DOB: ${formatDate(c.child_dob)}`}
                </p>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span style={S.badge(c.status === "active" ? "green" : "")}>
                  {c.status}
                </span>
                {contactDue && c.status === "active" && (
                  <span style={S.badge("amber")}>Contact due</span>
                )}
                {daysLeft !== null && daysLeft <= 5 && daysLeft > 0 && c.status === "active" && (
                  <span style={S.badge("red")}>{daysLeft}d left</span>
                )}
              </div>
            </div>

            {c.status === "active" && c.support_start_date && (
              <>
                <div style={S.progressBar(progress)}>
                  <div style={S.progressFill(progress)} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "12px", color: "#a09890" }}>
                  <span>Day {daysSince(c.support_start_date)} of {c.support_length_days}</span>
                  <span>{daysLeft > 0 ? `${daysLeft} days remaining` : "Support period ended"}</span>
                </div>
              </>
            )}

            <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#b0a89e", fontFamily: "monospace", letterSpacing: "0.1em" }}>
              Code: {c.access_code}
            </p>
          </div>
        );
      })}
    </>
  );
}

// ============================================================
// CLIENT DETAIL
// ============================================================
function ClientDetail({ client, tab, setTab, onReload, settings }) {
  const [intake, setIntake] = useState(null);
  const [logs, setLogs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editClient, setEditClient] = useState({ ...client });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll();
  }, [client.id]);

  async function loadAll() {
    try {
      const [intakeRes, logsRes, notesRes] = await Promise.all([
        db.select("intake_responses", `client_id=eq.${client.id}&select=*`),
        db.select("sleep_logs", `client_id=eq.${client.id}&order=log_date.desc&limit=14&select=*`),
        db.select("coach_notes", `client_id=eq.${client.id}&order=created_at.desc&select=*`),
      ]);
      setIntake(intakeRes?.[0] || null);
      setLogs(logsRes || []);
      setNotes(notesRes || []);
    } catch (e) {}
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      await db.insert("coach_notes", { client_id: client.id, note: newNote.trim() });
      setNewNote("");
      await loadAll();
    } catch (e) {}
    setSaving(false);
  }

  async function deleteNote(id) {
    await db.delete("coach_notes", `id=eq.${id}`);
    await loadAll();
  }

  async function saveClientEdits() {
    setSaving(true);
    try {
      await db.update("clients", `id=eq.${client.id}`, editClient);
      await onReload();
      setEditMode(false);
    } catch (e) {}
    setSaving(false);
  }

  const daysLeft = daysRemaining(client.support_start_date, client.support_length_days);
  const progress = client.support_start_date
    ? Math.min(100, (daysSince(client.support_start_date) / client.support_length_days) * 100)
    : 0;

  return (
    <>
      {/* Support Progress */}
      <div style={{ ...S.card, marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h2 style={{ ...S.h2, margin: "0 0 4px" }}>{client.name}</h2>
            {client.child_name && <p style={{ margin: 0, fontSize: "14px", color: "#9a9590" }}>Child: {client.child_name}</p>}
          </div>
          <span style={S.badge(client.status === "active" ? "green" : "")}>{client.status}</span>
        </div>

        {client.support_start_date && (
          <>
            <div style={S.progressBar(progress)}>
              <div style={S.progressFill(progress)} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "13px", color: "#a09890" }}>
              <span>Day {daysSince(client.support_start_date)} / {client.support_length_days}</span>
              <span style={{ color: daysLeft <= 3 ? "#e74c3c" : daysLeft <= 7 ? "#f39c12" : "inherit" }}>
                {daysLeft > 0 ? `${daysLeft} days left` : "Support period ended"}
              </span>
            </div>
            {daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
              <div style={{ marginTop: "10px", padding: "8px 12px", background: "#fff8e1", borderRadius: "8px", fontSize: "13px", color: "#b45309" }}>
                ⚠️ Support period ending in {daysLeft} day{daysLeft !== 1 ? "s" : ""}. Consider reaching out.
              </div>
            )}
          </>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", background: "#fff", padding: "6px", borderRadius: "10px", border: "1px solid #e8e3dc", overflowX: "auto" }}>
        {[["overview", "Overview"], ["diary", "Sleep Diary"], ["intake", "Intake"], ["notes", "Notes"]].map(([id, label]) => (
          <button key={id} style={{ ...S.tab(tab === id), whiteSpace: "nowrap", flex: 1 }} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <>
          {editMode ? (
            <div style={S.card}>
              <p style={S.sectionTitle}>Edit client</p>
              <div style={S.grid2}>
                {[
                  ["name", "Parent name", "text"],
                  ["child_name", "Child name", "text"],
                  ["child_dob", "Child DOB", "date"],
                  ["access_code", "Access code", "text"],
                  ["support_start_date", "Support start", "date"],
                  ["support_length_days", "Support length (days)", "number"],
                  ["contact_reminder_days", "Reminder every N days", "number"],
                ].map(([field, label, type]) => (
                  <div key={field}>
                    <label style={S.label}>{label}</label>
                    <input
                      type={type}
                      style={S.input}
                      value={editClient[field] || ""}
                      onChange={(e) => setEditClient((p) => ({ ...p, [field]: type === "number" ? Number(e.target.value) : e.target.value }))}
                    />
                  </div>
                ))}
                <div>
                  <label style={S.label}>Status</label>
                  <select style={S.input} value={editClient.status} onChange={(e) => setEditClient((p) => ({ ...p, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>
              <div style={{ ...S.row, marginTop: "16px" }}>
                <button style={S.btn} onClick={saveClientEdits} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                <button style={S.btnOutline} onClick={() => setEditMode(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <p style={{ ...S.sectionTitle, margin: 0 }}>Client details</p>
                <button style={S.btnSmall} onClick={() => setEditMode(true)}>Edit</button>
              </div>
              <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    ["Access code", <span style={{ fontFamily: "monospace", letterSpacing: "0.1em" }}>{client.access_code}</span>],
                    ["Child DOB", formatDate(client.child_dob)],
                    ["Support started", formatDate(client.support_start_date)],
                    ["Support length", `${client.support_length_days} days`],
                    ["Contact reminder", `Every ${client.contact_reminder_days} days`],
                    ["Intake completed", intake?.completed_at ? "✓ " + new Date(intake.completed_at).toLocaleDateString() : "Not yet"],
                  ].map(([label, val]) => (
                    <tr key={label} style={{ borderBottom: "1px solid #f0ede7" }}>
                      <td style={{ padding: "10px 0", color: "#a09890", width: "45%" }}>{label}</td>
                      <td style={{ padding: "10px 0", fontWeight: "400" }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Last 3 diary entries */}
          <div style={S.card}>
            <p style={S.sectionTitle}>Recent sleep</p>
            {logs.slice(0, 3).length === 0 && <p style={{ color: "#a09890", fontSize: "14px" }}>No diary entries yet.</p>}
            {logs.slice(0, 3).map((log) => {
              const total = calcTotalSleep(log);
              return (
                <div key={log.id} style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid #f0ede7" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: "500", fontSize: "14px" }}>{formatDate(log.log_date)}</span>
                    <span style={S.badge(total > 840 ? "green" : total > 600 ? "amber" : "red")}>
                      {minutesToDuration(total)} total
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#9a9590" }}>
                    Wake: {log.wake_time || "--"} · Bed: {log.bedtime || "--"} · {(log.naps || []).length} nap{(log.naps || []).length !== 1 ? "s" : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Diary Tab */}
      {tab === "diary" && (
        <div style={S.card}>
          <p style={S.sectionTitle}>Sleep diary — last 14 entries</p>
          {logs.length === 0 && <p style={{ color: "#a09890", fontSize: "14px" }}>No diary entries yet.</p>}
          {logs.map((log) => {
            const total = calcTotalSleep(log);
            return (
              <div key={log.id} style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid #f0ede7" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontWeight: "500" }}>{formatDate(log.log_date)}</span>
                  <span style={S.badge(total > 840 ? "green" : total > 600 ? "amber" : "red")}>
                    {minutesToDuration(total)}
                  </span>
                </div>
                <div style={{ ...S.grid2, fontSize: "13px" }}>
                  <div style={{ color: "#6b6560" }}>
                    <span style={{ color: "#a09890" }}>Wake </span>{log.wake_time || "--"}
                    <span style={{ color: "#a09890", marginLeft: "12px" }}>Bed </span>{log.bedtime || "--"}
                  </div>
                </div>
                {(log.naps || []).map((nap, i) => {
                  const dur = calcNapDuration(nap);
                  const prevEnd = i === 0 ? log.wake_time : log.naps[i - 1]?.end;
                  const ww = prevEnd && nap.start ? calcWakeWindow(prevEnd, nap.start) : null;
                  return (
                    <div key={i} style={{ fontSize: "13px", color: "#6b6560", marginTop: "4px" }}>
                      <span style={{ color: "#a09890" }}>Nap {i + 1}: </span>
                      {nap.start || "--"} – {nap.end || "--"}
                      {dur && <span style={{ marginLeft: "8px", color: "#4caf50" }}>{minutesToDuration(dur)}</span>}
                      {ww && <span style={{ marginLeft: "8px", color: "#a09890" }}>WW: {minutesToDuration(ww)}</span>}
                      {nap.notes && <span style={{ marginLeft: "8px", fontStyle: "italic", color: "#b0a89e" }}>{nap.notes}</span>}
                    </div>
                  );
                })}
                {log.night_notes && (
                  <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#9a9590", fontStyle: "italic" }}>
                    "{log.night_notes}"
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Intake Tab */}
      {tab === "intake" && (
        <div>
          {!intake?.completed_at && (
            <div style={{ ...S.badge("amber"), display: "block", padding: "12px 16px", marginBottom: "16px", fontSize: "14px" }}>
              Questionnaire not yet submitted by client.
            </div>
          )}
          {INTAKE_QUESTIONS.map((section) => (
            <div key={section.section} style={S.card}>
              <p style={S.sectionTitle}>{section.section}</p>
              {section.questions.map((q) => (
                <div key={q.id} style={{ marginBottom: "16px" }}>
                  <p style={{ ...S.label, fontWeight: "500", color: "#6b6560" }}>{q.label}</p>
                  <p style={{ margin: "0", fontSize: "14px", whiteSpace: "pre-wrap" }}>
                    {intake?.responses?.[q.id] || <span style={{ color: "#c0b8b0", fontStyle: "italic" }}>No answer</span>}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Notes Tab */}
      {tab === "notes" && (
        <div>
          <div style={S.card}>
            <p style={S.sectionTitle}>Add note</p>
            <textarea
              style={{ ...S.textarea, minHeight: "100px" }}
              placeholder="Private coaching notes..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <button style={{ ...S.btn, marginTop: "10px" }} onClick={addNote} disabled={saving}>
              {saving ? "Saving..." : "Add note"}
            </button>
          </div>

          {notes.length === 0 && (
            <div style={{ ...S.card, textAlign: "center", color: "#a09890" }}>No notes yet.</div>
          )}

          {notes.map((n) => (
            <div key={n.id} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "#a09890" }}>
                  {new Date(n.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <button
                  style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}
                  onClick={() => deleteNote(n.id)}
                >×</button>
              </div>
              <p style={{ margin: 0, fontSize: "14px", whiteSpace: "pre-wrap" }}>{n.note}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ============================================================
// SETTINGS
// ============================================================
function Settings({ settings, onSave }) {
  const [form, setForm] = useState({
    coach_password_hash: "",
    confirm_password: "",
    default_support_days: settings?.default_support_days || 28,
    default_reminder_days: settings?.default_reminder_days || 7,
  });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setMsg("");
    const update = {
      default_support_days: form.default_support_days,
      default_reminder_days: form.default_reminder_days,
    };
    if (form.coach_password_hash) {
      if (form.coach_password_hash !== form.confirm_password) {
        setMsg("Passwords don't match.");
        setSaving(false);
        return;
      }
      update.coach_password_hash = form.coach_password_hash;
    }
    await onSave(update);
    setMsg("Settings saved!");
    setSaving(false);
    setForm((p) => ({ ...p, coach_password_hash: "", confirm_password: "" }));
  }

  return (
    <>
      <h2 style={S.h2}>Settings</h2>
      <div style={S.card}>
        <p style={S.sectionTitle}>Default support settings</p>
        <div style={S.grid2}>
          <div>
            <label style={S.label}>Default support length (days)</label>
            <input type="number" style={S.input} value={form.default_support_days} onChange={(e) => setForm((p) => ({ ...p, default_support_days: Number(e.target.value) }))} />
          </div>
          <div>
            <label style={S.label}>Contact reminder every N days</label>
            <input type="number" style={S.input} value={form.default_reminder_days} onChange={(e) => setForm((p) => ({ ...p, default_reminder_days: Number(e.target.value) }))} />
          </div>
        </div>
      </div>

      <div style={S.card}>
        <p style={S.sectionTitle}>Change password</p>
        <p style={{ fontSize: "13px", color: "#a09890", marginBottom: "12px" }}>Leave blank to keep your current password.</p>
        <div style={S.grid2}>
          <div>
            <label style={S.label}>New password</label>
            <input type="password" style={S.input} value={form.coach_password_hash} onChange={(e) => setForm((p) => ({ ...p, coach_password_hash: e.target.value }))} />
          </div>
          <div>
            <label style={S.label}>Confirm password</label>
            <input type="password" style={S.input} value={form.confirm_password} onChange={(e) => setForm((p) => ({ ...p, confirm_password: e.target.value }))} />
          </div>
        </div>
      </div>

      {msg && (
        <div style={{ ...S.badge(msg.includes("!") ? "green" : "red"), display: "block", padding: "12px 16px", marginBottom: "12px", fontSize: "14px" }}>
          {msg}
        </div>
      )}

      <button style={{ ...S.btn, padding: "12px 32px" }} onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </button>
    </>
  );
}

// ============================================================
// ROOT
// ============================================================
export default function App() {
  const [mode, setMode] = useState("choose"); // choose | client | coach
  const [clientUser, setClientUser] = useState(null);
  const [coachAuthed, setCoachAuthed] = useState(false);

  // Restore sessions
  useEffect(() => {
    const clientId = sessionStorage.getItem("client_id");
    const coachAuth = sessionStorage.getItem("coach_authed");
    if (clientId) {
      db.select("clients", `id=eq.${clientId}&select=*`).then((res) => {
        if (res && res.length > 0) {
          setClientUser(res[0]);
          setMode("client");
        }
      });
    } else if (coachAuth) {
      setCoachAuthed(true);
      setMode("coach");
    }
  }, []);

  if (mode === "client") {
    if (!clientUser) return <ClientLogin onLogin={(c) => { setClientUser(c); setMode("client"); }} />;
    return <ClientApp client={clientUser} onLogout={() => { sessionStorage.removeItem("client_id"); setMode("choose"); setClientUser(null); }} />;
  }

  if (mode === "coach") {
    if (!coachAuthed) {
      return (
        <div style={S.app}>
          <div style={S.header}>
            <p style={S.headerTitle}>Sleep Consultant</p>
            <button style={{ ...S.btnOutline, color: "#f8f5f0", borderColor: "#f8f5f0" }} onClick={() => setMode("choose")}>Back</button>
          </div>
          <CoachLogin onLogin={() => { sessionStorage.setItem("coach_authed", "1"); setCoachAuthed(true); }} />
        </div>
      );
    }
    return <CoachApp onLogout={() => { sessionStorage.removeItem("coach_authed"); setCoachAuthed(false); setMode("choose"); }} />;
  }

  // Landing
  return (
    <div style={S.app}>
      <div style={{ ...S.header, justifyContent: "center" }}>
        <p style={S.headerTitle}>Rested Rascals</p>
      </div>
      <div style={{ maxWidth: "400px", margin: "80px auto", padding: "0 16px" }}>
        <div style={{ ...S.card, textAlign: "center" }}>
          <img src="" alt="Rested Rascals" style={{ height:"90px", width:"90px", objectFit:"contain", marginBottom:"12px" }} />
          <img src="data:image/png;base64,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" alt="Rested Rascals" style={{ height:"90px", objectFit:"contain", marginBottom:"12px" }} />
          <h1 style={{ fontSize: "24px", fontWeight: "400", marginBottom: "8px" }}>Welcome</h1>
          <p style={{ color: "#9a9590", marginBottom: "32px" }}>How are you logging in today?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button style={{ ...S.btn, padding: "14px", fontSize: "16px" }} onClick={() => setMode("client")}>
              I'm a client
            </button>
            <button style={{ ...S.btnOutline, padding: "13px", fontSize: "16px" }} onClick={() => setMode("coach")}>
              I'm the consultant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
