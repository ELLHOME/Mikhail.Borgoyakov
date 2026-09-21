import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  // Две точки входа: главная и «Эфемерида». Вторая собирается в natal/index.html,
  // а gh-pages отдаёт её по адресу /natal/ — без всяких правил переписывания.
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        natal: "natal/index.html",
        english: "english/index.html",
      },
    },
  },
});
