"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";

/** Barra deslizante + número editable sincronizados para elegir cuántas localidades mapear (1–50). */
export function QuotaSlider({
  name = "quota",
  defaultValue = 3,
  min = 1,
  max = 50,
  label,
}: {
  name?: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  label?: string;
}) {
  const t = useT();
  const [v, setV] = useState(defaultValue);
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  return (
    <div className="quota">
      <label htmlFor={`${name}-n`}>{label ?? t("Localidades a mapear")}</label>
      <div className="quota-row">
        <input
          type="range"
          min={min}
          max={max}
          value={v}
          aria-label={label ?? t("Localidades a mapear")}
          onChange={(e) => setV(clamp(Number(e.target.value)))}
        />
        <input
          id={`${name}-n`}
          type="number"
          name={name}
          min={min}
          max={max}
          value={v}
          onChange={(e) => setV(e.target.value === "" ? min : clamp(Number(e.target.value)))}
        />
      </div>
    </div>
  );
}
