import { useState, useRef, useCallback, useEffect, memo } from "react";

interface Mention {
  id: string;
  label: string;
  secondaryLabel?: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  mentions: Mention[];
  placeholder?: string;
  rows?: number;
  className?: string;
}

export const MentionTextarea = memo(function MentionTextarea({
  value,
  onChange,
  onBlur,
  mentions,
  placeholder,
  rows = 2,
  className,
}: MentionTextareaProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuFilter, setMenuFilter] = useState("");
  const [menuIndex, setMenuIndex] = useState(0);
  const [atPos, setAtPos] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = mentions.filter((m) =>
    m.label.toLowerCase().includes(menuFilter.toLowerCase()),
  );

  const insertMention = useCallback(
    (mention: Mention) => {
      const ta = textareaRef.current;
      if (!ta || atPos < 0) return;
      const before = value.slice(0, atPos);
      const after = value.slice(ta.selectionStart);
      const newVal = `${before}@${mention.label} ${after}`;
      onChange(newVal);
      setShowMenu(false);
      setMenuFilter("");
      setAtPos(-1);
      // Restore cursor after React re-renders
      requestAnimationFrame(() => {
        const pos = atPos + mention.label.length + 2; // @name + space
        ta.setSelectionRange(pos, pos);
        ta.focus();
      });
    },
    [value, atPos, onChange],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newVal = e.target.value;
      onChange(newVal);

      const cursorPos = e.target.selectionStart;
      // Find the last '@' before cursor that isn't preceded by a word char
      const textBefore = newVal.slice(0, cursorPos);
      const lastAt = textBefore.lastIndexOf("@");
      if (lastAt >= 0 && (lastAt === 0 || /\s/.test(textBefore[lastAt - 1]))) {
        const query = textBefore.slice(lastAt + 1);
        if (!/\s/.test(query)) {
          setAtPos(lastAt);
          setMenuFilter(query);
          setMenuIndex(0);
          setShowMenu(true);
          return;
        }
      }
      setShowMenu(false);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showMenu || filtered.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenuIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filtered[menuIndex]);
      } else if (e.key === "Escape") {
        setShowMenu(false);
      }
    },
    [showMenu, filtered, menuIndex, insertMention],
  );

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        className={className}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
      />
      {showMenu && filtered.length > 0 && (
        <div
          ref={menuRef}
          className="absolute left-0 z-50 mt-1 max-h-[180px] w-full overflow-y-auto rounded-lg py-1 shadow-lg"
          style={{ backgroundColor: "var(--card)", border: "0.5px solid var(--border)" }}
        >
          {filtered.map((m, i) => (
            <button
              key={m.id}
              className={`flex w-full items-center px-3 py-1.5 text-left text-xs ${
                i === menuIndex ? "bg-primary/10 text-primary" : "text-foreground"
              }`}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent textarea blur
                insertMention(m);
              }}
              onMouseEnter={() => setMenuIndex(i)}
            >
              <div className="min-w-0">
                <span className="block truncate">@{m.label}</span>
                {m.secondaryLabel && (
                  <span className="text-muted-foreground block truncate text-[10px]">
                    {m.secondaryLabel}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
