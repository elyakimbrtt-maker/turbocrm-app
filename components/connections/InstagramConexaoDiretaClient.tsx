"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

import { ParaColar } from "./CanalOficialClient";

interface EstadoDaConexao {
  connected: boolean;
  username: string | null;
  display_name: string | null;
  status: string | null;
  has_token: boolean;
  token_expires_at: string | null;
  webhook: { callback_url: string; verify_token: string | null; fields: string[] } | null;
}

const CHAVE = ["instagram-direto"];

/**
 * "Instagram — conexão direta": a conta profissional do Instagram ligada pela
 * API da própria Meta, sem intermediário. O admin cola o token de longa duração
 * e o App Secret; o servidor valida o token antes de gravar e devolve só o que
 * precisa ser colado no app da Meta (URL de callback e verify token).
 */
export function InstagramConexaoDiretaClient() {
  const t = useT();
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: CHAVE,
    queryFn: async () => apiClient.get<{ data: EstadoDaConexao }>("/api/v1/channels/instagram"),
    staleTime: 15_000,
  });
  const conectar = useMutation({
    mutationFn: async (input: { token: string; app_secret: string }) =>
      apiClient.post<{ data: { username: string | null } }>("/api/v1/channels/instagram", input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
  const [form, setForm] = useState({ token: "", app_secret: "" });
  const estado = data?.data;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const r = await conectar.mutateAsync(form);
    toast.success(`${t("Instagram conectado:")} ${r.data.username ? `@${r.data.username}` : ""}`.trim());
    // Os segredos saem do formulário assim que gravam: nenhum deles volta num GET.
    setForm({ token: "", app_secret: "" });
  }

  if (isPending) return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;

  return (
    <div className="flex flex-col gap-4" data-testid="instagram-direto-root">
      <Card className="p-4">
        <h2 className="font-medium">{t("Instagram — conexão direta")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Direct e comentários da sua conta profissional chegam direto da Meta, sem intermediário. Cada pessoa nova vira um card em NOVO LEAD.",
          )}
        </p>
        {estado?.connected ? (
          <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="instagram-conectado">
            <span className="font-medium">
              {estado.username ? `@${estado.username}` : estado.display_name}
            </span>
            <Badge>{estado.status ?? "—"}</Badge>
            <Badge variant={estado.has_token ? "outline" : "destructive"}>
              {estado.has_token ? t("credencial guardada") : t("sem credencial")}
            </Badge>
            {estado.token_expires_at ? (
              <span className="text-xs text-muted-foreground">
                {t("Token renovado automaticamente; vence em")}{" "}
                {new Date(estado.token_expires_at).toLocaleDateString()}
              </span>
            ) : null}
          </div>
        ) : null}
      </Card>

      {estado?.webhook ? (
        <Card className="flex flex-col gap-3 p-4">
          <div>
            <h2 className="font-medium">{t("Cole isto no app da Meta")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "No produto Instagram do seu app, em Webhooks: cole a URL de callback e o token de verificação, e assine os campos abaixo. Sem esse passo nada chega ao CRM.",
              )}
            </p>
          </div>
          <ParaColar rotulo={t("URL de callback")} valor={estado.webhook.callback_url} />
          <ParaColar rotulo={t("Token de verificação")} valor={estado.webhook.verify_token} />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("Campos a assinar")}
            </span>
            <div className="flex flex-wrap gap-1">
              {estado.webhook.fields.map((f) => (
                <Badge key={f} variant="outline" className="font-mono text-xs">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="font-medium">
          {estado?.connected ? t("Trocar credencial") : t("Conectar Instagram")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "O token de longa duração e o App Secret vêm do app da Meta (produto Instagram, login do Instagram). O token é validado com o Instagram antes de ser gravado — se não valer, nada é salvo.",
          )}
        </p>
        <form onSubmit={enviar} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ig-token">{t("Token de acesso (longa duração)")}</Label>
            <Input
              id="ig-token"
              type="password"
              autoComplete="off"
              value={form.token}
              onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
              placeholder={estado?.has_token ? t("•••• (já guardado — preencha para trocar)") : "IGAA…"}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ig-secret">{t("App Secret do Instagram")}</Label>
            <Input
              id="ig-secret"
              type="password"
              autoComplete="off"
              value={form.app_secret}
              onChange={(e) => setForm((f) => ({ ...f, app_secret: e.target.value }))}
              required
            />
            <span className="text-xs text-muted-foreground">
              {t("Guardados cifrados. Não são exibidos de volta em nenhum momento.")}
            </span>
          </div>
          <Button type="submit" disabled={conectar.isPending} data-testid="btn-conectar-instagram">
            {conectar.isPending ? t("Validando com o Instagram…") : t("Validar e conectar")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
