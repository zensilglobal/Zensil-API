"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Sparkles,
  Send,
  ShieldCheck,
  Database,
  ArrowUpRight,
  FileText,
  Package,
  Target,
  RotateCw,
  Percent,
  Rocket,
} from "lucide-react";

interface Msg {
  role: "you" | "claude";
  html: string;
  model?: string;
  loading?: boolean;
}

const SUGGESTIONS = [
  "Which keywords are wasting the most spend this week?",
  "Which SKUs will stock out before Diwali?",
  "Is the Amber Oud Diffuser more profitable on Amazon or Flipkart?",
  "Rank my products by return rate and tell me why",
  "What is my best-margin SKU across all channels?",
];

const CARDS = [
  {
    tag: "Stockout Risk",
    title: "3 SKUs stock out within 7 days",
    body: "Gilded Soy Candle Trio, Obsidian Leather Journal and Heritage Brass Stand fall below 7 days of cover at current velocity.",
    ev: "SELECT internal_sku FROM v_stock_health WHERE days_of_cover < 7",
    q: "Which SKUs stock out within 7 days and how many units should I reorder for each?",
  },
  {
    tag: "Wasted Spend",
    title: "₹7,640 recoverable on Amazon",
    body: "Six search terms over ₹500 spend produced zero or near-zero orders. Adding them as negatives reclaims spend immediately.",
    ev: "SELECT keyword_or_search_term, spend FROM v_wasted_spend",
    q: "Which search terms should I add as negative keywords and how much will it save?",
  },
  {
    tag: "Return Spike",
    title: "Silk Scarf returns trending up",
    body: 'Crimson Silk Scarf shows the highest return rate, driven by "damaged in transit". Review packaging before scaling ads.',
    ev: "SELECT reason, count(*) FROM returns GROUP BY reason ORDER BY 2 DESC",
    q: "Break down returns for the Crimson Silk Scarf by reason and suggest fixes.",
  },
];

const SKILLS = [
  {
    icon: FileText,
    title: "Weekly Business Review",
    blurb: "Revenue, channel mix, top wins & risks, and the one move to make this week.",
    prompt:
      "Give me a weekly business review across all channels: revenue and channel mix, the 3 biggest wins and 3 biggest risks right now, and the single most important action to take this week. Quantify each point.",
  },
  {
    icon: Package,
    title: "Restock Planner",
    blurb: "SKUs at stockout risk with exact reorder quantities and a festive buffer.",
    prompt:
      "Which SKUs are at stockout risk, and exactly how many units should I reorder for each to reach 45 days of cover plus a Diwali buffer? Prioritise by urgency and total the units.",
  },
  {
    icon: Target,
    title: "PPC Optimizer",
    blurb: "ACOS outliers, negative keywords to add, and bid changes to make.",
    prompt:
      "Audit my Amazon advertising: flag every campaign above the 28% ACOS target, list the search terms to add as negatives with the spend they will save, and recommend specific bid changes.",
  },
  {
    icon: RotateCw,
    title: "Returns Root-Cause",
    blurb: "What's driving returns and the fixes that cut the rate.",
    prompt:
      "Which products drive the most returns, what are the root-cause reasons, and what specific fixes (packaging, listing accuracy, QC) will cut the return rate? Estimate the impact.",
  },
  {
    icon: Percent,
    title: "Margin Maximizer",
    blurb: "Best & worst margin SKUs and where to shift inventory.",
    prompt:
      "Rank my SKUs by contribution margin, show which channel is most profitable for each, and tell me where to shift inventory to maximise total margin.",
  },
  {
    icon: Rocket,
    title: "Growth Opportunities",
    blurb: "Under-stocked bestsellers and channels you're under-indexed on.",
    prompt:
      "Where are my biggest growth opportunities right now — under-stocked bestsellers, high-margin SKUs to push harder, or channels I am under-indexed on? Give me 3 concrete moves.",
  },
];

