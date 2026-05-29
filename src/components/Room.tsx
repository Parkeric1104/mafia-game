import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { firebaseReady } from "../firebase";
import type { Phase, Player, Room as RoomT, Role } from "../types";
import {
  deleteRoom,
  getMyId,
  getMyName,
  joinRoom,
  restartGame,
  setMyName,
  startGame,
  submitNightAction,
  submitVote,
  syncLobby,
  useRoom,
} from "../hooks/useRoom";
import { alivePlayers, policeResult } from "../game/engine";
import {
  MIN_PLAYERS,
  ROLE_DESC,
  ROLE_EMOJI,
  ROLE_LABEL,
  roleComposition,
} from "../game/roles";

/* ---------- 공통 ---------- */

function Timer({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const remain = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return <span className="timer">{remain}s</span>;
}

// 페이즈 시작 안내 문구
const PHASE_BANNER: Partial<Record<Phase, string>> = {
  night: "🌙 밤이 되었습니다",
  day: "☀️ 아침이 되었습니다",
  vote: "🗳️ 투표를 시작합니다",
  voteResult: "📢 투표 결과 발표",
};

// 페이즈가 바뀔 때마다 큰 안내 배너를 잠시 띄운다
function useBanner(phase: Phase): string | null {
  const [banner, setBanner] = useState<string | null>(null);
  const prev = useRef<Phase | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = phase;
    if (before === null || before === phase) return; // 첫 진입/동일 페이즈는 무시
    const msg = PHASE_BANNER[phase];
    if (!msg) return;
    setBanner(msg);
    const t = setTimeout(() => setBanner(null), 3200);
    return () => clearTimeout(t);
  }, [phase]);
  return banner;
}

function PlayerChips({
  players,
  selectable,
  selected,
  onSelect,
}: {
  players: Player[];
  selectable?: boolean;
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="chips">
      {players.map((p) => (
        <button
          key={p.id}
          className={`chip ${!p.alive ? "dead" : ""} ${selected === p.id ? "sel" : ""} ${
            selectable && p.alive ? "pick" : ""
          }`}
          disabled={!selectable || !p.alive}
          onClick={() => selectable && p.alive && onSelect?.(p.id)}
        >
          {p.alive ? "" : "💀 "}
          {p.name}
        </button>
      ))}
    </div>
  );
}

function LogPanel({ room }: { room: RoomT }) {
  const entries = Object.values(room.log ?? {}).sort((a, b) => a.at - b.at);
  if (entries.length === 0) return null;
  return (
    <div className="log">
      <h4>📜 기록</h4>
      {entries.map((e, i) => (
        <div key={i} className="log-row">
          <b>{e.round}일차</b> {e.text}
        </div>
      ))}
    </div>
  );
}

/* ---------- 입장 ---------- */

function JoinGate({ roomId }: { roomId: string }) {
  const [name, setName] = useState(getMyName());
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setMyName(name.trim());
    await joinRoom(roomId, getMyId(), name.trim());
  }
  return (
    <div className="screen center">
      <div className="card">
        <h1 className="title">🌙 마피아</h1>
        <p className="muted">방에 참여하려면 닉네임을 입력하세요.</p>
        <input
          className="input"
          value={name}
          maxLength={12}
          placeholder="이름"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
        <button className="btn primary" disabled={!name.trim() || busy} onClick={go}>
          입장하기
        </button>
      </div>
    </div>
  );
}

/* ---------- 로비 ---------- */

async function confirmDelete(roomId: string, navigate: ReturnType<typeof useNavigate>) {
  if (!window.confirm("정말 이 방을 삭제할까요? 모든 참가자가 방에서 나가집니다.")) return;
  await deleteRoom(roomId);
  navigate("/");
}

