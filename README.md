# 🌙 마피아 (온라인, 사회자 없음)

링크만 공유하면 누구나 참여할 수 있는 **온라인 마피아 게임**입니다.
사회자(진행자) 없이 클라이언트가 페이즈를 자동으로 진행하며, **GitHub Pages**로 배포해 URL을 공유합니다.

## 게임 규칙 (MVP)

- **역할**: 🔪 마피아 / 💉 의사 / 🔍 경찰 / 🧑 시민 (인원수에 따라 자동 구성, 최소 4명)
- **밤** → 마피아는 제거 대상 지목, 의사는 보호, 경찰은 조사
- **낮** → 사망자 공개 후 토론
- **투표** → 다수결로 처형 (동률이면 부결)
- **승리** — 시민: 마피아 전멸 / 마피아: 마피아 수 ≥ 시민 수
- **호스트리스**: 타이머가 끝나거나 전원이 행동을 마치면, 접속한 누군가의 브라우저가 Firebase 트랜잭션으로 페이즈를 자동 전진시킵니다. 방장이 나가도 게임은 계속됩니다.

## 기술 스택

Vite + React + TypeScript + Firebase Realtime Database. 별도 서버 없이 정적 호스팅으로 동작합니다.

---

## 1. Firebase 설정 (필수)

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트 생성
2. **빌드 > Realtime Database** 만들기 → 위치 선택 → **테스트 모드**로 시작
   (MVP용. 운영 시 보안 규칙 강화 권장 — 아래 참고)
3. **프로젝트 설정(⚙️) > 내 앱 > 웹 앱 추가(`</>`)** → SDK 설정값 복사
4. 프로젝트 루트에 `.env` 생성:

   ```bash
   cp .env.example .env
   ```

   그리고 값 채우기:

   ```
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=https://your-app-default-rtdb.firebaseio.com
   VITE_FIREBASE_PROJECT_ID=your-app
   VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
   ```

### Realtime Database 보안 규칙 (MVP 예시)

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

> ⚠️ 위 규칙은 누구나 읽기/쓰기가 가능합니다. 친구들끼리 하는 캐주얼 게임엔 충분하지만, 공개 운영 시에는 인증·검증 규칙을 추가하세요.

## 2. 로컬 실행

```bash
npm install
npm run dev
```

→ http://localhost:5273 접속, "방 만들기" 후 생성된 URL을 다른 탭/기기에 붙여넣어 테스트.

## 3. GitHub Pages 배포

1. 새 GitHub 저장소 생성 후 푸시:

   ```bash
   git remote add origin https://github.com/<USER>/<REPO>.git
   git push -u origin main
   ```

2. 저장소 **Settings > Secrets and variables > Actions > New repository secret** 에
   `.env`와 동일한 5개 값을 등록:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`

3. 저장소 **Settings > Pages > Build and deployment > Source** 를 **GitHub Actions** 로 설정

4. `main`에 푸시하면 `.github/workflows/deploy.yml`이 자동 빌드·배포.
   배포 URL: `https://<USER>.github.io/<REPO>/`
   (`base` 경로는 저장소 이름으로 자동 설정됩니다.)

5. Firebase 콘솔 **Authentication > Settings > 승인된 도메인** 에 `<USER>.github.io` 추가 (필요 시).

---

## 플레이 방법

1. 방장이 "방 만들기" → 링크 복사 → 친구들에게 공유
2. 4명 이상 모이면 방장이 **게임 시작**
3. 각자 화면에서 자기 역할에 따라 밤/투표 행동
4. 자동으로 밤 → 낮 → 투표가 반복되며 승부가 날 때까지 진행
