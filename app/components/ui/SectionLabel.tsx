import { Text } from "react-native";

/** The small uppercase label above a field or a section. */
export default function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  // Spacing only (`mt-8 mb-3`).
  className?: string;
}) {
  return (
    <Text
      className={`text-text-muted font-mono uppercase text-xs tracking-widest ${className}`}
    >
      {children}
    </Text>
  );
}
