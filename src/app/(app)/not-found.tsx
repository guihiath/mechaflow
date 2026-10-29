import { SearchX } from "lucide-react";
import { Cabecalho } from "@/components/layout/cabecalho";
import { EstadoVazio, Pagina } from "@/components/ui/estados";

/** notFound() dentro do app logado: mantem a barra de navegacao. */
export default function NaoEncontradoApp() {
  return (
    <>
      <Cabecalho titulo="Não encontrado" />
      <Pagina>
        <EstadoVazio
          icone={SearchX}
          titulo="Não encontrado"
          texto="Este cadastro não existe ou foi excluído."
          acao={{ href: "/entrar", rotulo: "Voltar ao início" }}
        />
      </Pagina>
    </>
  );
}
