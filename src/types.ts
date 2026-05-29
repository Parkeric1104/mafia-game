export type Role = "mafia" | "doctor" | "police" | "citizen";
export type Phase = "lobby" | "night" | "day" | "vote" | "voteResult" | "ended";
export type Team = "mafia" | "citizen";

export interface Player {
  id: string;
  name: string;
  alive: boolean;
  role?: Role; // 게임 시작 시 부여
  joinedAt: number;
}

export type NightActionType = "mafia" | "doctor" | "police";

export interface NightAction {
  type: NightActionType;
  target: string; // 대상 playerId
}

export interface RoomMeta {
  phase: Phase;
  round: number;
  hostId: string;
  createdAt: number;
  phaseEndsAt: number; // 현재 페이즈 종료 예정 시각(ms epoch)
  started: boolean;
  resolving?: boolean; // 페이즈 전환 처리 중복 방지 락
  winner?: Team | null;
  lastVictim?: string | null; // 직전 밤 사망자 id (없으면 null)
  lastLynched?: string | null; // 직전 투표 처형자 id (없으면 null)
}

export interface LogEntry {
  round: number;
  text: string;
  at: number;
}

export interface Room {
  meta: RoomMeta;
  players: Record<string, Player>;
  actions?: Record<string, Record<string, NightAction>>; // actions[round][playerId]
  votes?: Record<string, Record<string, string>>; // votes[round][voterId] = targetId
  log?: Record<string, LogEntry>;
}
