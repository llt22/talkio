import { View, Text } from "react-native";

interface ModelAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}

const SIZE_MAP = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

const TEXT_SIZE_MAP = {
  sm: "text-xs",
  md: "text-base",
  lg: "text-xl",
};

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
];

function getColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.split(/[-_\s.]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function ModelAvatar({ name, size = "md", online }: ModelAvatarProps) {
  const bgColor = getColorForName(name);
  const initials = getInitials(name);

  return (
    <View className="relative">
      <View
        className={`${SIZE_MAP[size]} ${bgColor} items-center justify-center rounded-full`}
      >
        <Text className={`${TEXT_SIZE_MAP[size]} font-semibold text-white`}>
          {initials}
        </Text>
      </View>
      {online !== undefined && (
        <View
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
            online ? "bg-success" : "bg-gray-300"
          }`}
        />
      )}
    </View>
  );
}
