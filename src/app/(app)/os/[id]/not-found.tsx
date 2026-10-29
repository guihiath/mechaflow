import { SearchX } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { EstadoVazio, Pagina } from "@/components/ui/estados";

/** OS que nao existe, de outra oficina ou que o mecanico nao ve (DESIGN §10.5). */
export default function OsNaoEncontrada() {
  return (
    <>
      <Cabecalho titulo="OS" voltar="/os" />
      <Pagina>
        <EstadoVazio
          icone={SearchX}
          titulo="OS não encontrada."
          texto="Ela não existe ou não está com você."
          acao={{ href: "/os", rotulo: "Voltar para a lista" }}
        />
      </Pagina>
    </>
  );
}
