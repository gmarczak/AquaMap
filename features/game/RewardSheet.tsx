"use client";

import { Coins, Sparkles, Zap } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { btnPrimary } from "@/components/ui/styles";
import type { ClaimResult } from "@/lib/data/mutations";
import type { Item, WorkoutSummary } from "@/lib/domain/model";
import { bonusText, ItemIcon, RarityLabel } from "./ItemBadge";

export type RewardView = { kind: "workout"; summary: WorkoutSummary } | { kind: "quest"; title: string; result: ClaimResult };

/** Podsumowanie nagród po treningu albo po odebraniu questa: EXP, monety, rekord, nowy poziom, przedmioty. */
export function RewardSheet({ reward, items, onClose }: { reward: RewardView | null; items: Item[]; onClose: () => void }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const r = reward
    ? reward.kind === "workout"
      ? { ...reward.summary, title: "Trening zapisany", rewarded: reward.summary.rewarded }
      : { ...reward.result, title: reward.title, rewarded: true, record: false }
    : null;
  const levelUp = r ? r.level_after > r.level_before : false;

  return (
    <Modal open={reward !== null} onClose={onClose} title={levelUp ? `Poziom ${r!.level_after}!` : (r?.title ?? "")}>
      {r && (
        <div className="flex flex-col gap-5">
          {r.rewarded ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface py-4">
                <Zap aria-hidden="true" size={22} className="text-accent" />
                <span className="font-serif text-3xl font-semibold tabular-nums">+{r.xp}</span>
                <span className="text-sm text-muted">EXP</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface py-4">
                <Coins aria-hidden="true" size={22} style={{ color: "var(--c-amber-fg)" }} />
                <span className="font-serif text-3xl font-semibold tabular-nums">+{r.coins}</span>
                <span className="text-sm text-muted">monet</span>
              </div>
            </div>
          ) : (
            <p className="rounded-2xl bg-surface px-4 py-3">
              Trening jest w dzienniku, ale bez nagród: nagradzane są 2 pierwsze treningi dnia i tempo nie szybsze niż 1:00/100 m.
            </p>
          )}
          {r.record && (
            <p className="flex items-center gap-2 font-semibold text-accent">
              <Sparkles aria-hidden="true" size={18} /> Rekord tempa! +50 EXP w cenie
            </p>
          )}
          {levelUp && <p className="text-muted">Awans z poziomu {r.level_before} na {r.level_after} — skrzynka trafiła do ekwipunku.</p>}
          {r.items.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Zdobyte przedmioty">
              {r.items.map((it) => {
                const item = byId.get(it.item_id);
                if (!item) return null;
                return (
                  <li key={it.id} className="flex items-center gap-3 rounded-2xl border border-border px-3 py-3">
                    <ItemIcon item={item} />
                    <span className="flex flex-col">
                      <RarityLabel rarity={item.rarity} />
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-sm text-muted">
                        {bonusText(item)} · {it.source === "level" ? "skrzynka za poziom" : "znalezione w wodzie"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" onClick={onClose} className={btnPrimary}>
            Super
          </button>
        </div>
      )}
    </Modal>
  );
}
