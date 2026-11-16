"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Funnel } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";

/**
 * TurboCRM: "Funil" no cabeçalho da conversa. O "Abrir no funil" do painel
 * lateral só aparece em tela larga (no celular mora dentro da Ficha), e o
 * vendedor ia ao menu, escolhia o funil e procurava o card na mão. Aqui um
 * clique: lê o resumo do contato só quando clicado (nada a mais por conversa
 * aberta) e cai no card pelo `?lead=` que o quadro já entende.
 */
export function AbrirNoFunilNaConversa({ contactId }: { contactId: string }) {
  const t = useT();
  const [abrindo, setAbrindo] = useState(false);

  async function abrir() {
    setAbrindo(true);
    try {
      const r = await apiClient.get<{
        data: { leads: Array<{ id: string; pipeline_id: string }> };
      }>(`/api/v1/contacts/${contactId}/crm-summary`);
      // Mesmo critério do painel lateral: sem escolha explícita, o ativo é o primeiro.
      const lead = r.data.leads[0];
      if (!lead) {
        toast.info(t("Este cliente ainda não tem card no funil."));
        return;
      }
      // Navegação completa e não `useRouter`: o cabeçalho é montado em testes sem app router.
      window.location.assign(`/app/pipelines/${lead.pipeline_id}?lead=${lead.id}`);
    } catch {
      toast.error(t("Não consegui abrir o funil agora. Tente de novo."));
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1"
      disabled={abrindo}
      onClick={abrir}
      data-testid="conversa-abrir-no-funil"
      title={t("Abrir o card deste cliente no funil de vendas")}
    >
      <Funnel size={14} aria-hidden />
      {t("Funil")}
    </Button>
  );
}
