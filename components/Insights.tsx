"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, Send } from "lucide-react";

interface Msg {
  role: "you" | "claude";
  html: string;
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
  { tag: "Stockout Risk", title: "3 SKUs stock out within 7 days", body: "Gilded Soy Candle Trio, Obsidian Leather Journal and Heritage Brass Stand fall below 7 days of cover at current velocity.", ev: "SELECT internal_sku FROM v_stock_health WHERE days_of_cover < 7" },
  { tag: "Wasted Spend", title: "₹7,640 recoverable on Amazon", body: "Six search terms over ₹500 spend produced zero or near-zero orders. Adding them as negatives reclaims spend immediately.", ev: "SELECT keyword_or_search_term, spend FROM v_wasted_spend" },
  { tag: "Return Spike", title: "Silk Scarf returns trending up", body: "Crimson Silk Scarf shows the highest return rate, driven by \"damaged in transit\". Review packaging before scaling ads.", ev: "SELECT reason, count(*) FROM returns GROUP BY reason ORDER BY 2 DESC" },
];

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
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "claude", html: data.answer ?? "Something went wrong." };
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

  // auto-ask when arriving from an "Ask Claude" deep link (?q=...)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && askedRef.current !== q) {
      askedRef.current = q;
      ask(q);
    }
  }, [searchParams]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      <div className="card">
        <div className="card-b">
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
              placeholder="Ask anything about your warehouse — e.g. which SKU has the worst margin on Flipkart?"
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
      </div>

      {messages.length === 0 && (
        <div className="grid g-3 mt">
          {CARDS.map((c) => (
            <div key={c.title} className="insight-card">
              <div className="tag">{c.tag}</div>
              <h4>{c.title}</h4>
              <p>{c.body}</p>
              <div className="ev">{c.ev}</div>
            </div>
          ))}
        </div>
      )}

      <div className="chat-thread">
        {messages.map((m, i) =>
          m.role === "you" ? (
            <div key={i} className="bubble you" dangerouslySetInnerHTML={{ __html: m.html }} />
          ) : (
            <div key={i} className="bubble claude">
              <div className="who">
                <Sparkles size={13} /> Claude · Zensil Ops
              </div>
              {m.loading ? (
                <div className="typing">
                  <i />
                  <i />
                  <i />
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
