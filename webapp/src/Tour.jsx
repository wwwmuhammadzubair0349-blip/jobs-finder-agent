import React, { useState } from "react";

const STEPS = [
  { emoji: "👋", title: "Welcome to Jobs Finder", text: "Your personal team of agents searches jobs 24/7, writes a tailored CV & cover letter for each match, and sends them to your Telegram. Here's a 60-second tour." },
  { emoji: "🧑‍💼", title: "1. Profile — your CV facts", text: "Fill in your real experience, skills, achievements and more. This is the single source of truth every CV is built from. The more you add, the better your matches." },
  { emoji: "🔍", title: "2. Search — what to look for", text: "Set your job titles, the countries you want (add as many as you like), and keywords. This tells the agents exactly what to hunt for." },
  { emoji: "🏠", title: "3. Today — your command center", text: "See live stats, watch your agents work in real time, and browse fresh matches. Tap a stat (Applied, Interviews…) to filter." },
  { emoji: "📋", title: "4. All jobs", text: "Every job we've found, saved forever. Hit “Send to Telegram” on any job to instantly get its tailored CV + cover letter + how-to-apply steps." },
  { emoji: "✅", title: "5. Applications", text: "Track each role: Saved → Applied → Interview → Offer. Tap “✅ Applied” on any Telegram job and it updates here automatically." },
  { emoji: "⏰", title: "6. Schedule", text: "Choose how often we check and set quiet hours so you're not pinged overnight. Your timezone is detected automatically." },
  { emoji: "✈️", title: "7. Connect Telegram", text: "On the Today tab, copy your code and send it to our Jobs bot and Interview-prep bot. That's how your jobs and CVs reach your phone." },
  { emoji: "🚀", title: "You're set!", text: "Start by completing your Profile — that's what unlocks great matches. Good luck out there!" },
];

export default function Tour({ onDone }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <div className="tour-back">
      <div className="tour-card fade">
        <div className="tour-emoji">{step.emoji}</div>
        <h2>{step.title}</h2>
        <p>{step.text}</p>
        <div className="tour-dots">{STEPS.map((_, k) => <span key={k} className={k === i ? "on" : ""} />)}</div>
        <div className="tour-actions">
          {!last && <button className="btn ghost" onClick={() => setI(i + 1)}>Skip</button>}
          {last
            ? <button className="btn primary" onClick={onDone}>Get started</button>
            : <button className="btn primary" onClick={() => setI(i + 1)}>Next</button>}
        </div>
        {!last && <button className="tour-skipall" onClick={onDone}>Skip all</button>}
      </div>
    </div>
  );
}
