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

function calcTotalSleep(log, prevLog) {
  let total = 0;
  (log.naps || []).forEach((n) => {
    const d = calcNapDuration(n);
    if (d) total += d;
  });
  // Overnight sleep = previous night's bedtime -> this morning's wake time.
  // Falls back to same-day bedtime if no previous-day entry exists (e.g. first logged day).
  const bedtimeForNight = prevLog?.bedtime || log.bedtime;
  if (log.wake_time && bedtimeForNight) {
    const w = timeToMinutes(log.wake_time);
    const b = timeToMinutes(bedtimeForNight);
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

function prevDateStr(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
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
    overflowX: "hidden",
    width: "100%",
    maxWidth: "100vw",
    position: "relative",
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
  container: { maxWidth: "100%", width: "100%", margin: "0 auto", padding: "16px 14px", boxSizing: "border-box", overflowX: "hidden" },
  card: {
    background: "#fff",
    borderRadius: "12px",
    border: "1px solid #e8e3dc",
    padding: "20px 16px",
    marginBottom: "16px",
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px",
    width: "100%",
    boxSizing: "border-box",
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
  const prevLog = getLog(prevDateStr(selectedDate));
  const totalSleep = calcTotalSleep(log, prevLog);

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
            <button key={id} style={{ ...S.tab(tab === id), flex: 1, fontSize: "13px", padding: "10px 8px" }} onClick={() => setTab(id)}>
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
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
                <div style={{ width: "100%" }}>
                  <label style={S.label}>Wake time <span style={{ color: "#c0b8b0" }}>— this morning</span></label>
                  <input
                    type="time"
                    style={{ ...S.input, width: "100%", boxSizing: "border-box" }}
                    value={log.wake_time || ""}
                    onChange={(e) => updateLog(selectedDate, "wake_time", e.target.value)}
                  />
                </div>
                <div style={{ width: "100%" }}>
                  <label style={S.label}>Bedtime <span style={{ color: "#c0b8b0" }}>— tonight</span></label>
                  <input
                    type="time"
                    style={{ ...S.input, width: "100%", boxSizing: "border-box" }}
                    value={log.bedtime || ""}
                    onChange={(e) => updateLog(selectedDate, "bedtime", e.target.value)}
                  />
                </div>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#a09890" }}>
                "Total sleep" below uses last night's bedtime ({formatDate(prevDateStr(selectedDate))}) together with the wake time above.
              </p>
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
            <button
              style={{ ...S.btn, width: "100%", padding: "16px", fontSize: "15px", marginBottom: "12px" }}
              onClick={saveIntake}
              disabled={saving}
            >
              {saving ? "Saving..." : "Submit Questionnaire"}
            </button>
            {intakeSaved && (
              <div style={{
                background: "#e8f5e9",
                border: "1px solid #a5d6a7",
                borderRadius: "12px",
                padding: "16px 20px",
                textAlign: "center",
                color: "#2e7d32",
                fontSize: "15px",
                marginBottom: "24px",
              }}>
                ✓ Questionnaire submitted — thank you! Your consultant will be in touch soon.
              </div>
            )}
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
        db.select("sleep_logs", `client_id=eq.${client.id}&order=log_date.desc&limit=15&select=*`),
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

  // Build a lookup so each log can find the previous day's log for overnight sleep math
  const logsByDate = {};
  logs.forEach((l) => (logsByDate[l.log_date] = l));
  function getPrevLog(dateStr) {
    return logsByDate[prevDateStr(dateStr)];
  }

  // Only show the most recent 14 in the UI; the 15th (oldest) is fetched purely
  // to supply prevLog for the 14th-most-recent entry's overnight calculation.
  const visibleLogs = logs.slice(0, 14);

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
            {visibleLogs.slice(0, 3).length === 0 && <p style={{ color: "#a09890", fontSize: "14px" }}>No diary entries yet.</p>}
            {visibleLogs.slice(0, 3).map((log) => {
              const total = calcTotalSleep(log, getPrevLog(log.log_date));
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
          {visibleLogs.length === 0 && <p style={{ color: "#a09890", fontSize: "14px" }}>No diary entries yet.</p>}
          {visibleLogs.map((log) => {
            const total = calcTotalSleep(log, getPrevLog(log.log_date));
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
            <p style={S.headerTitle}>Rested Rascals</p>
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
