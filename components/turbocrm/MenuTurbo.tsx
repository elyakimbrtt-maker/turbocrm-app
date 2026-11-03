"use client";

/**
 * O menu lateral do TurboCRM (Figma "TurboCRM · Inbox", nó 7:1429).
 *
 * Três grupos fixos — Atendimento, Comercial e Gestão — e um "Mais" recolhível
 * com todo o resto que a pessoa pode abrir. Quem decide O QUE a pessoa vê
 * continua sendo o produto: `destinosDaInterface` (papel, módulos, áreas da
 * organização) e `sidebarGroups` (o que sobe ao menu). Este arquivo só reagrupa
 * e renomeia; um destino fora do alcance do papel nunca aparece aqui.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition, type ComponentType } from "react";

import { toggleSidebar } from "@/app/actions/shell/toggleSidebar";
import { LogotipoDoProduto, SimboloDoProduto } from "@/components/branding/MarcaDoProduto";
import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { ContadorDeCasos } from "@/components/shell/ContadorDeCasos";
import { UserMenu } from "@/components/shell/UserMenu";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { usePrefetchPorIntencao } from "@/hooks/navigation/prefetchPorIntencao";
import { marcaEhADoProduto } from "@/lib/branding";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { sidebarGroups } from "@/lib/navigation/registry";
import {
  CalendarBlank,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretDown,
  ChartLineUp,
  DotsThree,
  Funnel,
  Gear,
  House,
  IdentificationCard,
  Inbox,
  Lightning,
  PuzzlePiece,
  SquaresFour,
  UsersThree,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

type Icone = ComponentType<{ size?: number; weight?: "regular" | "fill"; "aria-hidden"?: boolean }>;

interface ItemTurbo {
  href: string;
  rotulo: string;
  icone: Icone;
  contador?: "fila" | "casos";
  saude?: boolean;
  /** Aparece para todo mundo, sem depender da interface da organização. */
  sempre?: boolean;
}

interface GrupoTurbo {
  id: string;
  rotulo: string;
  itens: ItemTurbo[];
}

/** A ordem e os nomes do Figma. Cada `href` é uma tela que já existe. */
const GRUPOS_TURBO: GrupoTurbo[] = [
  {
    // A página Início (feed + ranking) é de todos: vendedor e gestor.
    id: "inicio",
    rotulo: "Equipe",
    itens: [{ href: "/app/inicio", rotulo: "Início", icone: House, sempre: true }],
  },
  {
    id: "atendimento",
    rotulo: "Atendimento",
    itens: [
      { href: "/app/inbox", rotulo: "Inbox", icone: Inbox, contador: "fila" },
      { href: "/app/contacts", rotulo: "Contatos", icone: IdentificationCard },
    ],
  },
  {
    id: "comercial",
    rotulo: "Comercial",
    itens: [
      { href: "/app/metrics", rotulo: "Dashboard", icone: SquaresFour },
      { href: "/app/kanban", rotulo: "Funil de vendas", icone: Funnel },
      { href: "/app/agenda", rotulo: "Agenda", icone: CalendarBlank },
      { href: "/app/analise", rotulo: "Relatórios", icone: ChartLineUp },
    ],
  },
  {
    id: "gestao",
    rotulo: "Gestão",
    itens: [
      { href: "/app/settings/automacoes", rotulo: "Automações", icone: Lightning },
      { href: "/app/team", rotulo: "Equipe", icone: UsersThree },
      { href: "/app/connections", rotulo: "Integrações", icone: PuzzlePiece, saude: true },
      { href: "/app/settings", rotulo: "Configurações", icone: Gear },
    ],
  },
];

const HREFS_FIXOS = new Set(GRUPOS_TURBO.flatMap((g) => g.itens.map((i) => i.href)));
/** A Ajuda mora no botão (?) da barra do topo. */
const FORA_DO_MAIS = new Set(["/app/ajuda"]);
const CHAVE_MAIS_ABERTO = "turbocrm-menu-mais-aberto";

