"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const KEY = "zensil-theme";
type Theme = "dark" | "light";

/*
  Light/dark switch. The current theme lives on <html data-theme> —
  a tiny inline script in the root layout applies the saved value
  before first paint, so there is never a flash of the wrong theme.
  While switching we add .theme-anim so every surface cross-fades.
*/
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.add("theme-anim");
    root.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    setTheme(next);
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
