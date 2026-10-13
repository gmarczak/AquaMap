"use client";

import { ChevronLeft, Coins } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { useToast } from "@/components/ui/Toast";
import { sectionTitle } from "@/components/ui/styles";
import { useAction, useSnapshot } from "@/lib/data/hooks";
import { buyItem, equipItem, errorMessage, sellItem, withEquipped } from "@/lib/data/mutations";
import { equipmentBonus, SELL_VALUE, totals } from "@/lib/domain/game";
import { RARITY_ORDER, SLOT_LABELS, SLOTS, type InventoryItem, type Item } from "@/lib/domain/model";
import { bonusText, ItemIcon, RarityLabel } from "./ItemBadge";

export function ItemsScreen() {
  const { data: snapshot } = useSnapshot();
  const [tab, setTab] = useState<"inventory" | "shop">("inventory");
  const toast = useToast();
  const equip = useAction(equipItem, withEquipped);
  const sell = useAction(sellItem);
  const buy = useAction(buyItem);
  if (!snapshot) return null;

  const coins = totals(snapshot.rewards).coins;
  const byId = new Map(snapshot.items.map((i) => [i.id, i]));
  const eq = equipmentBonus(snapshot.inventory, snapshot.items);
  const equipped = new Map(snapshot.inventory.filter((i) => i.equipped).map((i) => [i.slot, i]));
  const bag = snapshot.inventory
    .filter((i) => !i.equipped && byId.has(i.itemId))
    .sort((a, b) => RARITY_ORDER.indexOf(byId.get(a.itemId)!.rarity) - RARITY_ORDER.indexOf(byId.get(b.itemId)!.rarity));
  const fail = (e: Error) => toast({ message: errorMessage(e) });

  const row = (inv: InventoryItem, item: Item) => (
    <li key={inv.id} className="flex flex-col gap-2 border-b border-border py-3">
      <div className="flex items-center gap-3">
        <ItemIcon item={item} />
        <span className="flex min-w-0 flex-1 flex-col">
          <RarityLabel rarity={item.rarity} />
          <span className="truncate font-semibold">{item.name}</span>
          <span className="text-sm text-muted">
            {SLOT_LABELS[item.slot]} · {bonusText(item)}
          </span>
        </span>
      </div>
      <div className="flex justify-end gap-2">
        <ConfirmButton
          label={`Sprzedaj za ${SELL_VALUE[item.rarity]}`}
          small
          confirmLabel={`Sprzedać za ${SELL_VALUE[item.rarity]}?`}
          disabled={sell.isPending}
          onConfirm={() => sell.mutate(inv.id, { onError: fail, onSuccess: () => toast({ message: `+${SELL_VALUE[item.rarity]} monet` }) })}
        />
        <button
          type="button"
          onClick={() => equip.mutate({ id: inv.id, equip: true }, { onError: fail })}
          className="inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-contrast"
        >
          Załóż
        </button>
      </div>
    </li>
  );

  return (
    <main className="flex flex-col gap-6 px-5 pt-6 pb-8">
      <header className="flex items-center gap-1">
        <Link href="/game" aria-label="Wróć do gry" className="-ml-3 flex h-11 w-11 items-center justify-center">
          <ChevronLeft aria-hidden="true" size={24} />
        </Link>
        <h1 className="flex-1 font-serif text-[28px] font-semibold">Ekwipunek</h1>
        <span className="flex items-center gap-1.5 font-semibold tabular-nums">
          <Coins aria-hidden="true" size={18} style={{ color: "var(--c-amber-fg)" }} /> {coins}
        </span>
      </header>

      <div role="tablist" aria-label="Widok" className="flex rounded-full bg-surface p-1">
        {(["inventory", "shop"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-10 flex-1 rounded-full text-sm ${tab === t ? "bg-bg font-semibold text-text" : "font-medium text-muted"}`}
          >
            {t === "inventory" ? "Mój sprzęt" : "Sklep"}
          </button>
        ))}
      </div>

      {tab === "inventory" ? (
        <>
          <section aria-labelledby="worn" className="flex flex-col gap-3">
            <h2 id="worn" className={sectionTitle}>
              Założone · +{eq.xp}% EXP, +{eq.coins}% monet
            </h2>
            <ul className="grid grid-cols-3 gap-2">
              {SLOTS.map((slot) => {
                const inv = equipped.get(slot);
                const item = inv ? byId.get(inv.itemId) : undefined;
                return (
                  <li key={slot} className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center ${item ? "bg-surface" : "border border-dashed border-border"}`}>
                    {item && inv ? (
                      <button type="button" onClick={() => equip.mutate({ id: inv.id, equip: false }, { onError: fail })} className="flex flex-col items-center gap-1.5" aria-label={`Zdejmij: ${item.name}`}>
                        <ItemIcon item={item} size={40} />
                        <span className="text-[12px] font-semibold leading-tight">{item.name}</span>
                      </button>
                    ) : (
                      <span className="flex h-[66px] items-center text-sm text-muted">{SLOT_LABELS[slot]}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted">Jeden przedmiot na miejsce. Bonusy sumują się do +30% EXP i +30% monet.</p>
          </section>

          <section aria-labelledby="bag" className="flex flex-col">
            <h2 id="bag" className={`${sectionTitle} mb-1`}>
              W plecaku
            </h2>
            {bag.length === 0 ? (
              <p className="text-muted">Pusto. Przedmioty wypadają z treningów (dłuższy dystans = większa szansa), ze skrzynek za poziom i ze sklepu.</p>
            ) : (
              <ul>{bag.map((inv) => row(inv, byId.get(inv.itemId)!))}</ul>
            )}
          </section>
        </>
      ) : (
        <section aria-label="Sklep" className="flex flex-col">
          <ul>
            {snapshot.items
              .filter((i) => i.inShop)
              .map((item) => {
                const owned = snapshot.inventory.filter((i) => i.itemId === item.id).length;
                return (
                  <li key={item.id} className="flex items-center gap-3 border-b border-border py-3">
                    <ItemIcon item={item} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <RarityLabel rarity={item.rarity} />
                      <span className="truncate font-semibold">{item.name}</span>
                      <span className="text-sm text-muted">
                        {SLOT_LABELS[item.slot]} · {bonusText(item)}
                        {owned > 0 ? ` · masz ${owned}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={coins < item.price || buy.isPending}
                      onClick={() => buy.mutate(item.id, { onError: fail, onSuccess: () => toast({ message: `${item.name} w plecaku` }) })}
                      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-contrast disabled:bg-surface disabled:text-muted"
                    >
                      <Coins aria-hidden="true" size={14} /> {item.price}
                    </button>
                  </li>
                );
              })}
          </ul>
          <p className="pt-3 text-xs text-muted">Monety: 1 za każde 100 m, plus nagrody z questów. Sprzedaż: 10 / 50 / 200 / 1000 wg rzadkości.</p>
        </section>
      )}
    </main>
  );
}
