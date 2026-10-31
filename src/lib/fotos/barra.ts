/**
 * Ponte entre o "Tirar foto" da barra do mecânico (DESIGN §11.2) e a seção Fotos da OS.
 *
 * A barra tem o próprio `<input type="file" capture>` (o Safari só abre a câmera se o toque
 * for direto num input/label, nunca por `input.click()` depois de um await). Os arquivos
 * escolhidos vêm para cá e a seção Fotos os põe na fila (mesmo caminho dos botões dela).
 * Se a seção ainda estiver carregando (Suspense), os arquivos esperam aqui até ela ouvir.
 *
 * A seção também publica se a OS chegou ao limite de fotos: a barra desabilita o botão.
 */

type Ouvinte = (arquivos: File[]) => void;

const ouvintes = new Map<string, Ouvinte>();
const esperando = new Map<string, File[]>();

/** A barra entrega os arquivos escolhidos para a seção Fotos da OS. */
export function entregarFotosDaBarra(osId: string, arquivos: File[]) {
  if (!arquivos.length) return;
  const f = ouvintes.get(osId);
  if (f) f(arquivos);
  else esperando.set(osId, [...(esperando.get(osId) ?? []), ...arquivos]);
}

/** A seção Fotos ouve a barra; devolve a função de parar. */
export function ouvirFotosDaBarra(osId: string, f: Ouvinte) {
  ouvintes.set(osId, f);
  const ja = esperando.get(osId);
  if (ja) {
    esperando.delete(osId);
    f(ja);
  }
  return () => {
    if (ouvintes.get(osId) === f) ouvintes.delete(osId);
  };
}

// ------------------------------------------------------------ limite (cheio) por OS

const cheias = new Map<string, boolean>();
const ouvintesCheia = new Set<() => void>();

export function publicarOSCheia(osId: string, cheia: boolean) {
  if ((cheias.get(osId) ?? false) === cheia) return;
  cheias.set(osId, cheia);
  for (const f of ouvintesCheia) f();
}

export function assinarOSCheia(f: () => void) {
  ouvintesCheia.add(f);
  return () => {
    ouvintesCheia.delete(f);
  };
}

export const osCheia = (osId: string) => cheias.get(osId) ?? false;
