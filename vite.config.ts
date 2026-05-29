import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages는 https://<user>.github.io/<repo>/ 경로로 서비스되므로
// base를 repo 이름으로 맞춰야 한다. repo 이름이 다르면 아래 값을 바꾸세요.
// (환경변수 VITE_BASE 로도 덮어쓸 수 있음)
const base = process.env.VITE_BASE ?? "/mafia-game/";

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5273 },
});
