# Quản lý nhà trọ

Ứng dụng web quản lý nhà trọ quy mô nhỏ: **1 chủ sở hữu · 2 toà · 6 phòng · điện nước theo chỉ số đồng hồ**.

- **Backend** — Laravel 13 (PHP 8.4), API JSON, SQLite mặc định
- **Frontend** — React 19 + Vite + Tailwind v4
- **Tài liệu thiết kế** — [`docs/`](docs/)

---

## Chạy dự án

Hai cách, chọn theo mục đích.

### A · Dùng thật — một domain, không cổng nào

Laravel serve luôn bản build của React. Cần **Laravel Herd** (đã bundle PHP, Composer, Node, npm).

```powershell
cd backend
composer install
copy .env.example .env
php artisan key:generate
php -r "file_exists('database/database.sqlite') || touch('database/database.sqlite');"
php artisan migrate --seed

cd ..\frontend
npm install
npm run build          # xuất vào backend/public/

cd ..\backend
herd link nha-tro      # cấp domain nha-tro.test
```

Mở **http://nha-tro.test** — giao diện, API, deep link đều dưới domain này.
Hướng dẫn đầy đủ: [`docs/04-setup-herd.md`](docs/04-setup-herd.md).

### B · Vừa sửa code — có hot reload

Cần **PHP 8.2+**, **Composer**, **Node 20+**. Hai terminal:

```bash
# Terminal 1
cd backend && php artisan serve --port=8000

# Terminal 2
cd frontend && npm run dev
```

Mở **http://localhost:5180**. Vite proxy `/api` sang `127.0.0.1:8000` nên không vướng CORS.

Seeder tạo sẵn: 2 toà · 6 phòng · 12 đồng hồ · 7 khoản thu · 4 hợp đồng đang thuê,
kèm **lịch sử 3 tháng** đã ghi số, chốt sổ, thu tiền (một phòng trả thiếu để có công nợ demo).

### Đổi sang MySQL

Sửa `backend/.env`:

```
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=nha_tro
DB_USERNAME=root
DB_PASSWORD=
```

rồi chạy lại `php artisan migrate:fresh --seed`. Schema dùng kiểu dữ liệu tương thích cả hai.

---

## Cấu trúc

```
nha-tro/
├── docs/
│   ├── 01-erd.md            ERD + quy tắc nghiệp vụ + bảng mã CHAR(1)
│   ├── 02-schema.sql        DDL tham chiếu cho MySQL (bản gốc thiết kế)
│   ├── 03-admin-flow.md     Flow admin: 4 sự kiện sinh chỉ số, 5 màn hình
│   └── 04-setup-herd.md     Setup máy mới bằng Herd, một domain không cổng
├── backend/
│   ├── app/Enums/Code.php               bảng mã CHAR(1) + nhãn tiếng Việt
│   ├── app/Models/Concerns/             SoftDeleteByFlag (del_flag)
│   ├── app/Services/
│   │   ├── MeterReadingService.php      chuỗi chỉ số, quy trách nhiệm đoạn tiêu thụ
│   │   ├── BillingService.php           chốt sổ, phát hành, thu tiền
│   │   └── TenancyService.php           wizard nhận khách / trả phòng
│   ├── app/Logging/                     log theo ngày (DailyFolderHandler)
│   ├── app/Support/AuditLog.php         ghi vết hành động chạm tới tiền
│   ├── app/Http/Middleware/             LogApiRequest
│   ├── app/Console/Commands/            logs:prune
│   ├── lang/vi/validation.php           thông điệp validate tiếng Việt
│   └── routes/api.php
└── frontend/src/
    ├── pages/                    Dashboard, Readings, Billing, Invoices, MoveIn, MoveOut…
    ├── lib/
    │   ├── api.js                api client, bóc message lỗi tiếng Việt
    │   ├── format.js             format tiền/ngày kiểu VN
    │   ├── messages.js           từ điển nhãn field + khuôn thông điệp
    │   └── validate.js           luật validate phía client
    └── components/
        ├── ui.jsx                Badge, Modal, Toast, Spinner, Field
        └── confirm.jsx           hộp thoại xác nhận dạng promise
```

---

## Ba quy ước quan trọng

**1. Soft delete bằng `del_flag`, không dùng `deleted_at`**
Theo convention lease-mart: `0` = còn, `1` = đã xoá. Trait
[`SoftDeleteByFlag`](backend/app/Models/Concerns/SoftDeleteByFlag.php) cài global scope
lọc `del_flag = 0`, cung cấp `delete()` / `restore()` / `withTrashed()` / `onlyTrashed()`.

