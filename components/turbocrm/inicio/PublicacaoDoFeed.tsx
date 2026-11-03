"use client";

/**
 * TurboCRM — um post do feed: autor, texto, anexos, curtir e comentar.
 *
 * O post de VENDA (escrito pelo banco quando um negócio é ganho) tem cara
 * própria — troféu, valor e moldura dourada —, porque é o momento que a
 * equipe celebra junta.
 */
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import {
  useApagarPost,
  useComentar,
  useComentarios,
  useCurtir,
  useFixarPost,
  type AnexoDoFeed,
  type PessoaDoFeed,
  type PostDoFeed,
} from "@/hooks/turbocrm/useFeed";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { formatValorDoNegocio } from "@/lib/money";
import {
  ChatCircle,
  DotsThree,
  DownloadSimple,
  FileText,
  Heart,
  PaperPlaneRight,
  PushPin,
  Trash,
  Trophy,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

function quando(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
}

function Rosto({ pessoa, tamanho = "h-10 w-10" }: { pessoa: PessoaDoFeed | null; tamanho?: string }) {
  return (
    <Avatar className={cn("shrink-0", tamanho)}>
      {pessoa?.avatar_url ? <AvatarImage src={pessoa.avatar_url} alt="" /> : null}
      <AvatarFallback className="text-sm font-semibold">{iniciais(pessoa?.nome ?? "?")}</AvatarFallback>
    </Avatar>
  );
}

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Anexos({ anexos }: { anexos: AnexoDoFeed[] }) {
  const t = useT();
  const midias = anexos.filter((a) => a.kind !== "document");
  const docs = anexos.filter((a) => a.kind === "document");
  return (
    <>
      {midias.length > 0 && (
        <div className={cn("mt-3 grid gap-1.5 overflow-hidden rounded-2xl", midias.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {midias.map((m, i) =>
            m.kind === "video" ? (
              <video
                key={m.id}
                src={m.url}
                controls
                preload="metadata"
                className={cn("w-full bg-black", midias.length === 1 ? "max-h-[28rem]" : "aspect-square object-cover")}
              />
            ) : (
              <a
                key={m.id}
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className={cn("block overflow-hidden bg-surface", midias.length === 3 && i === 0 && "row-span-2")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- link assinado do Storage, fora do otimizador */}
                <img
                  src={m.url}
                  alt={m.nome}
                  loading="lazy"
                  className={cn(
                    "h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]",
                    midias.length === 1 ? "max-h-[28rem]" : "aspect-square",
                  )}
                />
              </a>
            ),
          )}
        </div>
      )}
      {docs.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {docs.map((d) => (
            <li key={d.id}>
              <a
                href={`${d.url}?baixar=1`}
                className="tcrm-arquivo-do-post group flex items-center gap-3 rounded-2xl border px-3 py-2.5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <FileText size={20} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.nome}</span>
                  <span className="text-xs text-text-muted">{tamanhoLegivel(d.tamanho)}</span>
                </span>
                <DownloadSimple size={18} className="shrink-0 text-text-muted group-hover:text-text" aria-label={t("Baixar")} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Comentarios({ postId }: { postId: string }) {
  const t = useT();
  const { data, isLoading } = useComentarios(postId, true);
  const comentar = useComentar(postId);
  const [texto, setTexto] = useState("");
  const enviar = () => {
    const limpo = texto.trim();
    if (!limpo || comentar.isPending) return;
    comentar.mutate(limpo, { onSuccess: () => setTexto("") });
  };
  return (
    <div className="mt-3 border-t border-border pt-3">
      {isLoading ? (
        <p className="text-xs text-text-muted">{t("Carregando…")}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {(data ?? []).map((c) => (
            <li key={c.id} className="flex gap-2">
              <Rosto pessoa={c.autor} tamanho="h-7 w-7" />
              <div className="min-w-0 rounded-2xl bg-surface px-3 py-2">
                <p className="text-xs font-semibold">
                  {c.autor?.nome ?? t("Alguém da equipe")}{" "}
                  <span className="font-normal text-text-muted">· {quando(c.created_at)}</span>
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          maxLength={2000}
          placeholder={t("Escreva um comentário…")}
          aria-label={t("Comentário")}
          className="tcrm-campo-publicar h-10 min-w-0 flex-1 rounded-full border px-4 text-sm outline-hidden"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!texto.trim() || comentar.isPending}
          aria-label={t("Enviar comentário")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
        >
          <PaperPlaneRight size={16} weight="fill" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function PublicacaoDoFeed({ post, indice }: { post: PostDoFeed; indice: number }) {
  const t = useT();
  const org = useActiveOrg();
  const curtir = useCurtir();
  const apagar = useApagarPost();
  const fixar = useFixarPost();
  const [comentariosAbertos, setComentariosAbertos] = useState(false);

  const gestor = org ? ROLE_RANK[org.role as Role] >= ROLE_RANK.manager : false;
  const podeApagar = post.meu || gestor;
  const venda = post.kind === "venda";
  const nome = post.autor?.nome ?? t("Alguém da equipe");

  return (
    <article
      className={cn(
        "tcrm-cartao-inicio tcrm-surgir-suave rounded-[1.75rem] border p-4",
        venda && "tcrm-post-venda",
        post.pinned && "tcrm-post-fixado",
      )}
      style={{ ["--i" as string]: Math.min(indice, 6) }}
    >
      <header className="flex items-start gap-3">
        <Rosto pessoa={post.autor} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{nome}</p>
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            {post.pinned && (
              <span className="flex items-center gap-0.5 font-medium text-accent">
                <PushPin size={12} weight="fill" aria-hidden /> {t("Fixado")} ·
              </span>
            )}
            <time dateTime={post.created_at}>{quando(post.created_at)}</time>
          </p>
        </div>
        {(podeApagar || gestor) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t("Opções da publicação")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text"
            >
              <DotsThree size={20} weight="bold" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {gestor && (
                <DropdownMenuItem onSelect={() => fixar.mutate({ postId: post.id, pinned: !post.pinned })}>
                  <PushPin size={14} aria-hidden /> {post.pinned ? t("Desafixar") : t("Fixar no topo")}
                </DropdownMenuItem>
              )}
              {podeApagar && (
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={() => {
                    if (window.confirm(t("Apagar esta publicação?"))) apagar.mutate(post.id);
                  }}
                >
                  <Trash size={14} aria-hidden /> {t("Apagar")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {venda ? (
        <div className="tcrm-faixa-venda mt-3 flex items-center gap-3 rounded-2xl px-4 py-3">
          <span className="tcrm-trofeu flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
            <Trophy size={22} weight="fill" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">{t("Venda fechada!")} 🎉</p>
            <p className="truncate text-sm text-text-muted">{post.body}</p>
          </div>
          {post.venda?.value_cents ? (
            <span className="ml-auto shrink-0 text-base font-black tabular-nums">
              {formatValorDoNegocio(post.venda.value_cents, post.venda.currency, { semCentavos: true })}
            </span>
          ) : null}
        </div>
      ) : (
        post.body && <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{post.body}</p>
      )}

      <Anexos anexos={post.anexos} />

      <footer className="mt-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => curtir.mutate(post.id)}
          aria-pressed={post.curti}
          className={cn("tcrm-acao-post flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium", post.curti && "tcrm-curtido")}
        >
          <Heart size={18} weight={post.curti ? "fill" : "regular"} aria-hidden />
          <span className="tabular-nums">{post.curtidas > 0 ? post.curtidas : t("Curtir")}</span>
        </button>
        <button
          type="button"
          onClick={() => setComentariosAbertos((v) => !v)}
          aria-expanded={comentariosAbertos}
          className="tcrm-acao-post flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium"
        >
          <ChatCircle size={18} aria-hidden />
          <span className="tabular-nums">{post.comentarios > 0 ? post.comentarios : t("Comentar")}</span>
        </button>
      </footer>

      {comentariosAbertos && <Comentarios postId={post.id} />}
    </article>
  );
}
