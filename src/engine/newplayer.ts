import type { Content, Quest } from './content'
import { Engine } from './engine'
import type { LlmClient } from './dialogue/llm'
import { questlog } from './quests/engine'

// Every quest played as a new player (M10.33 AE). The playtest played the
// Quiet Reach's main line only, and typed the magic words of its deeds word
// for word, so it passed by construction; the small quests were never
// played. Here a quest is played with nothing but its Now lines: at each
// stage the player goes to the place of the deed (a shortcut for distance,
// marked), brings its person along (the same), and types the Now line as it
// stands. A stage that does not move on is where a new player would be stuck.

export interface StageRun {
  stage: string
  now?: string
  /** What was typed, and the shortcuts before it. */
  steps: string[]
  moved: boolean
  why?: string
}

/** The actions that move a stage on: those that set a flag its way on waits for. */
function movers(q: Quest, stage: NonNullable<Quest['stages']>[number]) {
  const flags = stage.next.flatMap((n) => n.when.flatMap((c) => ('flag' in c ? [c.flag] : [])))
  return (q.actions ?? []).filter((a) => a.effects.some((e) => 'set' in e && flags.includes((e as { set: string }).set)))
}

/** Plays one quest by its Now lines from a new game; one row per stage it reached. */
export async function playByNow(content: Content, id: string, llm?: LlmClient, seed = 7): Promise<StageRun[]> {
  const quest = content.quests.get(id)
  if (!quest?.stages?.length) return []
  const engine = new Engine(content, { seed, builder: true, ...(llm ? { llm } : {}) })
  engine.start()
  await engine.handle(`@quest ${id}`)
  const runs: StageRun[] = []
  for (let turn = 0; turn < quest.stages.length + 1; turn++) {
    const state = questlog(engine.world)[id]
    if (!state || state.outcome || state.ended) break
    const stage = quest.stages.find((s) => s.id === state.stage)
    if (!stage || !stage.next.length) break
    const deeds = movers(quest, stage).filter((a) => a.say.length)
    const steps: string[] = []
    // A stage that moves on by what happens (a talk, a thing brought, a day gone) has no deed to type: nothing to test.
    if (!deeds.length) break
    if (!stage.goal?.trim()) {
      runs.push({ stage: stage.id, steps, moved: false, why: 'no Now line' })
      break
    }
    // Where the deed is done, and with whom: shortcuts for distance and time, never for what to type.
    const deed = deeds[0]
    const place = deed?.at[0]
    if (place && content.locations.has(place)) steps.push(`@goto ${place}`)
    if (deed?.with) steps.push(`@bring ${deed.with}`)
    for (const step of steps) await engine.handle(step)
    const typed = stage.goal.trim().replace(/[.!]+$/, '')
    const movedOn = () => {
      const now = questlog(engine.world)[id]
      return Boolean(now && (now.stage !== stage.id || now.outcome || now.ended))
    }
    // As a new player would: told "not yet" (by daylight, the door shut), wait an hour and try again, up to a day;
    // a check failed, try again, a few times.
    let waits = 0
    let fails = 0
    while (!movedOn()) {
      steps.push(typed)
      const said = (await engine.handle(typed)).map((o) => o.text).join('\n')
      if (engine.state.talk) {
        steps.push('bye')
        await engine.handle('bye')
      }
      await engine.runModels()
      if (movedOn()) break
      const notYet = deeds.some((a) => a.not_yet && said.includes(a.not_yet))
      const failed = deeds.some((a) => a.fail_text && said.includes(a.fail_text))
      if (notYet && waits++ < 24) {
        steps.push('wait 60')
        await engine.handle('wait 60')
      } else if (!(failed && fails++ < 5)) break
    }
    const moved = movedOn()
    runs.push({ stage: stage.id, now: stage.goal, steps, moved, ...(moved ? {} : { why: 'the Now line typed as it stands does not do the deed' }) })
    if (!moved) break
  }
  return runs
}

/** Every quest of a world played by its Now lines: the rows of the stages that do not move on, by quest. */
export async function stuckQuests(content: Content, llm?: LlmClient): Promise<{ quest: string; runs: StageRun[] }[]> {
  const out: { quest: string; runs: StageRun[] }[] = []
  for (const q of content.quests.values()) {
    const runs = await playByNow(content, q.id, llm)
    out.push({ quest: q.id, runs })
  }
  return out
}
