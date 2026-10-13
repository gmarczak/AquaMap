import { Footprints, Glasses, Hand, HardHat, LifeBuoy, Shirt } from "lucide-react";
import type { Item, Rarity, Slot } from "@/lib/domain/model";
import { RARITY_LABELS } from "@/lib/domain/model";

const ICONS: Record<Slot, typeof Glasses> = { goggles: Glasses, cap: HardHat, fins: Footprints, suit: Shirt, paddles: Hand, buoy: LifeBuoy };

export const RARITY_STYLE: Record<Rarity, { bg: string; fg: string }> = {
  common: { bg: "var(--c-slate-bg)", fg: "var(--c-slate-fg)" },
  rare: { bg: "var(--c-blue-bg)", fg: "var(--c-blue-fg)" },
  epic: { bg: "var(--c-violet-bg)", fg: "var(--c-violet-fg)" },
  legendary: { bg: "var(--c-amber-bg)", fg: "var(--c-amber-fg)" },
};

export function ItemIcon({ item, size = 44 }: { item: Pick<Item, "slot" | "rarity" | "name">; size?: number }) {
  const Icon = ICONS[item.slot];
  const style = RARITY_STYLE[item.rarity];
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-2xl"
      style={{ width: size, height: size, background: style.bg, color: style.fg, boxShadow: item.rarity === "legendary" ? `0 0 0 2px ${style.fg}` : undefined }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}

export function RarityLabel({ rarity }: { rarity: Rarity }) {
  return (
    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: RARITY_STYLE[rarity].fg }}>
      {RARITY_LABELS[rarity]}
    </span>
  );
}

export function bonusText(item: Pick<Item, "bonusKind" | "bonusPct">): string {
  return `+${item.bonusPct}% ${item.bonusKind === "xp" ? "EXP" : "monet"}`;
}
