import type { Role } from "../types";

export const MIN_PLAYERS = 4;

export const ROLE_LABEL: Record<Role, string> = {
  mafia: "마피아",
  doctor: "의사",
  police: "경찰",
  citizen: "시민",
};

export const ROLE_EMOJI: Record<Role, string> = {
  mafia: "🔪",
  doctor: "💉",
  police: "🔍",
  citizen: "🧑",
};

export const ROLE_TEAM: Record<Role, "mafia" | "citizen"> = {
  mafia: "mafia",
  doctor: "citizen",
  police: "citizen",
  citizen: "citizen",
};

export const ROLE_DESC: Record<Role, string> = {
  mafia: "밤마다 한 명을 제거합니다. 낮에는 정체를 숨기세요.",
  doctor: "밤마다 한 명을 보호합니다. 마피아의 표적을 살릴 수 있습니다.",
  police: "밤마다 한 명을 조사해 마피아 여부를 확인합니다.",
  citizen: "특수 능력은 없지만 토론과 투표로 마피아를 찾아내세요.",
};

// 인원수에 따른 역할 구성 결정
export function roleComposition(count: number): Role[] {
  const mafia = Math.max(1, Math.floor(count / 4)); // 4~7→1, 8~11→2 ...
  const doctor = count >= 4 ? 1 : 0;
  const police = count >= 5 ? 1 : 0;
  const citizens = count - mafia - doctor - police;

  const roles: Role[] = [];
  for (let i = 0; i < mafia; i++) roles.push("mafia");
  for (let i = 0; i < doctor; i++) roles.push("doctor");
  for (let i = 0; i < police; i++) roles.push("police");
  for (let i = 0; i < citizens; i++) roles.push("citizen");
  return roles;
}

// Fisher–Yates 셔플
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
