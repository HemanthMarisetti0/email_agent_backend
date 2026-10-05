import { Monitor, Moon, Sun } from "lucide-react";

import { Theme, THEMES } from "../lib/theme";

const OPTIONS: Record<Theme, { label: string; icon: typeof Sun }> = {
  system: { label: "System", icon: Monitor },
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
};

interface ThemeToggleProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
  // "cycle" is a single icon button for tight spaces.
  variant?: "segmented" | "cycle";
}

export default function ThemeToggle({ theme, onChange, variant = "segmented" }: ThemeToggleProps) {
  if (variant === "cycle") {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    const Icon = OPTIONS[theme].icon;
    return (
      <button
        className="icon-btn"
        onClick={() => onChange(next)}
        aria-label={`Theme: ${OPTIONS[theme].label}. Switch to ${OPTIONS[next].label}`}
        title={`Theme: ${OPTIONS[theme].label}`}
      >
        <Icon aria-hidden />
      </button>
    );
  }

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Theme">
      {THEMES.map((value) => {
        const { label, icon: Icon } = OPTIONS[value];
        return (
          <button
            key={value}
            role="radio"
            aria-checked={theme === value}
            className={theme === value ? "active" : undefined}
            onClick={() => onChange(value)}
            title={label}
          >
            <Icon aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
