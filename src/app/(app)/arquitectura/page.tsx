import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { ArchTree } from "./arch-tree";

export default async function Arquitectura() {
  await requireUser();
  const t = await getT();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("Arquitectura")}</h1>
          <p className="sub">{t("Todos los agentes de la app y sus procesos. Cada color es un agente; tocá un proceso para ir a su página.")}</p>
        </div>
      </div>
      <ArchTree />
    </>
  );
}
