import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Hai chế độ:
 *
 *  dev    — `npm run dev` chạy Vite ở cổng 5180, proxy /api sang Laravel.
 *           Có hot reload, cần 2 process.
 *
 *  build  — `npm run build` xuất thẳng vào backend/public/, Laravel serve luôn.
 *           Một domain, KHÔNG cổng nào. Dùng khi chạy trên Herd.
 *
 * Vì sao build ra thẳng public/ chứ không vào public/spa/:
 * đường dẫn dạng /invoices/1 không trùng tên thư mục nào nên web server đẩy
 * về index.php như bình thường. Nếu để dưới /spa/ thì thư mục "spa" tồn tại
 * thật, PHP built-in server coi đó là request thư mục và trả 404 luôn.
 *
 * emptyOutDir = false vì public/ còn chứa index.php của Laravel, favicon,
 * robots.txt — xoá sạch là gãy app.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],

  build: {
    outDir: '../backend/public',
    emptyOutDir: false,
  },

  server: {
    port: 5180,
    // Proxy sang Laravel để tránh CORS hoàn toàn — FE và BE cùng origin khi dev.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
