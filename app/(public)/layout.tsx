import { LogotipoDoProduto } from "@/components/branding/MarcaDoProduto";
import { marcaEhADoProduto } from "@/lib/branding";
import { marcaDaSaida } from "@/lib/branding/saida";
import { createClient } from "@/lib/supabase/server";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { ShieldCheck } from "@/lib/ui/icons";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";

/**
 * A casca das telas de acesso — login, cadastro, recuperação, MFA, confirmar acesso.
 *
 * ── Por que o LOGO mora aqui, e não em `login/page.tsx` ───────────────────────
 *
 * São sete telas no grupo `(public)`, e todas são "antes de entrar": quem instala
 * o produto para clientes mostra a marca dele exatamente aí. Um `<img>` por
 * página seriam sete cópias que divergem na primeira vez que alguém mexer numa
 * só — e a que ficaria para trás é sempre a que ninguém abre (recuperação de
 * senha, cadastro de MFA), que é justamente onde o cliente do revendedor
 * aparece sozinho e sem contexto.
 *
 * ── Por que `marcaDaSaida(null)` ──────────────────────────────────────────────
 *
 * Aqui não existe organização resolvida: `null` é a declaração disso, e a pilha
 * resultante é a mesma do layout raiz (banco acima, `.env` embaixo). Montar a
 * pilha à mão nesta tela faria a fachada anunciar uma precedência que o resto do
 * produto não usa. E `marcaDaSaida` NUNCA lança (ver o cabeçalho dela): uma cor
 * ou um logo mal gravados não podem derrubar a única tela por onde se entra para
 * corrigi-los.
 *
 * Sem logo configurado E com o nome padrão, a fachada mostra o logotipo do
 * PRODUTO (`components/branding/MarcaDoProduto.tsx`) — inline, sem `<img>`,
 * para que `tests/e2e/marca-logo.spec.ts` continue medindo "a fachada está sem
 * `<img>`" como "sem logo do revendedor".
 *
 * O conteúdo de cada página resolve o próprio nome. A tela de login usa
 * `marcaDaSaida(null)`, como o título da aba, para que a marca alterada pela
 * instalação apareça também sob o botão "Entrar"; a casca usa a mesma resolução
 * para logo e tema.
 *
 * Com o login e a aba na MESMA pilha, `tests/e2e/icone-da-marca.spec.ts` deixou
 * de cruzar duas resoluções independentes: ele só prova que as duas concordam.
 * O que ancora o nome numa verdade de fora da pilha é o caso "o nome trocado em
 * /admin/marca…" de `tests/e2e/marca-logo.spec.ts`, que digita o nome na tela e
 * o confere no login de quem não entrou. Não apague um sem o outro.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const marca = await marcaDaSaida(null);
  // A maioria destas telas roda ANTES do login (não há usuário nenhum), mas
  // duas — `/login/mfa` e, em parte, `/login/recovery` — rodam com uma sessão
  // parcial já criada (primeiro fator verificado, segundo pendente). Onde há
  // sessão, o idioma salvo no perfil vale; sem ela, o do navegador (Accept-Language),
  // pela MESMA função das páginas (`idiomaDoVisitante`). Com o perfil só, quem chegava
  // sem sessão via o servidor no idioma do navegador e os formulários do cliente
  // (cadastro, login, senha) no padrão pt-BR do provider.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await idiomaDoVisitante((user?.user_metadata?.locale as string | undefined) ?? null);

  // TurboCRM: a fachada é sempre escura (desenho do Figma "Login por convite"),
  // então o logo preferido é o da aparência escura; sem ele, o claro.
  const logoDaFachada = marca.logoDarkUrl ?? marca.logoUrl;
  const ano = new Date().getFullYear();

  return (
    <IdiomaProvider locale={locale}>
      <div data-theme="dark" className="tcrm-acesso relative flex min-h-dvh overflow-hidden">
        {/* Faixas de velocidade nos cantos — desenho, sem conteúdo. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-[220px] w-[228px]"
          viewBox="0 0 228 220"
        >
          <polygon points="0,0 72,0 0,117" fill="#ff0a14" />
          <polygon points="128,0 146,0 18,220 0,220" fill="#4a0a0d" />
          <polygon points="206,0 228,0 92,220 72,220" fill="#4a0a0d" />
        </svg>
        <svg
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 h-[152px] w-[390px]"
          viewBox="0 0 390 152"
        >
          <polygon points="0,0 0,34 312,152 390,152" fill="#ff0a14" />
          <polygon points="0,60 0,78 205,152 236,152" fill="#ff0a14" />
        </svg>

        <main className="relative z-10 flex w-full items-center justify-center p-4 sm:p-8 lg:w-[44%] lg:shrink-0 lg:p-10">
          <div className="tcrm-acesso-painel flex w-full max-w-[36rem] flex-col rounded-[1.75rem] px-6 py-10 sm:px-12 sm:py-14">
            {logoDaFachada ? (
              <div className="mb-10 flex justify-center">
                {/*
                  <img> e não next/image: a URL é de quem hospeda e o next/image
                  exige a lista de domínios fechada no build (ver a barra lateral).
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-testid={marca.logoDarkUrl ? "logo-escuro-da-fachada" : "logo-da-fachada"}
                  src={logoDaFachada}
                  alt={marca.nome}
                  className="h-auto max-h-24 w-auto max-w-[20rem] object-contain"
                />
              </div>
            ) : marcaEhADoProduto({ name: marca.nome, logoUrl: null }) ? (
              <div className="mb-10 flex justify-center">
                <LogotipoDoProduto nome={marca.nome} className="h-12 w-auto" />
              </div>
            ) : (
              <p className="mb-10 text-center text-2xl font-bold">{marca.nome}</p>
            )}
            <div className="space-y-6">{children}</div>
            <footer className="mt-12 flex items-center justify-between gap-4 text-xs text-text-muted">
              <span>
                © {ano} {marca.nome}
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={16} aria-hidden />
                Seus dados seguros
              </span>
            </footer>
          </div>
        </main>

        {/* Composição do Figma: moto, chamada e o painel no tablet. */}
        <aside aria-hidden className="relative hidden flex-1 lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/turbocrm/login-hero.webp"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-left"
          />
        </aside>
      </div>
    </IdiomaProvider>
  );
}
