import { balanceReport, marginProblems, MARGINS, standardGroups } from '../src/engine/combat/balance'
import { loadContentFromDir } from '../src/node/content'

// npm run balance [fights per class]: the balance test of roadmap M5, as a table.

const content = await loadContentFromDir(new URL('../content/base', import.meta.url).pathname)
const fights = Number(process.argv[2] ?? 1000)
const started = Date.now()
const seed = Number(process.argv.find((a) => a.startsWith('--seed='))?.slice(7) ?? 1)
const reports = balanceReport(content, fights, seed)
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5)
console.log(`Balance: ${fights} standard fights per class, levels 1-10 (${((Date.now() - started) / 1000).toFixed(1)} s)`)
console.log('class          win  fled  lost  dead  rounds   win by level 1..10')
for (const r of reports) {
  console.log(`${r.class.padEnd(14)}${pct(r.win)} ${pct(r.fled)} ${pct(r.lost)} ${pct(r.death)}  ${r.rounds.toFixed(1).padStart(5)}   ${r.byLevel.map((l) => String(Math.round(l.win * 100)).padStart(3)).join(' ')}`)
}
if (process.argv.includes('--groups')) for (let l = 1; l <= 10; l++) console.log(l, standardGroups(content, l).map((g) => `${g.count}x${g.creature}${g.elite ? `+${g.elite}` : ''}`).join(', '))
const problems = marginProblems(reports)
console.log(problems.length ? `Outside the margins:\n- ${problems.join('\n- ')}` : `Within the margins (win ${pct(MARGINS.win[0])}-${pct(MARGINS.win[1])}, death at most ${pct(MARGINS.death)}, spread ${pct(MARGINS.spread)}).`)
process.exitCode = problems.length ? 1 : 0
