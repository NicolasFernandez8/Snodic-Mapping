"use client";
import { useId, useState } from "react";
import { useT } from "@/lib/i18n/client";

type Unit = "localities" | "prospects";

const LIMITS: Record<Unit, { min: number; max: number }> = {
  localities: { min: 1, max: 50 },
  prospects: { min: 1, max: 500 },
};

/**
 * Elegir cuánto mapear: localidades enteras o una cantidad de prospectos.
 * Envía `unit` (localities | prospects) y `amount` en el formulario.
 */
export function MapAmount({
  defaultUnit = "localities",
  defaultLocalities = 3,
  defaultProspects = 25,
  compact = false,
}: {
  defaultUnit?: Unit;
  defaultLocalities?: number;
  defaultProspects?: number;
  compact?: boolean;
}) {
  const t = useT();
  const id = useId();
  const [unit, setUnit] = useState<Unit>(defaultUnit);
  const [values, setValues] = useState({ localities: defaultLocalities, prospects: defaultProspects });
  const { min, max } = LIMITS[unit];
  const v = values[unit];
  const set = (n: number) => setValues((x) => ({ ...x, [unit]: Math.max(min, Math.min(max, Math.round(n))) }));

  return (
    <div className={`map-amount ${compact ? "compact" : ""}`}>
      <div className="map-amount-top">
        <div className="seg seg-light" role="radiogroup" aria-label={t("Qué mapear")}>
          {(["localities", "prospects"] as Unit[]).map((u) => (
            <button key={u} type="button" role="radio" aria-checked={unit === u} className={unit === u ? "on" : ""} onClick={() => setUnit(u)}>
              {u === "localities" ? t("Localidades enteras") : t("Prospectos")}
            </button>
          ))}
        </div>
        <label htmlFor={id} className="map-amount-label">
          {unit === "localities" ? t("¿Cuántas localidades mapear ahora?") : t("¿Cuántos prospectos mapear?")}
        </label>
      </div>
      <input type="hidden" name="unit" value={unit} />
      <div className="quota-row">
        <input type="range" min={min} max={max} value={v} aria-label={unit === "localities" ? t("Localidades a mapear") : t("Prospectos a mapear")} onChange={(e) => set(Number(e.target.value))} />
        <input id={id} type="number" name="amount" min={min} max={max} value={v} onChange={(e) => set(e.target.value === "" ? min : Number(e.target.value))} />
      </div>
      <p className="help" style={{ margin: 0 }}>
        {unit === "localities"
          ? t("Mapea cada localidad completa, de la más cercana al centro hacia afuera.")
          : t("Guarda esa cantidad de prospectos nuevos (primero los que tienen más datos de contacto). Si una localidad queda a medias, la próxima vez sigue desde ahí.")}
      </p>
    </div>
  );
}
