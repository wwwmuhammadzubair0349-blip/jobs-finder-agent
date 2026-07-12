import React from "react";
import { api } from "./api";
import { cleanText } from "./util";

// In-app AI mock interview for a specific job. Same coach as the Telegram bot,
// plan-gated (a credit is consumed when the interview starts).
export default function InterviewChat({ job, onClose, onUpgrade }) {
  const [stage, setStage] = React.useState("confirm"); // confirm | chatting | ended | wall
  const [msgs, setMsgs] = React.useState([]);          // {role, content}
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [wall, setWall] = React.useState("");
  const sessionRef = React.useRef(null); // signed token proving the start credit was paid
  const threadRef = React.useRef(null);
  const jobMeta = { title: cleanText(job.title), company: cleanText(job.company), description: job.description || "" };

  React.useEffect(() => { const t = threadRef.current; if (t) t.scrollTop = t.scrollHeight; }, [msgs, busy]);

  async function call(payload) {
    return api.interviewChat({ job: jobMeta, ...payload });
  }

  async function startInterview() {
    setBusy(true);
    try {
      const r = await call({ messages: [], start: true });
      if (r?.error === "limit") { setWall(r.message || "Interview limit reached — upgrade for more."); setStage("wall"); return; }
      if (r?.ok) { sessionRef.current = r.session || null; setMsgs([{ role: "assistant", content: r.reply }]); setStage("chatting"); }
      else setWall("The coach is busy — please try again.");
    } catch (e) {
      if (e.message === "limit") { setStage("wall"); setWall("Interview limit reached — upgrade for more."); }
      else setWall("Couldn't start — try again.");
      if (!stage || stage === "confirm") setStage((s) => (wall ? "wall" : s));
    } finally { setBusy(false); }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || stage !== "chatting") return;
    const next = [...msgs, { role: "user", content: text }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await call({ messages: next, start: false, session: sessionRef.current });
      if (r?.ok) {
        setMsgs([...next, { role: "assistant", content: r.reply }]);
        if (r.done) setStage("ended");
      } else if (r?.error === "session") {
        setWall(r.message || "Your interview session expired — start a new one."); setStage("wall");
      } else {
        setMsgs([...next, { role: "assistant", content: "⚠️ The coach hit a snag — try sending that again." }]);
      }
    } finally { setBusy(false); }
  }

  function onKey(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal iv-chat fade" onClick={(e) => e.stopPropagation()}>
        <div className="iv-head">
          <span className="iv-ico">🎤</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="iv-title">Mock interview</div>
            <div className="iv-sub">{jobMeta.title}{jobMeta.company ? ` · ${jobMeta.company}` : ""}</div>
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {stage === "confirm" && (
          <div className="iv-confirm">
            <div className="iv-confirm-emoji">🧠</div>
            <div className="iv-confirm-title">Ready to practise for this role?</div>
            <p className="iv-confirm-sub">I'll run a realistic mock interview tailored to <b>{jobMeta.title}</b> and coach you after every answer. Uses one interview credit.</p>
            <div className="iv-confirm-actions">
              <button className="btn" onClick={onClose}>Not now</button>
              <button className="btn primary" onClick={startInterview} disabled={busy}>{busy ? "Starting…" : "Start interview →"}</button>
            </div>
          </div>
        )}

        {(stage === "chatting" || stage === "ended") && (
          <>
            <div className="iv-thread" ref={threadRef}>
              {msgs.map((m, i) => (
                <div key={i} className={`iv-msg ${m.role}`}>
                  {m.role === "assistant" && <span className="iv-avatar">🎤</span>}
                  <div className="iv-bubble">{m.content}</div>
                </div>
              ))}
              {busy && <div className="iv-msg assistant"><span className="iv-avatar">🎤</span><div className="iv-bubble iv-typing"><span></span><span></span><span></span></div></div>}
            </div>
            {stage === "ended"
              ? <div className="iv-ended">🏁 Interview complete — great work! <button className="btn ghost sm" onClick={onClose}>Close</button></div>
              : (
                <div className="iv-input">
                  <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder="Type your answer…" rows={1} />
                  <button className="btn primary" onClick={send} disabled={busy || !input.trim()}>Send</button>
                </div>
              )}
          </>
        )}

        {stage === "wall" && (
          <div className="iv-confirm">
            <div className="iv-confirm-emoji">🔒</div>
            <div className="iv-confirm-title">Out of interview credits</div>
            <p className="iv-confirm-sub">{wall}</p>
            <div className="iv-confirm-actions">
              <button className="btn" onClick={onClose}>Close</button>
              <button className="btn primary" onClick={() => { onClose(); onUpgrade?.(); }}>⭐ Upgrade</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