**2. Không có FOREIGN KEY**
Quan hệ do tầng app đảm bảo. Mọi cột `*_id` có index tường minh. Bù lại phải chạy định kỳ
nhóm truy vấn kiểm tra toàn vẹn ở cuối [`docs/02-schema.sql`](docs/02-schema.sql), đặc biệt
truy vấn `[F]` dò bản ghi mồ côi.

**3. Phân loại dùng `CHAR(1)` mã số**
`1`, `2`, `3`… với ý nghĩa ghi trong comment cột và trong
[`App\Enums\Code`](backend/app/Enums/Code.php). Endpoint `GET /api/meta` trả nhãn tiếng Việt
cho frontend.

---

## Nghiệp vụ cốt lõi

### `meter_readings` không có form CRUD

Chỉ sinh ra từ **4 sự kiện**, mỗi sự kiện tự suy ra `prev_reading`, `contract_id`,
`consumption` — người dùng chỉ nhập chỉ số mới:

| Sự kiện | `reason` | Màn hình |
|---|---|---|
| Ghi số cuối tháng | `1` | Ghi số hàng loạt |
| Nhận khách mới | `2` | Wizard bước 4 |
| Khách trả phòng | `3` | Wizard trả phòng bước 2 |
| Thay đồng hồ / sửa số | `4`, `5` | Chi tiết phòng |

Khi phòng đổi khách giữa kỳ, màn hình ghi số hàng loạt **từ chối và chỉ sang wizard** thay vì
đoán `contract_id` sai.

### Ghi số và chốt sổ là hai bước tách rời

```
Ghi số → [sửa được, is_billed=0] → Chốt sổ → [xem trước] → Phát hành → Thu tiền
```

Ranh giới bất biến của `invoice_details` là **lúc có tiền vào**, không phải lúc phát hành:

| Trạng thái | Sửa được? |
|---|---|
| Nháp · Đã phát hành mà `paid_amount = 0` | ✅ nút **Sửa số liệu** trên trang chi tiết |
| Trả một phần · Đã trả đủ | ❌ xoá giao dịch thu tiền trước, hoặc huỷ + điều chỉnh |
| Đã huỷ | ❌ |

Sửa số lượng dòng điện/nước sẽ **ghi ngược về `meter_readings`** (`consumption`, `reading`) và
viết lại `description` — để hoá đơn và sổ đồng hồ không kể hai câu chuyện khác nhau. Dòng gộp
nhiều lần đọc thì không tự đồng bộ được, UI sẽ báo để bạn sửa ở màn hình Ghi số.

Huỷ hoá đơn trả chỉ số về hàng chờ (`is_billed = 0`) để chốt lại.

### Đoạn tiêu thụ phòng trống

`meter_readings.contract_id = NULL` nghĩa là không ai thuê trong đoạn đó → khi chốt sổ nó
thành dòng `expenses` (chi phí chủ nhà), **không** vào hoá đơn nào.

---

### Xác nhận và validate

Mọi thao tác **sửa hoặc xoá dữ liệu** đều có hộp thoại xác nhận nêu rõ hệ quả — không phải câu
"Bạn có chắc không?" chung chung. Thao tác chỉ đọc hoặc dễ lùi (lưu cấu hình) thì không hỏi,
vì hỏi quá nhiều sẽ khiến người dùng bấm Đồng ý theo phản xạ.

Validate hai lớp: client cho phản hồi tức thì (viền đỏ, dòng lỗi dưới ô), server là luật thật.
Màn hình Ghi số phân biệt **lỗi** (chặn lưu) và **cảnh báo** (cho lưu nhưng hỏi lại).

Ba guard ở backend đáng chú ý:

- **Gõ thiếu chữ số** — nhập `160` khi số cũ `1.600` sẽ bị hiểu là quay vòng → `98.560 kWh`.
  Backend chặn khi tiêu thụ suy ra vượt 10 lần trung bình, trừ khi khai báo đã thay đồng hồ.
- **Trừ cọc** không được vượt số cọc đang giữ.
- **Trừ cọc phải có lý do** — dùng `Rule::requiredIf` chứ không `required_with`, vì
  `required_with` kích hoạt cả khi truyền `0`.