function Lobby({ room, roomId, isHost }: { room: RoomT; roomId: string; isHost: boolean }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const players = Object.values(room.players ?? {}).sort((a, b) => a.joinedAt - b.joinedAt);
  const comp = useMemo(() => roleComposition(Math.max(players.length, MIN_PLAYERS)), [players.length]);
  const counts = comp.reduce<Record<string, number>>((m, r) => ((m[r] = (m[r] ?? 0) + 1), m), {});

  // 방장이 대기 인원 수를 방 목록에 동기화
  useEffect(() => {
    if (isHost) void syncLobby(roomId, { count: players.length, started: false });
  }, [isHost, roomId, players.length]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="screen">
      <div className="card wide">
        <h2>🛋️ 대기실</h2>

        <div className="share">
          <input className="input" readOnly value={window.location.href} />
          <button className="btn" onClick={copyLink}>
            {copied ? "복사됨!" : "링크 복사"}
          </button>
        </div>
        <p className="muted small">이 링크를 친구들에게 보내세요.</p>

        <h4>참가자 ({players.length}명)</h4>
        <PlayerChips players={players} />

        {players.length >= MIN_PLAYERS && (
          <p className="muted small">
            예상 구성:{" "}
            {Object.entries(counts)
              .map(([r, n]) => `${ROLE_EMOJI[r as Role]}${ROLE_LABEL[r as Role]} ${n}`)
              .join(" · ")}
          </p>
        )}

        {isHost ? (
          <button
            className="btn primary"
            disabled={players.length < MIN_PLAYERS}
            onClick={() => startGame(roomId, room)}
          >
            {players.length < MIN_PLAYERS
              ? `최소 ${MIN_PLAYERS}명 필요 (현재 ${players.length}명)`
              : "게임 시작"}
          </button>
        ) : (
          <p className="muted center-t">방장이 게임을 시작하길 기다리는 중…</p>
        )}

        {isHost && (
          <button className="btn danger-btn" onClick={() => confirmDelete(roomId, navigate)}>
            🗑️ 방 삭제
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- 밤 ---------- */

function NightPanel({ room, roomId, me }: { room: RoomT; roomId: string; me: Player }) {
  const round = room.meta.round;
  const myAction = room.actions?.[String(round)]?.[me.id];
  const [picked, setPicked] = useState<string>("");

  const alive = alivePlayers(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const fellowMafia = Object.values(room.players).filter((p) => p.role === "mafia");

  // 경찰: 과거 조사 결과
  const findings = useMemo(() => {
    const out: { round: number; name: string; isMafia: boolean }[] = [];
    if (me.role !== "police") return out;
    for (let r = 1; r <= round; r++) {
      const res = policeResult(room, r);
      // 내가 조사한 경우만 (경찰은 한 명이므로 사실상 전부 내 결과)
      if (res) out.push({ round: r, name: res.name, isMafia: res.isMafia });
    }
    return out;
  }, [room, round, me.role]);

  const canAct = me.alive && (me.role === "mafia" || me.role === "doctor" || me.role === "police");
  // 대상 후보: 살아있는 사람. 마피아/경찰은 자신 제외.
  const targets = alive.filter((p) => (me.role === "citizen" ? false : p.id !== me.id || me.role === "doctor"));

  const actionVerb: Record<string, string> = {
    mafia: "제거할 대상",
    doctor: "보호할 대상",
    police: "조사할 대상",
  };

  return (
    <div className="screen night">
      <div className="topbar">
        <span>🌙 밤 {round}일차</span>
        <Timer endsAt={room.meta.phaseEndsAt} />
      </div>

      <div className="card">
        <div className="role-badge">
          {ROLE_EMOJI[me.role!]} 당신은 <b>{ROLE_LABEL[me.role!]}</b>
        </div>
        <p className="muted small">{ROLE_DESC[me.role!]}</p>

        {me.role === "mafia" && (
          <p className="muted small">
            동료 마피아: {fellowMafia.map((m) => m.name + (m.alive ? "" : "💀")).join(", ")}
          </p>
        )}

        {findings.length > 0 && (
          <div className="findings">
            {findings.map((f, i) => (
              <div key={i}>
                🔍 {f.round}일차 — {f.name}:{" "}
                <b className={f.isMafia ? "danger" : "safe"}>{f.isMafia ? "마피아!" : "마피아 아님"}</b>
              </div>
            ))}
          </div>
        )}

        {!me.alive && <p className="center-t muted">💀 당신은 사망했습니다. 밤이 지나길 기다리세요.</p>}

        {me.alive && me.role === "citizen" && (
          <p className="center-t muted">조용히 밤이 지나길 기다립니다…</p>
        )}

        {canAct && (
          <>
            <h4>{actionVerb[me.role!]}을(를) 선택하세요</h4>
            {myAction ? (
              <p className="center-t done">
                ✅ 선택 완료: <b>{room.players[myAction.target]?.name}</b>
              </p>
            ) : (
              <>
                <PlayerChips
                  players={targets}
                  selectable
                  selected={picked}
                  onSelect={setPicked}
                />
                <button
                  className="btn primary"
                  disabled={!picked}
                  onClick={() => submitNightAction(roomId, round, me.id, me.role as never, picked)}
                >
                  확정
                </button>
              </>
            )}
          </>
        )}
      </div>
      <LogPanel room={room} />
    </div>
  );
}

/* ---------- 낮(토론) ---------- */

function DayPanel({ room, me }: { room: RoomT; me: Player }) {
  const victim = room.meta.lastVictim ? room.players[room.meta.lastVictim] : null;
  return (
    <div className="screen day">
      <div className="topbar">
        <span>☀️ 낮 {room.meta.round}일차 · 토론</span>
        <Timer endsAt={room.meta.phaseEndsAt} />
      </div>
      <div className="card">
        <h3 className="center-t">
          {victim ? `🪦 지난밤 ${victim.name} 님이 사망했습니다.` : "🕊️ 지난밤 아무도 죽지 않았습니다."}
        </h3>
        <p className="center-t muted">자유롭게 토론하세요. 곧 투표가 시작됩니다.</p>
        {!me.alive && <p className="center-t muted">💀 당신은 사망했습니다 (관전).</p>}
        <PlayerChips players={Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt)} />
      </div>
      <LogPanel room={room} />
    </div>
  );
}

/* ---------- 투표 ---------- */

function VotePanel({ room, roomId, me }: { room: RoomT; roomId: string; me: Player }) {
  const round = room.meta.round;
  const votes = room.votes?.[String(round)] ?? {};
  const myVote = votes[me.id];
  const alive = alivePlayers(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const votedCount = Object.keys(votes).length;
  const [picked, setPicked] = useState<string>("");

  return (
    <div className="screen vote">
      <div className="topbar">
        <span>🗳️ 투표 {round}일차</span>
        <Timer endsAt={room.meta.phaseEndsAt} />
      </div>
      <div className="card">
        <h3 className="center-t">처형할 사람을 투표하세요</h3>
        <p className="muted small center-t">
          투표 완료 {votedCount} / {alive.length}명
        </p>

        {!me.alive ? (
          <p className="center-t muted">💀 사망자는 투표할 수 없습니다.</p>
        ) : myVote ? (
          <p className="center-t done">
            ✅ 투표 완료: <b>{myVote === "skip" ? "기권" : room.players[myVote]?.name}</b>
          </p>
        ) : (
          <>
            <PlayerChips
              players={alive.filter((p) => p.id !== me.id)}
              selectable
              selected={picked}
              onSelect={setPicked}
            />
            <div className="row">
              <button
                className="btn primary"
                disabled={!picked}
                onClick={() => submitVote(roomId, round, me.id, picked)}
              >
                투표 확정
              </button>
              <button className="btn ghost" onClick={() => submitVote(roomId, round, me.id, "skip")}>
                기권
              </button>
            </div>
          </>
        )}
      </div>
      <LogPanel room={room} />
    </div>
  );
}

/* ---------- 투표 결과 ---------- */

function VoteResultPanel({ room }: { room: RoomT }) {
  const lynched = room.meta.lastLynched ? room.players[room.meta.lastLynched] : null;
  return (
    <div className="screen day">
      <div className="topbar">
        <span>📢 투표 결과</span>
        <Timer endsAt={room.meta.phaseEndsAt} />
      </div>
      <div className="card">
        <h2 className="center-t">
          {lynched
            ? `⚖️ ${lynched.name} 님이 처형되었습니다.`
            : "🤝 투표가 부결되어 아무도 처형되지 않았습니다."}
        </h2>
        <p className="center-t muted">잠시 후 다시 밤이 시작됩니다…</p>
      </div>
      <LogPanel room={room} />
    </div>
  );
}

/* ---------- 게임 종료 ---------- */

function GameOver({ room, roomId, isHost }: { room: RoomT; roomId: string; isHost: boolean }) {
  const navigate = useNavigate();
  const winner = room.meta.winner;
  const players = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt);
  return (
    <div className="screen center">
      <div className={`card ${winner === "mafia" ? "mafia-win" : "citizen-win"}`}>
        <h1 className="title">{winner === "mafia" ? "🔪 마피아 승리" : "🎉 시민 승리"}</h1>
        <h4>전체 역할 공개</h4>
        <div className="reveal">
          {players.map((p) => (
            <div key={p.id} className="reveal-row">
              <span>
                {p.alive ? "" : "💀 "}
                {p.name}
              </span>
              <span className="role-tag">
                {ROLE_EMOJI[p.role!]} {ROLE_LABEL[p.role!]}
              </span>
            </div>
          ))}
        </div>
        {isHost ? (
          <>
            <button className="btn primary" onClick={() => restartGame(roomId, room)}>
              다시하기 (대기실로)
            </button>
            <button className="btn danger-btn" onClick={() => confirmDelete(roomId, navigate)}>
              🗑️ 방 삭제
            </button>
          </>
        ) : (
          <p className="muted center-t">방장이 다시 시작하길 기다리는 중…</p>
        )}
      </div>
    </div>
  );
}

/* ---------- 메인 ---------- */

export default function Room() {
  const { roomId = "" } = useParams();
  const myId = getMyId();
  const { room, loading } = useRoom(roomId);
  const phaseNow = room?.meta.phase ?? "lobby";
  const banner = useBanner(phaseNow);

  // 낮(아침)/투표/투표결과는 라이트 테마, 밤·로비·종료는 다크 테마
  useEffect(() => {
    const light = phaseNow === "day" || phaseNow === "vote" || phaseNow === "voteResult";
    document.body.dataset.theme = light ? "light" : "dark";
    return () => {
      document.body.dataset.theme = "dark";
    };
  }, [phaseNow]);

  if (!firebaseReady) {
    return (
      <div className="screen center">
        <div className="card warn">
          <h2>⚙️ Firebase 설정 필요</h2>
          <p className="muted">.env 값을 채운 뒤 다시 실행하세요. (README 참고)</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="screen center">불러오는 중…</div>;

  if (!room) {
    return (
      <div className="screen center">
        <div className="card warn">
          <h2>존재하지 않는 방</h2>
          <p className="muted">방이 사라졌거나 잘못된 링크입니다.</p>
          <a className="btn" href={import.meta.env.BASE_URL}>
            홈으로
          </a>
        </div>
      </div>
    );
  }

  const me = room.players?.[myId];
  const phase = room.meta.phase;

  // 아직 참여 안 함
  if (!me) {
    if (room.meta.started) {
      return (
        <div className="screen center">
          <div className="card warn">
            <h2>게임이 이미 시작됨</h2>
            <p className="muted">다음 판이 시작되면 참여할 수 있습니다.</p>
          </div>
        </div>
      );
    }
    return <JoinGate roomId={roomId} />;
  }

  const isHost = room.meta.hostId === myId;

  let panel: JSX.Element | null = null;
  if (phase === "lobby") panel = <Lobby room={room} roomId={roomId} isHost={isHost} />;
  else if (phase === "night") panel = <NightPanel room={room} roomId={roomId} me={me} />;
  else if (phase === "day") panel = <DayPanel room={room} me={me} />;
  else if (phase === "vote") panel = <VotePanel room={room} roomId={roomId} me={me} />;
  else if (phase === "voteResult") panel = <VoteResultPanel room={room} />;
  else if (phase === "ended") panel = <GameOver room={room} roomId={roomId} isHost={isHost} />;

  return (
    <>
      {banner && (
        <div className="banner-overlay">
          <div className="banner-text">{banner}</div>
        </div>
      )}
      {panel}
    </>
  );
}