function modelLabel(model?: string): string {
  if (!model || model === "sample") return "Sample data";
  if (model.startsWith("gemini-2.5-pro")) return "Gemini 2.5 Pro";
  if (model.startsWith("gemini-2.5-flash")) return "Gemini 2.5 Flash";
  if (model.startsWith("gemini")) return "Gemini";
  return "Gemini";
}

export default function Insights() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const askedRef = useRef<string | null>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "you", html: escapeHtml(q) }, { role: "claude", html: "", loading: true }]);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          channel: searchParams.get("channel") || "all",
          days: Number(searchParams.get("days")) || 30,
        }),
      });
      const data = await res.json();
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "claude",
          html: data.answer ?? "Something went wrong.",
          model: data.model,
        };
        return copy;
      });
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "claude", html: "Could not reach the analysis service." };
        return copy;
      });
    }
  }

  // auto-ask when arriving from an "Ask Gemini" deep link (?q=...)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && askedRef.current !== q) {
      askedRef.current = q;
      ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      <div className="ask-shell">
        <div className="ask-shell-glow" />
        <div className="ask-head">
          <div className="ask-crest">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="ask-title">Ask Gemini anything about your business</div>
            <div className="ask-meta">
              <span>
                <ShieldCheck size={12} /> Read-only
              </span>
              <span>
                <Database size={12} /> Grounded on your live warehouse
              </span>
              <span className="ask-model">
                <Sparkles size={11} /> Gemini 2.5 Flash
              </span>
            </div>
          </div>
        </div>

        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
            setInput("");
          }}
        >
          <Sparkles size={18} color="var(--color-gold)" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. which SKU has the worst margin on Flipkart, and what should I do about it?"
          />
          <button type="submit" className="btn gold">
            <Send size={15} /> Ask
          </button>
        </form>

        <div className="suggested">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {messages.length === 0 && (
        <>
          <div className="skills-head">
            <h3>Analyst Skills</h3>
            <p>One-click workflows — each runs a full analysis on your live data, run by Gemini</p>
          </div>
          <div className="skill-grid">
            {SKILLS.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.title} className="skill-card" onClick={() => ask(s.prompt)}>
                  <span className="skill-ic">
                    <Icon size={17} />
                  </span>
                  <span className="skill-body">
                    <span className="skill-title">{s.title}</span>
                    <span className="skill-blurb">{s.blurb}</span>
                  </span>
                  <ArrowUpRight size={15} className="skill-arrow" />
                </button>
              );
            })}
          </div>

          <div className="insight-lead">
            <span>Surfaced now</span> — tap a card to open the full analysis
          </div>
          <div className="grid g-3 mt">
            {CARDS.map((c) => (
              <button key={c.title} className="insight-card" onClick={() => ask(c.q)}>
                <div className="insight-card-top">
                  <span className="tag">{c.tag}</span>
                  <ArrowUpRight size={16} className="insight-arrow" />
                </div>
                <h4>{c.title}</h4>
                <p>{c.body}</p>
                <div className="ev">{c.ev}</div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="chat-thread">
        {messages.map((m, i) =>
          m.role === "you" ? (
            <div key={i} className="bubble you" dangerouslySetInnerHTML={{ __html: m.html }} />
          ) : (
            <div key={i} className="bubble claude">
              <div className="who">
                <span className="who-crest">
                  <Sparkles size={12} />
                </span>
                Gemini · Zensil Ops
                <span className={`who-model ${m.model === "sample" ? "sample" : ""}`}>{modelLabel(m.model)}</span>
              </div>
              {m.loading ? (
                <div className="thinking">
                  <div className="thinking-row">
                    <span className="orbit" />
                    Reading your warehouse & reasoning over the numbers…
                  </div>
                  <div className="skeleton">
                    <i style={{ width: "92%" }} />
                    <i style={{ width: "78%" }} />
                    <i style={{ width: "85%" }} />
                  </div>
                </div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: m.html }} />
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