function ativo(pathname: string, href: string) {
  if (href === "/app/settings") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MenuTurbo({
  collapsed,
  showCollapseControl = true,
  onNavigate,
}: {
  collapsed: boolean;
  showCollapseControl?: boolean;
  onNavigate?: () => void;
}) {
  const t = useT();
  const pathname = usePathname();
  const intencao = usePrefetchPorIntencao();
  const [isPending, startTransition] = useTransition();
  const { user, activeOrg } = useAuth();
  const brand = useMarcaDaInstalacao();

  const plataforma = user.is_platform_admin && !user.support;
  const papel = activeOrg?.role ?? null;
  const modulos = activeOrg?.modulos_ligados ?? [];
  const capacidades = activeOrg?.capacidades_ligadas ?? [];

  const visiveis = new Set(
    destinosDaInterface(activeOrg?.interface_settings, plataforma, papel, modulos, capacidades).map(
      (d) => d.href,
    ),
  );
  // Configurações é o hub do grupo da organização: a regra de quem o vê é a
  // mesma do menu original (o hub aparece quando o grupo tem algum destino).
  const doMenuOriginal = sidebarGroups(
    plataforma,
    papel,
    activeOrg?.interface_settings,
    modulos,
    capacidades,
  );
  for (const g of doMenuOriginal) if (g.group.hub) visiveis.add(g.group.hub.href);

  const grupos = GRUPOS_TURBO.map((g) => ({
    ...g,
    itens: g.itens.filter((i) => i.sempre || visiveis.has(i.href)),
  })).filter((g) => g.itens.length > 0);

  // "Mais": tudo o que o menu original mostraria (destinos e hubs "Ver tudo"),
  // menos o que já está nos três grupos de cima.
  const mais: ItemTurbo[] = [];
  const vistos = new Set<string>();
  for (const { group, items } of doMenuOriginal) {
    const candidatos = [
      ...items.map((d) => ({
        href: d.href,
        rotulo: d.label,
        icone: d.icon as Icone,
        contador: d.contador === "casos" ? ("casos" as const) : undefined,
        saude: !!d.healthDot,
      })),
      ...(group.hub ? [{ href: group.hub.href, rotulo: group.hub.label, icone: DotsThree as Icone }] : []),
    ];
    for (const c of candidatos) {
      if (HREFS_FIXOS.has(c.href) || FORA_DO_MAIS.has(c.href) || vistos.has(c.href)) continue;
      vistos.add(c.href);
      mais.push(c);
    }
  }

  const [maisAberto, setMaisAberto] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência do navegador, lida depois do mount (mesmo padrão do menu original)
      if (window.localStorage.getItem(CHAVE_MAIS_ABERTO) === "1") setMaisAberto(true);
    } catch {
      // Storage bloqueado: o "Mais" começa fechado.
    }
  }, []);
  const maisTemAtivo = mais.some((i) => ativo(pathname, i.href));
  const mostrarMais = maisAberto || maisTemAtivo;
  function alternarMais() {
    setMaisAberto((antes) => {
      const depois = !antes;
      try {
        window.localStorage.setItem(CHAVE_MAIS_ABERTO, depois ? "1" : "0");
      } catch {
        // Vale só nesta sessão.
      }
      return depois;
    });
  }

  // Logo: o mesmo par claro/escuro do menu original.
  const nome = activeOrg?.marca?.nome ?? brand.name;
  const logo = activeOrg?.marca?.logoUrl || brand.logoUrl;
  const logoEscuro =
    activeOrg?.marca?.logoDarkUrl !== undefined
      ? activeOrg.marca.logoDarkUrl
      : activeOrg?.marca?.logoUrl
        ? null
        : brand.logoDarkUrl;
  const marcaDoProduto = marcaEhADoProduto({ name: nome, logoUrl: logo ?? null });

  function renderItem(item: ItemTurbo) {
    const estaAtivo = ativo(pathname, item.href);
    const Icone = item.icone;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          {...intencao(item.href)}
          title={collapsed ? t(item.rotulo) : undefined}
          aria-current={estaAtivo ? "page" : undefined}
          onClick={onNavigate}
          data-ativo={estaAtivo ? "" : undefined}
          className={cn(
            "tcrm-menu-item relative flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm",
            collapsed && "justify-center px-0",
          )}
        >
          <Icone size={19} weight={estaAtivo ? "fill" : "regular"} aria-hidden />
          {!collapsed && <span className="truncate">{t(item.rotulo)}</span>}
          {item.saude && (
            <ConnectionHealthDot className={cn(collapsed ? "absolute top-2 right-2" : "ml-auto")} />
          )}
          {item.contador === "fila" && <ContadorDaFila compacto={collapsed} />}
          {item.contador === "casos" && <ContadorDeCasos compacto={collapsed} />}
        </Link>
      </li>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex items-center px-4 pt-6 pb-5", collapsed ? "justify-center" : "justify-center")}>
        {(logo || logoEscuro) && !collapsed ? (
          <>
            {/* <img> e não next/image: a URL vem de quem hospeda (ver o menu original). */}
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={nome}
                className={cn("h-12 w-auto max-w-[11.5rem] object-contain", logoEscuro && "dark:hidden")}
              />
            ) : null}
            {logoEscuro ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoEscuro}
                alt={nome}
                className="hidden h-12 w-auto max-w-[11.5rem] object-contain dark:block"
              />
            ) : null}
          </>
        ) : marcaDoProduto ? (
          collapsed ? (
            <SimboloDoProduto nome={nome} className="h-8 w-8" />
          ) : (
            <LogotipoDoProduto nome={nome} className="h-9 w-auto" />
          )
        ) : (
          <span className="truncate text-lg font-bold" title={nome}>
            {collapsed ? ([...nome][0]?.toUpperCase() ?? brand.initial) : nome}
          </span>
        )}
      </div>

      <nav
        aria-label={t("Navegação principal")}
        className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4"
      >
        {grupos.map((g) => (
          <div key={g.id}>
            {collapsed ? (
              <div aria-hidden className="mx-2 mb-2 border-t border-border first:hidden" />
            ) : (
              <h2 className="mb-2 px-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                {t(g.rotulo)}
              </h2>
            )}
            <ul className="space-y-1" aria-label={collapsed ? t(g.rotulo) : undefined}>
              {g.itens.map(renderItem)}
            </ul>
          </div>
        ))}

        {mais.length > 0 && (
          <div>
            {collapsed ? (
              <div aria-hidden className="mx-2 mb-2 border-t border-border" />
            ) : null}
            <button
              type="button"
              onClick={alternarMais}
              aria-expanded={mostrarMais}
              title={collapsed ? t("Mais") : undefined}
              className={cn(
                "tcrm-menu-item flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-sm",
                collapsed && "justify-center px-0",
              )}
            >
              <DotsThree size={19} weight="regular" aria-hidden />
              {!collapsed && <span className="truncate">{t("Mais")}</span>}
              {!collapsed && (
                <CaretDown
                  size={12}
                  aria-hidden
                  className={cn("ml-auto transition-transform", !mostrarMais && "-rotate-90")}
                />
              )}
            </button>
            {mostrarMais && <ul className="mt-1 space-y-1">{mais.map(renderItem)}</ul>}
          </div>
        )}
      </nav>

      <div className="space-y-3 px-4 pt-2 pb-4">
        {showCollapseControl && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => toggleSidebar(collapsed))}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? t("Expandir menu") : t("Recolher menu")}
          >
            {collapsed ? (
              <CaretDoubleRight size={16} aria-hidden />
            ) : (
              <CaretDoubleLeft size={16} aria-hidden />
            )}
            {!collapsed && <span>{t("Recolher menu")}</span>}
          </button>
        )}
        <UserMenu variante="cartao" compacto={collapsed} />
      </div>
    </div>
  );
}
