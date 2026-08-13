# Setup trên máy mới dùng Laravel Herd

> Mục tiêu: **một domain do Herd cấp, không mở cổng nào**. Laravel serve luôn bản build của
> React, nên chỉ có một process web duy nhất.
>
> Kết quả: `http://nha-tro.test` — giao diện, API và deep link đều nằm dưới domain đó.

---

## 0. Cần gì trước

Chỉ cần **Laravel Herd**. Nó đã bundle sẵn PHP, Composer, Laravel installer, và Node.js kèm npm
(quản lý qua nvm) — không phải cài PHP hay Node riêng.

Tải tại [herd.laravel.com](https://herd.laravel.com), chạy installer **với quyền Administrator**
(cần quyền này để Herd cài service quản lý file hosts và trỏ mọi `*.test` về máy).

Cài xong, mở terminal mới rồi kiểm tra:

```powershell
herd --version
php --version         # cần >= 8.2
composer --version
node --version        # cần >= 20
npm --version
```

Nếu `node --version` thấp hơn 20:

```powershell
nvm install 22
nvm use 22
```

> Herd dùng bản nvm riêng của nó, không dùng được nvm cài sẵn từ trước. Nếu máy đã có nvm khác
> thì xem mục troubleshooting trong tài liệu Herd.

---

## 1. Lấy source về

Copy cả thư mục `nha-tro` sang máy mới, hoặc `git clone` nếu đã đưa lên repo.

Đặt ở đâu cũng được — không bắt buộc trong `%USERPROFILE%\Herd`, vì bước 4 sẽ dùng `herd link`
để tự khai báo đường dẫn.

**Ba thứ không có trong source, phải tạo lại ở bước sau:**

| Thiếu | Vì sao | Bước tạo lại |
|---|---|---|
| `backend/vendor/` | thư viện Composer, bị gitignore | `composer install` |
| `frontend/node_modules/` | thư viện npm, bị gitignore | `npm install` |
| `backend/database/database.sqlite` | **dữ liệu thật**, cố ý không đưa vào git | `migrate --seed` |

---

## 2. Backend

```powershell
cd D:\duong-dan\nha-tro\backend

composer install

copy .env.example .env
php artisan key:generate
```

Sửa `APP_URL` trong `.env` thành domain sắp đặt ở bước 4:

```
APP_URL=http://nha-tro.test
```

Tạo database và dữ liệu mẫu:

```powershell
# SQLite cần file rỗng tồn tại trước
php -r "file_exists('database/database.sqlite') || touch('database/database.sqlite');"

php artisan migrate --seed
```

Seeder tạo 2 toà · 6 phòng · 12 đồng hồ · 7 khoản thu · 4 hợp đồng kèm lịch sử 3 tháng.

> **Dùng dữ liệu thật từ máy cũ?** Bỏ qua `migrate --seed`, chỉ cần copy đúng một file
> `backend/database/database.sqlite` từ máy cũ sang. Toàn bộ dữ liệu nằm trong đó.

---

## 3. Frontend — build thành file tĩnh

```powershell
cd ..\frontend

npm install
npm run build
```

Bản build xuất trực tiếp vào `backend/public/`:

```
backend/public/
├── index.php      ← front controller của Laravel (giữ nguyên)
├── index.html     ← giao diện React (mới)
└── assets/        ← JS + CSS đã bundle (mới)
```

**Không cần chạy `npm run dev`, không cần Node chạy nền.** Sau bước này Node chỉ dùng khi bạn
sửa code frontend rồi build lại.

---

## 4. Trỏ domain bằng Herd

Chạy `herd link` **trong thư mục `backend`** — vì đó là nơi có `public/`:

```powershell
cd ..\backend
herd link nha-tro
```

Xong. Mở **http://nha-tro.test**

Muốn HTTPS:

```powershell
herd secure nha-tro
```

→ `https://nha-tro.test`

> Không truyền tên thì Herd lấy tên thư mục làm domain, tức `backend.test` — đặt tên tường minh
> sẽ dễ hiểu hơn khi máy có nhiều dự án.

---

## 5. Kiểm tra

| Mở | Phải thấy |
|---|---|
| `http://nha-tro.test` | Dashboard, 6 thẻ phòng |
| `http://nha-tro.test/invoices` | Danh sách hoá đơn |
| `http://nha-tro.test/api/meta` | JSON các nhãn mã |

Nếu trang trắng, mở DevTools tab Network xem `/assets/*.js` có 404 không — thường là chưa chạy
`npm run build`.

Lỗi phía server thì xem:

```
backend/storage/logs/{ngày-hôm-nay}/error.log
```

---

## 6. Sau này sửa code thì làm gì

| Sửa gì | Cần làm |
|---|---|
| Backend (PHP) | Không cần gì, Herd đọc file trực tiếp |
| Frontend (React) | `cd frontend && npm run build` |
| Thêm bảng / cột | `php artisan migrate` |
| Đổi `.env` | `php artisan config:clear` |

---

## Vì sao lại serve React qua Laravel

Cách thường thấy khi dev là hai process: Laravel một cổng, Vite một cổng, Vite proxy `/api` sang
Laravel. Cách đó có hot reload nên sửa code nhanh, nhưng **buộc phải có cổng** và phải mở hai
terminal.

Ở đây build React thành file tĩnh rồi để Laravel serve, nên:

- Một domain duy nhất, không cổng
- Một process web (Herd chạy nền, không cần mở terminal nào)
- FE và BE cùng origin nên không có CORS

Đánh đổi: mất hot reload. Sửa frontend phải `npm run build` lại (khoảng 300ms nên không đáng kể).

### Deep link hoạt động thế nào

`http://nha-tro.test/invoices/1` không tồn tại dưới dạng file. nginx của Herd thử `$uri`,
thử `$uri/`, không thấy thì đẩy về `index.php` → Laravel → route `fallback` trả `index.html`
→ React Router tự định tuyến phía client.

Đây là lý do bản build **không** nằm trong `public/spa/`: khi có thư mục tên `spa` tồn tại thật,
PHP built-in server (`php artisan serve`) coi `/spa/invoices` là request thư mục và trả 404 luôn
mà không đẩy về `index.php`. Để ở gốc `public/` thì chạy đúng trên cả Herd và `artisan serve`.

---

## Vẫn muốn dev có hot reload?

Cách cũ vẫn dùng được song song, không cần bỏ setup Herd:

```powershell
# Terminal 1
cd backend
php artisan serve --port=8000

# Terminal 2
cd frontend
npm run dev
```

→ mở `http://localhost:5180`, sửa code là thấy đổi ngay.

Cổng proxy khai trong [`frontend/vite.config.js`](../frontend/vite.config.js) — đang trỏ
`127.0.0.1:8000`, đổi nếu bạn chạy `artisan serve` ở cổng khác.
