const AVATAR_COLORS = [
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#f59e0b",
  "#f43f5e",
  "#06b6d4",
  "#6366f1",
  "#14b8a6",
];

export function getAvatarProps(name: string): { color: string; initials: string } {
  const safeName = (name || "??").trim() || "??";
  let hash = 0;
  for (let i = 0; i < safeName.length; i++) {
    hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];

  const parts = safeName.split(/[-_\s.]+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : safeName.slice(0, 2).toUpperCase();

  return { color, initials: initials || "??" };
}
