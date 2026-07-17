// Fixed palette cycle so each household member gets a consistent identity
// color, assigned by their join order (index into the members list).
const PERSON_COLORS = [
  { bg: "bg-sage", text: "text-white" },
  { bg: "bg-terracotta", text: "text-white" },
  { bg: "bg-brand-blue", text: "text-white" },
] as const;

export function personColor(index: number) {
  return PERSON_COLORS[index % PERSON_COLORS.length];
}

export function colorIndexFor(
  members: { id: string }[],
  userId: string,
): number {
  return Math.max(0, members.findIndex((member) => member.id === userId));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
