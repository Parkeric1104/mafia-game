import { useEffect, useRef, useState } from "react";
import {
  onValue,
  ref,
  runTransaction,
  set,
  update,
  push,
  onDisconnect,
  serverTimestamp,
} from "firebase/database";
import { db } from "../firebase";
import type { NightActionType, Room, RoomMeta } from "../types";
import {
  PHASE_MS,
  allNightActionsIn,
  allVotesIn,
  alivePlayers,
  checkWinner,
  resolveNight,
  resolveVote,
} from "../game/engine";
import { roleComposition, shuffle, MIN_PLAYERS } from "../game/roles";

// 브라우저별 고유 플레이어 id (localStorage 영속)
export function getMyId(): string {
  const KEY = "mafia_player_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(KEY, id);
  }
  return id;
}

function roomRef(roomId: string, path = "") {
  return ref(db!, `rooms/${roomId}${path ? "/" + path : ""}`);
}

export function useRoom(roomId: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const advancingRef = useRef(false);

  // 실시간 구독
  useEffect(() => {
    if (!db) return;
    const unsub = onValue(roomRef(roomId), (snap) => {
      setRoom(snap.exists() ? (snap.val() as Room) : null);
      setLoading(false);
    });
    return () => unsub();
  }, [roomId]);

  // 호스트리스 자동 진행: 타이머 만료 또는 전원 행동 완료 시
  // "누구든 먼저" 트랜잭션으로 페이즈를 전진시킨다.
  useEffect(() => {
    if (!room || !room.meta?.started) return;
    if (room.meta.phase === "lobby" || room.meta.phase === "ended") return;

    const tick = () => {
      const now = Date.now();
      const timeUp = now >= (room.meta.phaseEndsAt ?? 0);
      const earlyNight = room.meta.phase === "night" && allNightActionsIn(room);
      const earlyVote = room.meta.phase === "vote" && allVotesIn(room);
      if ((timeUp || earlyNight || earlyVote) && !advancingRef.current) {
        void advancePhase(roomId, room);
        advancingRef.current = true;
        // 락은 트랜잭션이 처리하므로 곧 풀어 다음 페이즈를 다시 감지
        setTimeout(() => (advancingRef.current = false), 1500);
      }
    };
    const t = setInterval(tick, 500);
    tick();
    return () => clearInterval(t);
  }, [room, roomId]);

  return { room, loading };
}

// ---- 액션들 ----

export async function createRoom(roomId: string, hostId: string, hostName: string) {
  const now = Date.now();
  const meta: RoomMeta = {
    phase: "lobby",
    round: 0,
    hostId,
    createdAt: now,
    phaseEndsAt: 0,
    started: false,
    winner: null,
    lastVictim: null,
    lastLynched: null,
  };
  await set(roomRef(roomId), {
    meta,
    players: {
      [hostId]: { id: hostId, name: hostName, alive: true, joinedAt: now },
    },
  });
}

export async function joinRoom(roomId: string, id: string, name: string) {
  const pref = roomRef(roomId, `players/${id}`);
  await update(pref, { id, name, alive: true, joinedAt: Date.now() });
  // 연결이 끊겨도 로비 단계에서만 자동 제거(게임 중엔 유지)
  void serverTimestamp;
  void onDisconnect;
}

export async function startGame(roomId: string, room: Room) {
  const players = Object.values(room.players ?? {});
  if (players.length < MIN_PLAYERS) return;
  const ordered = players.sort((a, b) => a.joinedAt - b.joinedAt);
  const roles = shuffle(roleComposition(ordered.length));

  const playerUpdates: Record<string, unknown> = {};
  ordered.forEach((p, i) => {
    playerUpdates[`players/${p.id}/role`] = roles[i];
    playerUpdates[`players/${p.id}/alive`] = true;
  });
  playerUpdates["meta/started"] = true;
  playerUpdates["meta/phase"] = "night";
  playerUpdates["meta/round"] = 1;
  playerUpdates["meta/phaseEndsAt"] = Date.now() + PHASE_MS.night;
  playerUpdates["meta/winner"] = null;
  playerUpdates["meta/lastVictim"] = null;
  playerUpdates["meta/lastLynched"] = null;

  await update(roomRef(roomId), playerUpdates);
}

export async function submitNightAction(
  roomId: string,
  round: number,
  playerId: string,
  type: NightActionType,
  target: string
) {
  await set(roomRef(roomId, `actions/${round}/${playerId}`), { type, target });
}

