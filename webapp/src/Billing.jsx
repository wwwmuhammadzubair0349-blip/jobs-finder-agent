import React from "react";
import { PLANS, METRIC_LABELS, METRIC_ICON, planEmoji, rank } from "./plans";

// Small clickable pill in the topbar showing the current plan.
export function PlanBadge({ plan, onClick }) {
  const id = plan?.id || "free";
  const label = plan?.label || "Free";
  return (
    <button className="plan-badge" onClick={onClick} title="View plans & usage">
      <span>{planEmoji(id)}</span>
      <span className="plan-badge-name">{label}</span>
    </button>
  );
}

// A single metric row with a usage bar.
function MeterRow({ mkey, u }) {
  const period = u.period === "week" ? "this week" : "today";
  if (u.unlimited) {
    return (
      <div className="meter">
        <div className="meter-top">
          <span className="meter-label">{METRIC_ICON[mkey]} {METRIC_LABELS[mkey]}</span>
          <span className="meter-count" style={{ color: "var(--ok)" }}>Unlimited ∞</span>
        </div>
        <div className="bar-track"><div className="bar-fill" style={{ width: "100%", background: "color-mix(in srgb, var(--ok) 55%, transparent)" }} /></div>
      </div>
    );
  }
  const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
  const color = u.remaining <= 0 ? "var(--err)" : pct >= 80 ? "var(--warn)" : "var(--accent)";
  return (
    <div className="meter">
      <div className="meter-top">
        <span className="meter-label">{METRIC_ICON[mkey]} {METRIC_LABELS[mkey]}</span>
        <span className="meter-count" style={{ color }}>{u.used}/{u.limit} <span className="hint" style={{ fontWeight: 400 }}>{period}</span></span>
      </div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

// Usage card for the Today tab. `plan` is data.plan { id, label, usage }.
export function UsageMeters({ plan, onOpen }) {
  if (!plan?.usage) return null;
  const order = ["notif", "autoapply", "cvprep", "interview"];
  const isTop = plan.id === "proplus";
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <p className="section-title" style={{ margin: 0 }}>{planEmoji(plan.id)} Your plan · {plan.label}</p>
        {!isTop && <button className="btn primary sm" onClick={onOpen}>⭐ Upgrade</button>}
        {isTop && <span className="tag" style={{ color: "var(--ok)", borderColor: "var(--ok)" }}>Top tier</span>}
      </div>
      <div className="meters">
        {order.map((k) => plan.usage[k] && <MeterRow key={k} mkey={k} u={plan.usage[k]} />)}
      </div>
    </div>
  );
}

// Full pricing page as a modal. `onChoose(id)` handles upgrade intent.
export function PricingModal({ currentId = "free", onClose, onChoose }) {
  const curRank = rank(currentId);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal pricing fade" onClick={(e) => e.stopPropagation()}>
        <div className="job-top">
          <div>
            <div className="job-title">Choose your plan</div>
            <div className="job-sub">Upgrade anytime · cancel anytime</div>
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="pricing-grid">
          {PLANS.map((p) => {
            const isCurrent = p.id === currentId;
            const isDown = rank(p.id) < curRank;
            return (
              <div key={p.id} className={`price-card${p.popular ? " popular" : ""}${isCurrent ? " current" : ""}`}>
                {p.popular && <div className="price-flag">★ Most popular</div>}
                <div className="price-head">
                  <span className="price-emoji">{planEmoji(p.id)}</span>
                  <span className="price-name">{p.label}</span>
                </div>
                <div className="price-amount">
                  {p.price === 0 ? <span className="price-free">Free</span>
                    : <><span className="price-cur">$</span><span className="price-num">{p.price}</span><span className="price-per">/mo</span></>}
                </div>
                <div className="price-tag">{p.tagline}</div>
                <ul className="price-feats">
                  {p.features.map((f, i) => <li key={i}><span className="tick">✓</span>{f}</li>)}
                </ul>
                {isCurrent
                  ? <button className="btn sm" disabled style={{ opacity: 0.7 }}>Current plan</button>
                  : isDown
                    ? <button className="btn ghost sm" onClick={() => onChoose(p.id)}>Switch</button>
                    : <button className="btn primary sm" onClick={() => onChoose(p.id)}>Upgrade →</button>}
              </div>
            );
          })}
        </div>
        <div className="hint" style={{ textAlign: "center", marginTop: 12 }}>
          Auto-applied CVs & cover letters never count against your CV/cover quota.
        </div>
      </div>
    </div>
  );
}
