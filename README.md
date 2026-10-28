# MechaFlow

Ordens de serviço para oficina diesel. Next.js + Supabase, PWA instalável.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencher com as chaves do Supabase de staging
npm run dev                  # http://localhost:3000
```

## Scripts

- `npm run dev`: servidor de desenvolvimento
- `npm run build` / `npm start`: build e servidor de produção
- `npm run lint`: ESLint
- `npm run icons`: gera os ícones do PWA em `public/icons/`

O service worker só é registrado em produção (`npm run build && npm start`).

Documentação do time: `../docs/`.
