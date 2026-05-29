import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { firebaseReady } from "../firebase";
import { createRoom, getMyId } from "../hooks/useRoom";

function newRoomId(): string {
  return Math.random().toString(36).slice(2, 7);
}

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const roomId = newRoomId();
    await createRoom(roomId, getMyId(), trimmed);
    navigate(`/room/${roomId}`);
  }

  return (
    <div className="screen center">
      <div className="card">
        <h1 className="title">🌙 마피아</h1>
        <p className="muted">사회자 없이 자동 진행되는 온라인 마피아 게임</p>

        <label className="label">닉네임</label>
        <input
          className="input"
          value={name}
          maxLength={12}
          placeholder="이름을 입력하세요"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button className="btn primary" disabled={!name.trim() || busy} onClick={handleCreate}>
          방 만들기
        </button>

        <p className="muted small">
          방을 만들면 공유 링크가 생성됩니다. 친구들에게 링크를 보내 함께 참여하세요. (최소 4명)
        </p>
      </div>
    </div>
  );
}
