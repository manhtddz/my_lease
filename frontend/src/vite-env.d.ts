/// <reference types="vite/client" />

/**
 * Khai báo cho các import mà Vite xử lý nhưng tsc không biết, ví dụ CSS.
 * Không có dòng này thì `import './index.css'` bị báo thiếu type declaration.
 */
declare module '*.css'
