// Mês padrão do painel com relógio fixo (PLANO §20.4, fuso; F7-B4).
// Roda sem banco: `node scripts/testar-mes-padrao.mjs` (Node 22.18+ lê o .ts direto).
// Força o processo em UTC, como o servidor da Vercel, para provar que a conta não usa o fuso dele.
process.env.TZ = "UTC";

const { mesAtualEmSaoPaulo, diaEmSaoPaulo } = await import("../src/lib/painel.ts");

// [descrição, instante em UTC, mês esperado, dia esperado em São Paulo]
const CASOS = [
  ["31/10 21:00 SP (01/11 00:00 UTC)", "2026-11-01T00:00:00Z", "2026-10", "2026-10-31"],
  ["31/10 23:30 SP (01/11 02:30 UTC)", "2026-11-01T02:30:00Z", "2026-10", "2026-10-31"],
  ["31/10 23:59 SP (01/11 02:59 UTC)", "2026-11-01T02:59:59Z", "2026-10", "2026-10-31"],
  ["01/11 00:30 SP (01/11 03:30 UTC)", "2026-11-01T03:30:00Z", "2026-11", "2026-11-01"],
  ["30/11 22:00 SP (01/12 01:00 UTC)", "2026-12-01T01:00:00Z", "2026-11", "2026-11-30"],
  ["31/12 23:30 SP (01/01 02:30 UTC)", "2027-01-01T02:30:00Z", "2026-12", "2026-12-31"],
  ["01/01 00:00 SP (01/01 03:00 UTC)", "2027-01-01T03:00:00Z", "2027-01", "2027-01-01"],
];

let falhas = 0;
for (const [nome, iso, mes, dia] of CASOS) {
  const agora = new Date(iso);
  const m = mesAtualEmSaoPaulo(agora);
  const d = diaEmSaoPaulo(agora);
  const ok = m === mes && d === dia;
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: mês ${m} (esperado ${mes}), dia ${d} (esperado ${dia}); servidor em UTC diria ${iso.slice(0, 7)}`);
}
console.log(falhas ? `${falhas} falha(s)` : "MES PADRAO OK");
process.exit(falhas ? 1 : 0);
