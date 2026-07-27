"use client";
import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

const KEY = "zensil-theme";
type Theme = "dark" | "light";

/*
  Light/dark switch. The current theme lives on <html data-theme> —
  a tiny inline script in the root layout applies the saved value
  before first paint, so there is never a flash of the wrong theme.
  While switching we add .theme-anim so every surface cross-fades.

  That attribute is the single source of truth; we subscribe to it rather
  than mirroring it into state, so the icon can't drift out of sync with
  the value the inline script already applied.
*/
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const readTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

// on the server there is no DOM to read — matches <html data-theme="dark">
const serverTheme = (): Theme => "dark";

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.add("theme-anim");
    root.dataset.theme = next; // observed above → re-renders this button
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    window.setTimeout(() => root.classList.remove("theme-anim"), 500);
  }

  return (
    <button
      type="button"
      className="theme-btn"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
    >
      <span className={`theme-ic ${theme === "dark" ? "show" : ""}`}>
        <Moon size={16} />
      </span>
      <span className={`theme-ic ${theme === "light" ? "show" : ""}`}>
        <Sun size={16} />
      </span>
    </button>
  );
}
