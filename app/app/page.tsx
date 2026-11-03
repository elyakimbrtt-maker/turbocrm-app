import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { homeDaInterface } from "@/lib/navigation/interface";
export default async function AppHome() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  // TurboCRM: quem pertence a uma empresa começa pela página Início (feed e
  // ranking da equipe). O super-admin sem empresa segue a regra de sempre.
  if (org) redirect("/app/inicio");
  redirect(
    homeDaInterface(
      null,
      user.is_platform_admin && !user.support,
      null,
    ),
  );
}
