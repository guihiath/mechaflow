/**
 * Tema claro/escuro. O app grava o tema em data-tema no <html>.
 * Padrao: claro. Escuro se o celular estiver em modo escuro, ou se o usuario
 * escolher em "Conta" (escolha manual fica no localStorage, chave TEMA_STORAGE_KEY).
 */
export const TEMA_STORAGE_KEY = "mf-tema";

export type Tema = "claro" | "escuro";

/**
 * Script inline que roda no <head> antes da primeira pintura (sem flash).
 * Sem escolha manual salva, tambem acompanha a troca de modo do celular.
 */
export const temaInlineScript = `(function(){
var d=document.documentElement,k=${JSON.stringify(TEMA_STORAGE_KEY)};
function salvo(){try{var t=localStorage.getItem(k);return t==="claro"||t==="escuro"?t:null}catch(e){return null}}
var m=window.matchMedia?window.matchMedia("(prefers-color-scheme: dark)"):null;
function aplicar(){d.setAttribute("data-tema",salvo()||(m&&m.matches?"escuro":"claro"))}
aplicar();
if(m){var f=function(){if(!salvo())aplicar()};if(m.addEventListener)m.addEventListener("change",f);else if(m.addListener)m.addListener(f)}
})()`;
