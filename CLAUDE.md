# MechaFlow: regras do projeto

Sistema de ordens de serviço para oficinas diesel. Next.js (App Router) + TypeScript + Tailwind + Supabase, PWA.

@AGENTS.md

## Antes de trabalhar
- Ler `../docs/CONTEXTO.md`, `../docs/PLANO.md` e, se existirem, `../docs/ARQUITETURA.md` e `../docs/DESIGN.md`.
- Ao terminar, atualizar `../docs/CONTEXTO.md`.

## Regras
- **Interface em português (pt-BR)**: textos, mensagens de erro, rótulos.
- **Mobile-first**: começar pelo celular; botões grandes (mín. 48px de altura), poucos campos por tela, funcionar com internet ruim.
- **Dinheiro em centavos**: inteiros (`bigint`/`integer`) no banco e no código; formatar só na tela (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`).
- **Datas em UTC**: gravar `timestamptz` em UTC; converter para `America/Sao_Paulo` só na exibição.
- **RLS sempre**: toda tabela nova nasce com RLS ativado e políticas por oficina. Sem exceção.
- **Sem segredos no código**: chaves em `.env.local` / Vercel. Modelo em `.env.example`. Nunca usar a chave secret/service_role no navegador.
- Supabase: usar `@/lib/supabase/server` (servidor) e `@/lib/supabase/client` (navegador).
- Cor primária e tokens em `src/app/globals.css`; constantes de marca em `src/lib/brand.ts`. Ícones: `npm run icons`.
- Service worker (`public/sw.js`): nunca cachear `/api`, `/auth` nem páginas com dados da oficina.
- Antes de entregar: `npm run lint` e `npm run build` sem erro.
- Perguntar antes de apagar arquivos, rodar migração em produção ou fazer deploy.
