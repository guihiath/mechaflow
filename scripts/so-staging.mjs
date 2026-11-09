/**
 * Trava única dos scripts que mexem no banco (ARQUITETURA 15.11): seed, testar-staging e capturas.
 * Roda ANTES de qualquer chamada de rede e, se algo não for o staging, para com erro e nada é feito.
 *
 * Regras:
 *  - o host do Supabase tem que ser exatamente `<REF_STAGING>.supabase.co` (lista de permissão,
 *    comparação exata, nunca `includes`);
 *  - recusa `NEXT_PUBLIC_AMBIENTE=producao`, no ambiente ou no .env.local;
 *  - recusa o ref de produção e a chave secreta (sb_secret_ / service_role);
 *  - APP_URL, quando houver, não pode ser o domínio de produção.
 *
 * Os refs são públicos (aparecem na URL do Supabase): não são segredo.
 */

export const REF_STAGING = "qjzhzyzmifashtvffxdx";

/**
 * Ref do projeto `mechaflow-producao`. Preencher quando ele existir (F8-G2/F8-C4).
 * Mesmo vazio, a produção já é recusada pela lista de permissão acima; com o ref aqui,
 * a mensagem diz com todas as letras que é a PRODUÇÃO.
 */
export const REF_PRODUCAO = "";

const HOSTS_APP_PRODUCAO = ["mechaflow.com.br", "www.mechaflow.com.br", "mecaflow.com.br", "www.mecaflow.com.br", "mechaflow-seven.vercel.app"];

const NUNCA_PRODUCAO = "Este script nunca roda na PRODUÇÃO. Nada foi feito.";

function chaveEhSecreta(chave) {
  if (!chave) return false;
  if (chave.startsWith("sb_secret_")) return true;
  const corpo = chave.split(".")[1];
  if (!corpo) return false;
  try {
    return JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")).role === "service_role";
  } catch {
    return false;
  }
}

/**
 * @param {object} o
 * @param {string} o.nome        nome do script, para a mensagem
 * @param {string} o.url         NEXT_PUBLIC_SUPABASE_URL
 * @param {string} [o.chave]     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * @param {Record<string,string>} [o.envArquivo] variáveis lidas do .env.local
 * @param {string} [o.appUrl]    APP_URL, se o script abrir páginas do app
 */
export function exigirStaging({ nome, url, chave, envArquivo = {}, appUrl }) {
  const ambiente = [process.env.NEXT_PUBLIC_AMBIENTE, envArquivo.NEXT_PUBLIC_AMBIENTE].map((v) => (v ?? "").trim().toLowerCase());
  if (ambiente.includes("producao")) {
    throw new Error(`${nome}: NEXT_PUBLIC_AMBIENTE=producao. ${NUNCA_PRODUCAO}`);
  }

  let host = "";
  try {
    host = new URL(url ?? "").hostname.toLowerCase();
  } catch {
    throw new Error(`${nome}: NEXT_PUBLIC_SUPABASE_URL ausente ou inválida. Nada foi feito.`);
  }
  if (REF_PRODUCAO && host.includes(REF_PRODUCAO)) {
    throw new Error(`${nome}: a URL é a do Supabase de PRODUÇÃO (${REF_PRODUCAO}). ${NUNCA_PRODUCAO}`);
  }
  if (host !== `${REF_STAGING}.supabase.co`) {
    throw new Error(`${nome}: só roda no projeto STAGING (${REF_STAGING}.supabase.co); o endereço configurado é ${host}. Nada foi feito.`);
  }
  if (chaveEhSecreta(chave)) {
    throw new Error(`${nome}: a chave configurada é secret/service_role. Use só a publishable. Nada foi feito.`);
  }

  if (appUrl) {
    let hostApp = "";
    try {
      hostApp = new URL(appUrl).hostname.toLowerCase();
    } catch {
      throw new Error(`${nome}: APP_URL inválida. Nada foi feito.`);
    }
    if (HOSTS_APP_PRODUCAO.includes(hostApp)) {
      throw new Error(`${nome}: APP_URL aponta para a PRODUÇÃO (${hostApp}). ${NUNCA_PRODUCAO}`);
    }
  }
}