Chi tiết đầy đủ: [`docs/03-admin-flow.md`](docs/03-admin-flow.md) mục 10.

### Hệ thống log theo ngày

Theo convention lease-mart: `storage/logs/{Y-m-d}/`, mỗi vùng một file.

```
storage/logs/2026-08-13/
├── error.log      MỌI lỗi, bất kể vùng nào — mở đây trước khi đi tìm
├── api.log        request ghi dữ liệu: method, path, status, thời gian, payload
├── billing.log    chốt sổ · phát hành · huỷ · sửa hoá đơn · thu tiền
├── readings.log   ghi số điện nước
└── tenancy.log    nhận khách · trả phòng
```

Mỗi entry hai dòng: thông điệp, rồi khối `#Request:` ghi `METHOD | URI | ACTION | IP | AGENT`
(lỗi thêm `REFERER`). Không có khối này thì log lỗi gần như vô dụng khi truy nguyên nhân.

**Lỗi ghi vào cả hai chỗ** — file vùng và `error.log` — là cố ý: đọc `billing.log` thấy trọn
mạch nghiệp vụ không khuyết chỗ thất bại, còn mở `error.log` là biết ngay hôm nay hỏng những gì.
Dòng trong `error.log` có tiền tố `[vùng]`.

Dọn log cũ:

```bash
php artisan logs:prune --days=90 --dry-run   # xem trước
php artisan logs:prune --days=90
```

Vì sao cần ghi vết: DB không có FK và hoá đơn sửa được khi chưa thu tiền, nên khi số liệu lệch
thì file log là nơi duy nhất trả lời được *"ai đổi cái gì, lúc nào"*. Xem
[`App\Support\AuditLog`](backend/app/Support/AuditLog.php).

### Thông điệp động

Một khuôn thông điệp, nhãn field thay vào — không viết tay từng câu:

| Tầng | Nơi khai | Cách dùng |
|---|---|---|
| Backend | [`lang/vi/validation.php`](backend/lang/vi/validation.php) | `:attribute` của Laravel, kèm bảng `attributes` dịch tên field |
| Frontend | [`lib/messages.js`](frontend/src/lib/messages.js) | `FIELD` (nhãn) + `MESSAGE` (khuôn có `{field}`), gọi qua `msg()` |

```js
check('deduction', value, [required, notNegative, max(held, '2.000.000đ')])
// → "Tiền trừ cọc không được vượt quá 2.000.000đ"
```

Hai bảng nhãn phải khớp nhau, nếu không người dùng thấy hai tên cho cùng một field.
`APP_LOCALE=vi` nên thông điệp validate của Laravel cũng ra tiếng Việt — trước đó chúng lọt
nguyên văn tiếng Anh lên UI.

---

## Kiểm chứng

Bốn bộ test chạy qua HTTP API (không gọi Eloquent trực tiếp, đúng những gì frontend gọi):

| Bộ | Nội dung |
|---|---|
| **e2e** 22/22 | Ghi số → chốt sổ → phát hành → thu tiền → **trả phòng giữa tháng rồi cho thuê lại cùng tháng** → báo cáo |
| **Sửa hoá đơn** 13/13 | Sửa được khi chưa thu · ghi ngược chỉ số · khoá lại khi có tiền · mở khoá khi xoá giao dịch |
| **Chốt lẻ** 13/13 | Chốt một phòng không đụng phòng khác · idempotent · chốt nốt ra đúng tổng |
| **Guard validate** 11/11 | Chặn gõ thiếu chữ số · cho qua khi khai thay đồng hồ · chặn trừ cọc vượt hạn / thiếu lý do |
| **Thu tiền** 14/14 | Thu từ danh sách hoá đơn · thu một phần → `status 3` · thu nốt → `status 4` · biến mất khỏi danh sách còn nợ |

Ca khó nhất — trả phòng giữa tháng rồi cho thuê lại — sinh 2 hoá đơn cùng phòng cùng kỳ và
đưa đoạn điện nước lúc phòng trống vào chi phí chủ nhà, không tính cho khách nào.

---

## Chưa có (cố ý)

- **Xác thực** — app chạy nội bộ một người dùng. Mở ra ngoài LAN thì bọc `routes/api.php`
  bằng middleware auth.
- **Upload ảnh** — cột `photo_path` và bảng `attachments` đã có trong schema, chưa nối UI.
- **In hoá đơn PDF** — hiện dùng `window.print()` với CSS `@media print`.
