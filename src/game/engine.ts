import type { NightAction, Player, Room, Team } from "../types";
import { ROLE_TEAM } from "./roles";

// 페이즈별 제한 시간(ms)
export const PHASE_MS = {
  night: 30_000,
  day: 40_000,
  vote: 30_000,
} as const;

export function alivePlayers(room: Room): Player[] {
  return Object.values(room.players ?? {}).filter((p) => p.alive);
}

function aliveByRole(room: Room, role: Player["role"]): Player[] {
  return alivePlayers(room).filter((p) => p.role === role);
}

// 살아있는 플레이어 중 마피아/시민 진영 수
export function teamCounts(room: Room) {
  let mafia = 0;
  let citizen = 0;
  for (const p of alivePlayers(room)) {
    if (p.role && ROLE_TEAM[p.role] === "mafia") mafia++;
    else citizen++;
  }
  return { mafia, citizen };
}

// 승리 판정. 결판 안 났으면 null
export function checkWinner(room: Room): Team | null {
  const { mafia, citizen } = teamCounts(room);
  if (mafia === 0) return "citizen";
  if (mafia >= citizen) return "mafia";
  return null;
}

// 다수결 집계(동률이면 null). id 기준 결정적 처리.
function tally(targets: string[]): string | null {
  if (targets.length === 0) return null;
  const counts = new Map<string, number>();
  for (const t of targets) counts.set(t, (counts.get(t) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  let tie = false;
  // 결정적 순서를 위해 키를 정렬
  for (const key of [...counts.keys()].sort()) {
    const n = counts.get(key)!;
    if (n > bestN) {
      bestN = n;
      best = key;
      tie = false;
    } else if (n === bestN) {
      tie = true;
    }
  }
  return tie ? null : best;
}

// 밤 결과 계산 → 사망자 id (없으면 null)
export function resolveNight(room: Room): string | null {
  const round = String(room.meta.round);
  const actions = room.actions?.[round] ?? {};
  const list = Object.values(actions) as NightAction[];

  const mafiaTargets = list.filter((a) => a.type === "mafia").map((a) => a.target);
  const doctorTarget = list.find((a) => a.type === "doctor")?.target ?? null;

  const victim = tally(mafiaTargets);
  if (!victim) return null;
  if (victim === doctorTarget) return null; // 의사가 보호 성공
  // 대상이 이미 죽었거나 존재하지 않으면 무효
  if (!room.players[victim]?.alive) return null;
  return victim;
}

// 경찰 조사 결과(해당 라운드) → { targetId, isMafia } | null
export function policeResult(room: Room, round: number) {
  const actions = room.actions?.[String(round)] ?? {};
  const police = Object.values(actions).find((a) => a.type === "police");
  if (!police) return null;
  const target = room.players[police.target];
  if (!target) return null;
  return { targetId: target.id, name: target.name, isMafia: target.role === "mafia" };
}

// 투표 결과 계산 → 처형 대상 id (동률/무투표면 null)
export function resolveVote(room: Room): string | null {
  const round = String(room.meta.round);
  const votes = room.votes?.[round] ?? {};
  const targets = Object.values(votes).filter((t) => t && t !== "skip");
  const target = tally(targets);
  if (!target) return null;
  if (!room.players[target]?.alive) return null;
  return target;
}

// 밤에 행동해야 하는 살아있는 역할 플레이어 id 목록
export function nightActorIds(room: Room): string[] {
  return [
    ...aliveByRole(room, "mafia"),
    ...aliveByRole(room, "doctor"),
    ...aliveByRole(room, "police"),
  ].map((p) => p.id);
}

// 밤: 모든 행동 역할이 제출했는가
export function allNightActionsIn(room: Room): boolean {
  const round = String(room.meta.round);
  const actions = room.actions?.[round] ?? {};
  const need = nightActorIds(room);
  return need.length > 0 && need.every((id) => actions[id]?.target);
}

// 투표: 살아있는 모두가 투표했는가
export function allVotesIn(room: Room): boolean {
  const round = String(room.meta.round);
  const votes = room.votes?.[round] ?? {};
  const need = alivePlayers(room).map((p) => p.id);
  return need.length > 0 && need.every((id) => Boolean(votes[id]));
}
