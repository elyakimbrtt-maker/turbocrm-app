"use client";

/**
 * TurboCRM — o campo "No que você está pensando?" do feed.
 *
 * Texto + até 6 arquivos (foto, vídeo ou documento). As prévias aparecem antes
 * de publicar, cada uma com o X para tirar. Ctrl/⌘+Enter publica.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { usePublicar } from "@/hooks/turbocrm/useFeed";
import { FileText, ImageSquare, PaperPlaneRight, Paperclip, X } from "@/lib/ui/icons";

const ACEITA_MIDIA = "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime";
const ACEITA_DOC = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

export function NovaPublicacao() {
  const t = useT();
  const user = useUser();
  const publicar = usePublicar();
  const [texto, setTexto] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const midia = useRef<HTMLInputElement>(null);
  const doc = useRef<HTMLInputElement>(null);

  const previas = useMemo(
    () => arquivos.map((a) => ({ arquivo: a, url: a.type.startsWith("image/") || a.type.startsWith("video/") ? URL.createObjectURL(a) : null })),
    [arquivos],
  );
  useEffect(() => () => previas.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previas]);

  const nome = user.full_name ?? user.email ?? "";
  const vazio = !texto.trim() && arquivos.length === 0;

  function anexar(lista: FileList | null) {
    if (!lista) return;
    const novos = [...arquivos, ...Array.from(lista)];
    if (novos.length > 6) toast.message(t("Até 6 arquivos por publicação."));
    setArquivos(novos.slice(0, 6));
  }

  function enviar() {
    if (vazio || publicar.isPending) return;
    publicar.mutate(
      { texto, arquivos },
      {
        onSuccess: () => {
          setTexto("");
          setArquivos([]);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : t("Não consegui publicar.")),
      },
    );
  }

  return (
    <section className="tcrm-cartao-inicio rounded-[1.75rem] border p-4" aria-label={t("Nova publicação")}>
      <div className="flex gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-sm font-semibold">{nome.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar();
          }}
          maxLength={5000}
          rows={texto ? 3 : 2}
          placeholder={t("Compartilhe uma novidade, uma meta batida, um recado para a equipe…")}
          aria-label={t("Texto da publicação")}
          className="tcrm-campo-publicar min-h-12 w-full resize-none rounded-2xl border px-4 py-3 text-sm outline-hidden transition-[height]"
        />
      </div>

      {previas.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {previas.map(({ arquivo, url }, i) => (
            <li key={`${arquivo.name}-${i}`} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-surface">
              {url && arquivo.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:), não passa pelo otimizador
                <img src={url} alt={arquivo.name} className="h-full w-full object-cover" />
              ) : url ? (
                <video src={url} className="h-full w-full object-cover" muted />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center">
                  <FileText size={22} aria-hidden />
                  <span className="line-clamp-2 text-[10px] text-text-muted">{arquivo.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}
                aria-label={`${t("Tirar")} ${arquivo.name}`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X size={12} weight="bold" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-1 pl-[3.25rem]">
        <input ref={midia} type="file" accept={ACEITA_MIDIA} multiple hidden onChange={(e) => { anexar(e.target.files); e.target.value = ""; }} />
        <input ref={doc} type="file" accept={ACEITA_DOC} multiple hidden onChange={(e) => { anexar(e.target.files); e.target.value = ""; }} />
        <button
          type="button"
          onClick={() => midia.current?.click()}
          className="tcrm-botao-anexo flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
        >
          <ImageSquare size={16} aria-hidden /> {t("Foto ou vídeo")}
        </button>
        <button
          type="button"
          onClick={() => doc.current?.click()}
          className="tcrm-botao-anexo flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
        >
          <Paperclip size={16} aria-hidden /> {t("Documento")}
        </button>
        <Button
          type="button"
          onClick={enviar}
          disabled={vazio || publicar.isPending}
          className="ml-auto h-9 gap-1.5 rounded-full px-4"
        >
          <PaperPlaneRight size={15} weight="fill" aria-hidden />
          {publicar.isPending ? t("Publicando…") : t("Publicar")}
        </Button>
      </div>
    </section>
  );
}
