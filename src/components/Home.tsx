import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { firebaseReady } from "../firebase";
import {
  ADMIN_CODE,
  createRoom,
  getMyId,
  getMyName,
  joinRoom,
  setMyName,
  useLobbies,
} from "../hooks/useRoom";

function newRoomId(): string {
  return Math.random().toString(36).slice(2, 7);
}

type Mode = "select" | "admin" | "join";

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("select");

  if (!firebaseReady) {
    return (
      <div className="screen center">
        <div className="card warn">
          <h1>⚙️ 설정 필요</h1>
          <p>
            Firebase 설정이 비어 있습니다. <code>.env</code> 파일에
            <br />
            <code>VITE_FIREBASE_*</code> 값을 채운 뒤 다시 실행하세요.
          </p>
          <p className="muted">자세한 방법은 README.md를 참고하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen center">
      {mode === "select" && <ModeSelect onPick={setMode} />}
      {mode === "admin" && <AdminPanel onBack={() => setMode("select")} navigate={navigate} />}
      {mode === "join" && <JoinPanel onBack={() => setMode("select")} navigate={navigate} />}
    </div>
  );
}

function ModeSelect({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="card">
      <h1 className="title">🌙 마피아</h1>
      <p className="muted center-t">사회자 없이 자동 진행되는 온라인 마피아</p>
      <button className="btn primary" onClick={() => onPick("admin")}>
        🛠️ 방 만들기 (관리자)
      </button>
      <button className="btn" onClick={() => onPick("join")}>
        🙋 게임 참여 (참여자)
      </button>
      <p className="muted small center-t">
        방 개설은 관리자 코드가 필요합니다. 참여자는 열린 방 목록에서 입장하세요.
      </p>
    </div>
  );
}

function AdminPanel({
  onBack,
  navigate,
}: {
  onBack: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [name, setName] = useState(getMyName());
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim() || busy) return;
    if (code.trim() !== ADMIN_CODE) {
      setErr("관리자 코드가 올바르지 않습니다.");
      return;
    }
    setBusy(true);
    setMyName(name.trim());
    const roomId = newRoomId();
    await createRoom(roomId, getMyId(), name.trim());
    navigate(`/room/${roomId}`);
  }

  return (
    <div className="card">
      <h2>🛠️ 방 만들기</h2>
      <label className="label">닉네임</label>
      <input
        className="input"
        value={name}
        maxLength={12}
        placeholder="이름"
        onChange={(e) => setName(e.target.value)}
      />
      <label className="label">관리자 코드</label>
      <input
        className="input"
        value={code}
        type="password"
        placeholder="관리자 코드"
        onChange={(e) => {
          setCode(e.target.value);
          setErr("");
        }}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
      />
      {err && <p className="danger small">{err}</p>}
      <button className="btn primary" disabled={!name.trim() || !code.trim() || busy} onClick={handleCreate}>
        방 만들기
      </button>
      <button className="btn ghost" onClick={onBack}>
        ← 뒤로
      </button>
    </div>
  );
}

function JoinPanel({
  onBack,
  navigate,
}: {
  onBack: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [name, setName] = useState(getMyName());
  const [busy, setBusy] = useState(false);
  const lobbies = useLobbies();

  async function handleJoin(roomId: string) {
    if (!name.trim() || busy) return;
    setBusy(true);
    setMyName(name.trim());
    await joinRoom(roomId, getMyId(), name.trim());
    navigate(`/room/${roomId}`);
  }

  return (
    <div className="card wide">
      <h2>🙋 게임 참여</h2>
      <label className="label">닉네임</label>
      <input
        className="input"
        value={name}
        maxLength={12}
        placeholder="이름을 먼저 입력하세요"
        onChange={(e) => setName(e.target.value)}
      />

      <h4>열린 방 ({lobbies.length})</h4>
      {lobbies.length === 0 ? (
        <p className="muted center-t">현재 참여 가능한 방이 없습니다. 관리자가 방을 만들 때까지 기다리세요.</p>
      ) : (
        <div className="room-list">
          {lobbies.map((l) => (
            <div key={l.roomId} className="room-row">
              <div>
                <div className="room-title">{l.title}</div>
                <div className="muted small">{l.count}명 대기 중</div>
              </div>
              <button
                className="btn small-btn"
                disabled={!name.trim() || busy}
                onClick={() => handleJoin(l.roomId)}
              >
                참여
              </button>
            </div>
          ))}
        </div>
      )}
      <button className="btn ghost" onClick={onBack}>
        ← 뒤로
      </button>
    </div>
  );
}
