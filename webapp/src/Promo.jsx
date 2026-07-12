import React, { useEffect, useState } from "react";

// Gentle once-a-day nudge. Shows AT MOST one promo per calendar day, ~40s after
// load, randomly choosing between "upgrade" (only if not already on Pro Plus)
// and "join our Telegram channel". Dismissible; never nags twice in a day.
const CHANNEL_URL = "https://t.me/dailyjobs_feed";

export default function DailyPromo({ plan, connected, onUpgrade }) {
  const [show, setShow] = useState(null); // 'upgrade' | 'telegram' | null

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("jf_promo_day") === today) return; // already shown today
    const opts = [];
    if ((plan || "free").toLowerCase() !== "proplus") opts.push("upgrade");
    opts.push("telegram");
    if (!opts.length) return;
    const t = setTimeout(() => {
      const pick = opts[Math.floor(Math.random() * opts.length)];
      localStorage.setItem("jf_promo_day", today);
      setShow(pick);
    }, 40000);
    return () => clearTimeout(t);
  }, [plan]);

  if (!show) return null;
  const close = () => setShow(null);

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal promo-modal fade" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn promo-x" onClick={close} aria-label="Close">✕</button>
        {show === "upgrade" ? (
          <div className="promo-body">
            <div className="promo-ico">⭐</div>
            <div className="promo-title">Get more matches, faster</div>
            <p className="promo-sub">Upgrade your plan for more daily job matches, tailored CVs &amp; cover letters, interview practice and auto-apply. Cancel anytime.</p>
            <div className="promo-actions">
              <button className="btn primary big" onClick={() => { onUpgrade?.(); close(); }}>See plans</button>
              <button className="btn ghost" onClick={close}>Maybe later</button>
            </div>
          </div>
        ) : (
          <div className="promo-body">
            <div className="promo-ico">📢</div>
            <div className="promo-title">Join our Daily Jobs channel</div>
            <p className="promo-sub">Fresh roles, CV &amp; interview tips every day on Telegram — free. A great way to never miss an opportunity.</p>
            <div className="promo-actions">
              <a className="btn primary big" href={CHANNEL_URL} target="_blank" rel="noreferrer" onClick={close}>Join the channel</a>
              <button className="btn ghost" onClick={close}>Maybe later</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