export async function submitVote(
  roomId: string,
  round: number,
  voterId: string,
  target: string
) {
  await set(roomRef(roomId, `votes/${round}/${voterId}`), target);
}

async function addLog(roomId: string, round: number, text: string) {
  await push(roomRef(roomId, "log"), { round, text, at: Date.now() });
}

// 핵심: 페이즈 전진. 트랜잭션으로 "처리권"을 한 클라이언트만 획득.
async function advancePhase(roomId: string, room: Room) {
  const expectedPhase = room.meta.phase;
  const expectedRound = room.meta.round;

  const result = await runTransaction(roomRef(roomId, "meta"), (meta: RoomMeta | null) => {
    if (!meta) return meta;
    if (meta.phase !== expectedPhase || meta.round !== expectedRound) return; // 이미 전진됨 → 중단
    if (meta.resolving) return; // 다른 클라가 처리 중 → 중단
    meta.resolving = true;
    return meta;
  });

  // 처리권 획득 실패 시 종료
  if (!result.committed || !result.snapshot.val()?.resolving) return;

  if (expectedPhase === "night") {
    await resolveNightPhase(roomId, room);
  } else if (expectedPhase === "day") {
    await update(roomRef(roomId, "meta"), {
      phase: "vote",
      phaseEndsAt: Date.now() + PHASE_MS.vote,
      resolving: false,
    });
  } else if (expectedPhase === "vote") {
    await resolveVotePhase(roomId, room);
  }
}

async function resolveNightPhase(roomId: string, room: Room) {
  const victim = resolveNight(room);
  const updates: Record<string, unknown> = {};
  if (victim) {
    updates[`players/${victim}/alive`] = false;
    await addLog(roomId, room.meta.round, `🌙 밤사이 ${room.players[victim].name} 님이 사망했습니다.`);
  } else {
    await addLog(roomId, room.meta.round, `🌙 밤사이 아무도 죽지 않았습니다.`);
  }

  // 사망 반영본으로 승리 판정
  const after: Room = structuredClone(room);
  if (victim) after.players[victim].alive = false;
  const winner = checkWinner(after);

  updates["meta/lastVictim"] = victim ?? null;
  updates["meta/resolving"] = false;
  if (winner) {
    updates["meta/phase"] = "ended";
    updates["meta/winner"] = winner;
  } else {
    updates["meta/phase"] = "day";
    updates["meta/phaseEndsAt"] = Date.now() + PHASE_MS.day;
  }
  await update(roomRef(roomId), updates);
}

async function resolveVotePhase(roomId: string, room: Room) {
  const lynched = resolveVote(room);
  const updates: Record<string, unknown> = {};
  if (lynched) {
    updates[`players/${lynched}/alive`] = false;
    await addLog(roomId, room.meta.round, `☀️ 투표로 ${room.players[lynched].name} 님이 처형되었습니다.`);
  } else {
    await addLog(roomId, room.meta.round, `☀️ 투표가 부결되어 아무도 처형되지 않았습니다.`);
  }

  const after: Room = structuredClone(room);
  if (lynched) after.players[lynched].alive = false;
  const winner = checkWinner(after);

  updates["meta/lastLynched"] = lynched ?? null;
  updates["meta/resolving"] = false;
  if (winner) {
    updates["meta/phase"] = "ended";
    updates["meta/winner"] = winner;
  } else {
    updates["meta/phase"] = "night";
    updates["meta/round"] = room.meta.round + 1;
    updates["meta/phaseEndsAt"] = Date.now() + PHASE_MS.night;
    updates["meta/lastVictim"] = null;
  }
  await update(roomRef(roomId), updates);
}

export async function restartGame(roomId: string, room: Room) {
  // 로비로 리셋(역할/생존/액션/투표/로그 초기화)
  const updates: Record<string, unknown> = {
    "meta/phase": "lobby",
    "meta/round": 0,
    "meta/started": false,
    "meta/winner": null,
    "meta/lastVictim": null,
    "meta/lastLynched": null,
    "meta/phaseEndsAt": 0,
    "meta/resolving": false,
    actions: null,
    votes: null,
    log: null,
  };
  for (const p of Object.values(room.players ?? {})) {
    updates[`players/${p.id}/alive`] = true;
    updates[`players/${p.id}/role`] = null;
  }
  await update(roomRef(roomId), updates);
}

export { alivePlayers };
