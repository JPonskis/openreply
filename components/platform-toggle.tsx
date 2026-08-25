"use client";

/**
 * Platform filter pills: everything, Instagram only, or Facebook only.
 * Campaigns cover both platforms, so this is a view filter, not a setting.
 */

export type PlatformFilter = "all" | "instagram" | "facebook";

const OPTIONS: { value: PlatformFilter; label: string }[] = [
  { value: "all", label: "All platforms" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
];

export default function PlatformToggle({
  value,
  onChange,
}: {
  value: PlatformFilter;
  onChange: (value: PlatformFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            value === option.value
              ? "bg-accent/15 text-accent border border-accent/20"
              : "bg-surface text-muted border border-border hover:border-border-hover hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Small per-row platform chip for logs and activity feeds. */
export function PlatformBadge({ platform }: { platform?: string | null }) {
  const isFacebook = platform === "facebook";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isFacebook
          ? "bg-[#1877F2]/10 text-[#1877F2]"
          : "bg-[#E1306C]/10 text-[#E1306C]"
      }`}
      title={isFacebook ? "Facebook Page comment" : "Instagram comment"}
    >
      {isFacebook ? "FB" : "IG"}
    </span>
  );
}
