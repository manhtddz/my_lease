-- =============================================================================
-- QUẢN LÝ NHÀ TRỌ — SCHEMA v1
-- MySQL 8.0+ / MariaDB 10.6+  ·  InnoDB  ·  utf8mb4
--
-- Quy ước:
--   - Tiền tệ: BIGINT, đơn vị VND (KHÔNG dùng DECIMAL/FLOAT cho tiền)
--   - Chỉ số đồng hồ: DECIMAL(12,2) (nước có thể lẻ)
--   - Kỳ: period_ym CHAR(6) dạng 'YYYYMM'
--   - Phân loại: CHAR(1) mã số, ý nghĩa ghi ở COMMENT ngay cạnh cột
--   - Cờ bật/tắt: TINYINT(1) 0/1
--   - Soft delete: cột `del_flag` TINYINT (0=còn, 1=đã xoá) — KHÔNG dùng deleted_at
--     (theo convention lease-mart: config `deleted_flag.off/on`)
--   - KHÔNG dùng FOREIGN KEY — quan hệ do tầng app đảm bảo (fake FK).
--     Mọi cột *_id đều có index tường minh vì không còn index tự sinh từ FK.
--
-- CHU KỲ TÍNH TIỀN
--   Mặc định: tháng dương lịch, chốt NGÀY CUỐI THÁNG, mọi phòng cùng lúc.
--     period_from = ngày 1, period_to = ngày cuối tháng. Không có billing_day.
--   Ngoại lệ (chốt sớm giữa tháng): khách trả phòng và muốn thanh toán ngay
--     → phát hành hoá đơn tất toán (is_settlement=1), period_to = ngày trả phòng.
--     Phòng đó có thể ký HĐ MỚI ngay trong tháng → hoá đơn thứ 2 cùng period_ym,
--     khác contract_id. UNIQUE(contract_id, period_ym) vẫn đúng.
--
-- HỆ QUẢ QUAN TRỌNG — meter_readings KHÔNG khoá theo tháng:
--   Một đồng hồ có thể đọc nhiều lần trong 1 tháng (chốt trả phòng, khách mới
--   vào, đọc cuối tháng). Nó là CHUỖI theo read_date, khoá UNIQUE(meter, ngày).
--   Mỗi dòng mang contract_id = ai chịu ĐOẠN tiêu thụ dẫn tới nó;
--   NULL = phòng trống, chủ chịu → ghi vào expenses.
--
-- ĐÃ CHỐT:
--   - Tiền rác: CỐ ĐỊNH 20.000đ/phòng/tháng (pricing_mode='1')
--   - Đoạn phòng trống khi đọc gộp: KHÔNG tách, gộp vào khách trả phòng.
--     Chỉ tách khi phòng trống dài ngày → tạo dòng reason='3' (khách ra) riêng.
--   - CÓ ở ghép (contract_occupants), nhưng KHÔNG trả riêng:
--     1 hợp đồng = 1 người đứng tên trả tiền. payments không gắn occupant.
--   - Tiền phòng nằm ở contracts.rent_amount, KHÔNG nằm trong contract_services.
--     service_items.is_service = 0 đánh dấu khoản không được đưa vào bảng giá HĐ.
-- =============================================================================


-- =============================================================================
-- BẢNG MÃ PHÂN LOẠI (CHAR(1))
-- =============================================================================
-- buildings.type            1=dãy trọ            2=căn hộ
-- rooms.status              1=trống              2=đang thuê       3=bảo trì
-- tenants.gender            1=nam                2=nữ              3=khác
-- contracts.status          1=nháp               2=hiệu lực        3=đã kết thúc
--                           4=đã huỷ
-- meters.type               1=điện               2=nước
-- meter_readings.reason     1=định kỳ            2=khách vào       3=khách ra
--                           4=thay đồng hồ       5=điều chỉnh
-- service_items.pricing_mode 1=cố định           2=theo chỉ số     3=theo đầu người
--                           4=theo ngày
-- service_items.meter_type  1=điện               2=nước
-- invoices.status           1=nháp               2=đã phát hành    3=trả một phần
--                           4=đã trả đủ          5=đã huỷ
-- payments.kind             1=tiền thuê/dịch vụ  2=thu cọc         3=hoàn cọc
--                           4=khác
-- payments.method           1=tiền mặt           2=chuyển khoản    3=khác
-- expenses.category         1=hoá đơn tiện ích   2=sửa chữa        3=thuế
--                           4=thiết bị           5=internet        6=khác
-- =============================================================================


-- Bỏ comment 2 dòng dưới nếu muốn script tự tạo database:
-- CREATE DATABASE IF NOT EXISTS `nha_tro`
--     DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE `nha_tro`;

SET NAMES utf8mb4;

-- =============================================================================
-- NHÓM A — TÀI SẢN
-- =============================================================================

DROP TABLE IF EXISTS `buildings`;
CREATE TABLE `buildings` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name`       VARCHAR(255) NOT NULL                  COMMENT 'Tên dãy trọ / căn hộ',
    `type`       CHAR(1) NOT NULL DEFAULT '1'           COMMENT 'Loại: 1=dãy trọ, 2=căn hộ',
    `address`    VARCHAR(500) NULL,
    `note`       TEXT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Toà nhà / dãy trọ';


DROP TABLE IF EXISTS `rooms`;
CREATE TABLE `rooms` (
    `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `building_id`  INT UNSIGNED NOT NULL                COMMENT 'FK ảo -> buildings.id',
    `code`         VARCHAR(50)  NOT NULL                COMMENT 'Số phòng: 101, 102...',
    `area_m2`      DECIMAL(8,2) NULL,
    `default_rent` BIGINT UNSIGNED NOT NULL DEFAULT 0   COMMENT 'Giá GỢI Ý khi tạo HĐ — KHÔNG dùng để tính tiền',
    `status`       CHAR(1) NOT NULL DEFAULT '1'         COMMENT 'Trạng thái: 1=trống, 2=đang thuê, 3=bảo trì',
    `note`         TEXT NULL,
    `created_at`   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_rooms_building_code` (`building_id`, `code`),
    KEY `idx_rooms_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Phòng cho thuê';


-- =============================================================================
-- NHÓM B — NGƯỜI THUÊ & HỢP ĐỒNG
-- =============================================================================

DROP TABLE IF EXISTS `tenants`;
CREATE TABLE `tenants` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `full_name`  VARCHAR(255) NOT NULL,
    `phone`      VARCHAR(20)  NULL,
    `id_card_no` VARCHAR(20)  NULL                      COMMENT 'Số CCCD/CMND',
    `dob`        DATE NULL,
    `gender`     CHAR(1) NULL                           COMMENT 'Giới tính: 1=nam, 2=nữ, 3=khác',
    `hometown`   VARCHAR(500) NULL                      COMMENT 'Thường trú — phục vụ khai tạm trú',
    `email`      VARCHAR(255) NULL,
    `note`       TEXT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    KEY `idx_tenants_phone` (`phone`),
    KEY `idx_tenants_id_card` (`id_card_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Người thuê (người đứng tên hợp đồng)';


DROP TABLE IF EXISTS `contracts`;
CREATE TABLE `contracts` (
    `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code`            VARCHAR(50)  NULL                 COMMENT 'Mã HĐ hiển thị, vd HD-2026-001',
    `room_id`         INT UNSIGNED NOT NULL             COMMENT 'FK ảo -> rooms.id',
    `tenant_id`       INT UNSIGNED NOT NULL             COMMENT 'FK ảo -> tenants.id — người đứng tên & trả tiền',
    `start_date`      DATE NOT NULL,
    `end_date`        DATE NULL                         COMMENT 'Ngày hết hạn theo HĐ',
    `actual_end_date` DATE NULL                         COMMENT 'Ngày trả phòng thực tế',
    `rent_amount`     BIGINT UNSIGNED NOT NULL          COMMENT 'SNAPSHOT giá thuê/tháng — NGUỒN DUY NHẤT của tiền phòng',
    `deposit_amount`  BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `occupant_count`  TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Tổng số người ở, kể cả người đứng tên',
    `status`          CHAR(1) NOT NULL DEFAULT '2'      COMMENT 'Trạng thái: 1=nháp, 2=hiệu lực, 3=đã kết thúc, 4=đã huỷ',
    `note`            TEXT NULL,
    `created_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_contracts_code` (`code`),
    KEY `idx_contracts_room_start` (`room_id`, `start_date`),
    KEY `idx_contracts_tenant` (`tenant_id`),
    KEY `idx_contracts_status` (`status`),
    CONSTRAINT `chk_contracts_dates` CHECK (`end_date` IS NULL OR `end_date` >= `start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Hợp đồng thuê — nơi CHỐT giá thuê, không phải rooms';


DROP TABLE IF EXISTS `contract_occupants`;
CREATE TABLE `contract_occupants` (
    `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `contract_id`   INT UNSIGNED NOT NULL               COMMENT 'FK ảo -> contracts.id',
    `full_name`     VARCHAR(255) NOT NULL,
    `id_card_no`    VARCHAR(20)  NULL,
    `dob`           DATE NULL,
    `phone`         VARCHAR(20)  NULL,
    `relationship`  VARCHAR(100) NULL                   COMMENT 'Quan hệ với người đứng tên',
    `moved_in_at`   DATE NULL,
    `moved_out_at`  DATE NULL,
    `is_registered` TINYINT(1) NOT NULL DEFAULT 0       COMMENT 'Đã khai tạm trú: 0=chưa, 1=rồi',
    `note`          TEXT NULL,
    `created_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    KEY `idx_occupants_contract` (`contract_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Người ở ghép — khai tạm trú. KHÔNG dùng để tách tiền: 1 HĐ chỉ 1 người trả';


-- =============================================================================
-- NHÓM C — ĐỒNG HỒ ĐIỆN NƯỚC
-- =============================================================================

DROP TABLE IF EXISTS `meters`;
CREATE TABLE `meters` (
    `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `room_id`         INT UNSIGNED NOT NULL            COMMENT 'FK ảo -> rooms.id',
    `type`            CHAR(1) NOT NULL                 COMMENT 'Loại: 1=điện, 2=nước',
    `serial_no`       VARCHAR(100) NULL,
    `digits`          TINYINT UNSIGNED NOT NULL DEFAULT 5  COMMENT 'Số chữ số — dùng phát hiện quay vòng',
    `initial_reading` DECIMAL(12,2) NOT NULL DEFAULT 0     COMMENT 'Chỉ số lúc lắp',
    `installed_at`    DATE NOT NULL,
    `removed_at`      DATE NULL,
    `is_active`       TINYINT(1) NOT NULL DEFAULT 1    COMMENT '0=đã tháo, 1=đang dùng',
    `note`            TEXT NULL,
    `created_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    KEY `idx_meters_room_type_active` (`room_id`, `type`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Đồng hồ điện/nước — tách bảng để xử lý thay đồng hồ';


DROP TABLE IF EXISTS `meter_readings`;
CREATE TABLE `meter_readings` (
    `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `meter_id`        INT UNSIGNED NOT NULL            COMMENT 'FK ảo -> meters.id',
    `room_id`         INT UNSIGNED NOT NULL            COMMENT 'FK ảo -> rooms.id (denorm, luôn = meters.room_id)',

    -- Mắt xích trong chuỗi đọc. KHÔNG khoá theo tháng: một đồng hồ có thể
    -- được đọc nhiều lần trong cùng tháng (trả phòng giữa tháng, khách mới vào).
    `read_date`       DATE NOT NULL                    COMMENT 'Ngày đọc THỰC TẾ, không phải biên kỳ kế toán',
    `reading`         DECIMAL(12,2) NOT NULL           COMMENT 'Chỉ số trên mặt đồng hồ tại read_date',
    `prev_reading_id` INT UNSIGNED NULL                COMMENT 'FK ảo -> meter_readings.id (mắt xích trước); NULL = đầu chuỗi',
    `prev_reading`    DECIMAL(12,2) NOT NULL           COMMENT 'SNAPSHOT chỉ số trước — không suy ra bằng join',
    `prev_read_date`  DATE NULL                        COMMENT 'SNAPSHOT ngày đọc trước',
    `consumption`     DECIMAL(12,2) NOT NULL           COMMENT 'LƯU TRỰC TIẾP — rollover/thay đồng hồ làm != reading-prev_reading',

    -- Quy trách nhiệm cho ĐOẠN tiêu thụ (prev_read_date -> read_date)
    `contract_id`     INT UNSIGNED NULL                COMMENT 'FK ảo -> contracts.id. NULL = phòng trống -> CHỦ chịu, ghi vào expenses',
    `reason`          CHAR(1) NOT NULL DEFAULT '1'     COMMENT 'Lý do đọc: 1=định kỳ, 2=khách vào, 3=khách ra, 4=thay đồng hồ, 5=điều chỉnh',
    `period_ym`       CHAR(6) NOT NULL                 COMMENT 'NHÃN kỳ để nhóm báo cáo — KHÔNG unique',

    `is_estimated`    TINYINT(1) NOT NULL DEFAULT 0    COMMENT 'Số ước tính: 0=đọc thật, 1=ước tính',
    `is_billed`       TINYINT(1) NOT NULL DEFAULT 0    COMMENT 'Đã đưa vào hoá đơn/chi phí: 0=chưa, 1=rồi — chặn tính 2 lần',
    `photo_path`      VARCHAR(500) NULL,
    `note`            TEXT NULL,
    `created_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_readings_meter_date` (`meter_id`, `read_date`),
    KEY `idx_readings_room_period` (`room_id`, `period_ym`),
    KEY `idx_readings_contract` (`contract_id`),
    KEY `idx_readings_prev` (`prev_reading_id`),
    KEY `idx_readings_unbilled` (`is_billed`, `room_id`),
    CONSTRAINT `chk_readings_consumption` CHECK (`consumption` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='CHUỖI chỉ số đồng hồ theo ngày đọc — dữ liệu gốc bất biến';


-- =============================================================================
-- NHÓM D — DANH MỤC DỊCH VỤ & BẢNG GIÁ
-- =============================================================================

DROP TABLE IF EXISTS `service_items`;
CREATE TABLE `service_items` (
    `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code`          VARCHAR(50)  NOT NULL,
    `name`          VARCHAR(255) NOT NULL,
    `pricing_mode`  CHAR(1) NOT NULL                    COMMENT 'Cách tính: 1=cố định, 2=theo chỉ số, 3=theo đầu người, 4=theo ngày',
    `meter_type`    CHAR(1) NULL                        COMMENT 'Nguồn số liệu: 1=điện, 2=nước. NULL=không từ đồng hồ',
    `unit_label`    VARCHAR(50) NULL                    COMMENT 'kWh, m3, người, ngày',
    `default_price` BIGINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Chỉ để prefill khi tạo HĐ',
    `is_service`    TINYINT(1) NOT NULL DEFAULT 1       COMMENT '1=phí dịch vụ, được đưa vào contract_services. 0=KHÔNG (vd tiền phòng)',
    `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
    `sort_order`    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `created_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_service_items_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Danh mục khoản thu — thêm phí mới = 1 dòng INSERT, không migration';


DROP TABLE IF EXISTS `contract_services`;
CREATE TABLE `contract_services` (
    `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `contract_id`     INT UNSIGNED NOT NULL             COMMENT 'FK ảo -> contracts.id',
    `service_item_id` INT UNSIGNED NOT NULL             COMMENT 'FK ảo -> service_items.id (chỉ item có is_service=1)',
    `unit_price`      BIGINT UNSIGNED NOT NULL          COMMENT 'SNAPSHOT giá cho HĐ này — tăng giá không ảnh hưởng HĐ cũ',
    `quantity_fixed`  DECIMAL(12,2) NULL                COMMENT 'Số lượng cố định, vd 2 xe máy',
    `is_active`       TINYINT(1) NOT NULL DEFAULT 1,
    `note`            TEXT NULL,
    `created_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_contract_services` (`contract_id`, `service_item_id`),
    KEY `idx_cs_service_item` (`service_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bảng giá PHÍ DỊCH VỤ của từng HĐ. Tiền phòng KHÔNG ở đây (xem contracts.rent_amount)';


-- =============================================================================
-- NHÓM E — HOÁ ĐƠN & THANH TOÁN
-- =============================================================================

DROP TABLE IF EXISTS `invoices`;
CREATE TABLE `invoices` (
    `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code`          VARCHAR(50)  NULL                   COMMENT 'Mã hiển thị, vd INV-202608-101',
    `contract_id`   INT UNSIGNED NOT NULL               COMMENT 'FK ảo -> contracts.id',
    `room_id`       INT UNSIGNED NOT NULL               COMMENT 'FK ảo -> rooms.id (denorm để lọc theo phòng)',
    `period_ym`     CHAR(6) NOT NULL,
    `period_from`   DATE NOT NULL                       COMMENT 'Mặc định ngày 1 (hẹp lại nếu vào giữa tháng)',
    `period_to`     DATE NOT NULL                       COMMENT 'Mặc định ngày CUỐI THÁNG (hẹp lại nếu ra giữa tháng)',
    `issue_date`    DATE NOT NULL,
    `due_date`      DATE NULL,
    `subtotal`      BIGINT NOT NULL DEFAULT 0           COMMENT 'Tổng invoice_details',
    `discount`      BIGINT NOT NULL DEFAULT 0,
    `carried_over`  BIGINT NOT NULL DEFAULT 0           COMMENT 'Nợ kỳ trước chuyển sang',
    `total`         BIGINT NOT NULL DEFAULT 0           COMMENT 'subtotal - discount + carried_over',
    `paid_amount`   BIGINT NOT NULL DEFAULT 0           COMMENT 'Cập nhật từ payments',
    `is_settlement` TINYINT(1) NOT NULL DEFAULT 0       COMMENT 'Hoá đơn tất toán trả phòng: 0=thường, 1=tất toán',
    `status`        CHAR(1) NOT NULL DEFAULT '1'        COMMENT 'Trạng thái: 1=nháp, 2=đã phát hành, 3=trả một phần, 4=đã trả đủ, 5=đã huỷ',
    `note`          TEXT NULL,
    `created_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    -- KHÔNG unique(contract_id, period_ym): hoá đơn huỷ / xoá mềm vẫn chiếm chỗ
    -- trong unique index, làm bế tắc ca "đã chốt sổ rồi khách mới báo trả phòng".
    -- Chống trùng do tầng app lo, nhất quán với triết lý fake FK của schema này.
    KEY `idx_invoices_contract_period` (`contract_id`, `period_ym`),
    UNIQUE KEY `uk_invoices_code` (`code`),
    KEY `idx_invoices_period_status` (`period_ym`, `status`),
    KEY `idx_invoices_room` (`room_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Hoá đơn tháng — chống chốt sổ trùng ở tầng app, không ở DB';


DROP TABLE IF EXISTS `invoice_details`;
CREATE TABLE `invoice_details` (
    `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `invoice_id`       INT UNSIGNED NOT NULL            COMMENT 'FK ảo -> invoices.id',
    `service_item_id`  INT UNSIGNED NOT NULL            COMMENT 'FK ảo -> service_items.id',
    `description`      VARCHAR(500) NOT NULL            COMMENT 'SNAPSHOT text, vd "Điện 1250 -> 1398 (148 kWh)"',
    `meter_reading_id` INT UNSIGNED NULL                COMMENT 'FK ảo -> meter_readings.id — bằng chứng cho khách đối chiếu',
    `quantity`         DECIMAL(12,3) NOT NULL DEFAULT 1 COMMENT 'kWh / m3 / số người / SỐ NGÀY (khi ở lẻ tháng)',
    `unit_price`       BIGINT NOT NULL                  COMMENT 'SNAPSHOT — KHÔNG join contract_services khi hiển thị',
    `amount`           BIGINT NOT NULL                  COMMENT 'ROUND(quantity * unit_price) — app tính',
    `sort_order`       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `note`             TEXT NULL,
    `created_at`       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    KEY `idx_details_invoice` (`invoice_id`),
    KEY `idx_details_service_item` (`service_item_id`),
    KEY `idx_details_meter_reading` (`meter_reading_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Chi tiết hoá đơn — BẤT BIẾN sau khi phát hành';


DROP TABLE IF EXISTS `payments`;
CREATE TABLE `payments` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `contract_id` INT UNSIGNED NOT NULL                 COMMENT 'FK ảo -> contracts.id',
    `invoice_id`  INT UNSIGNED NULL                     COMMENT 'FK ảo -> invoices.id. NULL = thu/hoàn cọc, không gắn hoá đơn tháng',
    `kind`        CHAR(1) NOT NULL DEFAULT '1'          COMMENT 'Loại: 1=tiền thuê/dịch vụ, 2=thu cọc, 3=hoàn cọc, 4=khác',
    `amount`      BIGINT NOT NULL                       COMMENT 'Âm = chi ra (hoàn cọc)',
    `paid_at`     DATE NOT NULL,
    `method`      CHAR(1) NOT NULL DEFAULT '1'          COMMENT 'Hình thức: 1=tiền mặt, 2=chuyển khoản, 3=khác',
    `ref_no`      VARCHAR(100) NULL                     COMMENT 'Mã giao dịch chuyển khoản',
    `note`        TEXT NULL,
    `created_at`  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    KEY `idx_payments_invoice` (`invoice_id`),
    KEY `idx_payments_contract_date` (`contract_id`, `paid_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Thu tiền — hỗ trợ trả nhiều lần / trả thiếu. 1 HĐ chỉ 1 người trả';


-- =============================================================================
-- NHÓM F — CHI PHÍ & FILE ĐÍNH KÈM
-- =============================================================================

DROP TABLE IF EXISTS `expenses`;
CREATE TABLE `expenses` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `building_id` INT UNSIGNED NULL                     COMMENT 'FK ảo -> buildings.id',
    `room_id`     INT UNSIGNED NULL                     COMMENT 'FK ảo -> rooms.id. NULL = chi phí chung cả dãy',
    `category`    CHAR(1) NOT NULL                      COMMENT 'Loại: 1=hoá đơn tiện ích, 2=sửa chữa, 3=thuế, 4=thiết bị, 5=internet, 6=khác',
    `period_ym`   CHAR(6) NULL                          COMMENT 'Kỳ tương ứng, để đối chiếu thu-chi',
    `amount`      BIGINT NOT NULL,
    `spent_at`    DATE NOT NULL,
    `vendor`      VARCHAR(255) NULL                     COMMENT 'EVN, Cty nước, thợ sửa...',
    `note`        TEXT NULL,
    `created_at`  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    KEY `idx_expenses_period` (`period_ym`),
    KEY `idx_expenses_building` (`building_id`),
    KEY `idx_expenses_room` (`room_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Chi phí chủ nhà — không có bảng này thì không biết lời lỗ thật';


DROP TABLE IF EXISTS `attachments`;
CREATE TABLE `attachments` (
    `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `attachable_type` VARCHAR(100) NOT NULL             COMMENT 'tenant | contract | meter_reading | expense | room',
    `attachable_id`   INT UNSIGNED NOT NULL,
    `path`            VARCHAR(500) NOT NULL,
    `original_name`   VARCHAR(255) NULL,
    `mime`            VARCHAR(100) NULL,
    `size`            INT UNSIGNED NULL,
    `note`            VARCHAR(255) NULL,
    `created_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `del_flag`   TINYINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'Xoá mềm: 0=còn, 1=đã xoá',
    PRIMARY KEY (`id`),
    KEY `idx_attachments_morph` (`attachable_type`, `attachable_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Ảnh CCCD, ảnh đồng hồ, HĐ scan, hoá đơn EVN';


DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
    `setting_key`   VARCHAR(100) NOT NULL   COMMENT 'không đặt tên cột là `key` — từ khoá MySQL',
    `setting_value` TEXT NULL,
    `note`          VARCHAR(255) NULL,
    `updated_at`    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Cấu hình app: thông tin chủ trọ, số tài khoản in trên hoá đơn...';


DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
    `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name`              VARCHAR(255) NOT NULL,
    `email`             VARCHAR(255) NOT NULL,
    `password`          VARCHAR(255) NOT NULL,
    `email_verified_at` TIMESTAMP NULL,
    `remember_token`    VARCHAR(100) NULL,
    `created_at`        TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tài khoản đăng nhập (bạn + người nhà)';


-- =============================================================================
-- SEED DATA
-- =============================================================================

INSERT INTO `buildings` (`id`, `name`, `type`, `address`) VALUES
    (1, 'Dãy trọ', '1', NULL),
    (2, 'Căn hộ',  '2', NULL);

INSERT INTO `rooms` (`building_id`, `code`, `default_rent`, `status`) VALUES
    (1, '101', 2000000, '1'),
    (1, '102', 2000000, '1'),
    (1, '103', 2000000, '1'),
    (1, '104', 2000000, '1'),
    (1, '105', 2000000, '1'),
    (2, 'CH',  5000000, '1');

-- is_service = 0 cho 'rent': tiền phòng lấy từ contracts.rent_amount,
-- không bao giờ nằm trong contract_services.
INSERT INTO `service_items`
    (`code`, `name`, `pricing_mode`, `meter_type`, `unit_label`, `default_price`, `is_service`, `sort_order`) VALUES
    ('rent',     'Tiền phòng',  '1', NULL, 'tháng', 0,     0, 10),
    ('electric', 'Tiền điện',   '2', '1',  'kWh',   3500,  1, 20),
    ('water',    'Tiền nước',   '2', '2',  'm3',    15000, 1, 30),
    ('garbage',  'Tiền rác',    '1', NULL, 'tháng', 20000, 1, 40),
    ('internet', 'Internet',    '1', NULL, 'tháng', 0,     1, 50),
    ('parking',  'Gửi xe',      '1', NULL, 'xe',    0,     1, 60),
    ('other',    'Khoản khác',  '1', NULL, NULL,    0,     1, 99);

INSERT INTO `settings` (`setting_key`, `setting_value`, `note`) VALUES
    ('owner_name',   NULL, 'Tên chủ trọ in trên hoá đơn'),
    ('owner_phone',  NULL, 'SĐT liên hệ'),
    ('bank_account', NULL, 'Số tài khoản nhận chuyển khoản'),
    ('bank_name',    NULL, 'Tên ngân hàng'),
    ('invoice_note', NULL, 'Ghi chú mặc định cuối hoá đơn'),
    ('due_days',     '5',  'Số ngày sau ngày phát hành là hạn thanh toán');

-- Đồng hồ: mỗi phòng 1 điện + 1 nước
INSERT INTO `meters` (`room_id`, `type`, `initial_reading`, `installed_at`)
SELECT `id`, '1', 0, CURDATE() FROM `rooms`
UNION ALL
SELECT `id`, '2', 0, CURDATE() FROM `rooms`;


-- =============================================================================
-- VIEWS TIỆN DỤNG
-- =============================================================================

CREATE OR REPLACE VIEW `v_room_current_contract` AS
SELECT
    r.`id`              AS room_id,
    b.`name`            AS building_name,
    r.`code`            AS room_code,
    r.`status`          AS room_status,
    c.`id`              AS contract_id,
    c.`rent_amount`,
    c.`start_date`,
    c.`end_date`,
    c.`occupant_count`,
    t.`id`              AS tenant_id,
    t.`full_name`       AS tenant_name,
    t.`phone`           AS tenant_phone
FROM `rooms` r
    JOIN `buildings` b ON b.`id` = r.`building_id`
    LEFT JOIN `contracts` c
        ON c.`room_id` = r.`id`
       AND c.`status`  = '2'                      -- hiệu lực
       AND c.`del_flag` = 0
    LEFT JOIN `tenants` t ON t.`id` = c.`tenant_id`
WHERE r.`del_flag` = 0;


-- Chỉ số gần nhất của mỗi đồng hồ — dùng để prefill prev_reading khi nhập số mới
CREATE OR REPLACE VIEW `v_meter_last_reading` AS
SELECT
    m.`id`         AS meter_id,
    m.`room_id`,
    m.`type`,
    mr.`id`        AS last_reading_id,
    mr.`read_date` AS last_read_date,
    mr.`reading`   AS last_reading
FROM `meters` m
    LEFT JOIN `meter_readings` mr
        ON mr.`id` = (
            SELECT x.`id` FROM `meter_readings` x
            WHERE x.`meter_id` = m.`id` AND x.`del_flag` = 0
            ORDER BY x.`read_date` DESC, x.`id` DESC
            LIMIT 1
        )
WHERE m.`is_active` = 1 AND m.`del_flag` = 0;


-- Các đoạn tiêu thụ chưa được tính tiền — hàng chờ khi chốt sổ
CREATE OR REPLACE VIEW `v_unbilled_consumption` AS
SELECT
    mr.`id`          AS reading_id,
    mr.`room_id`,
    m.`type`         AS meter_type,
    mr.`prev_read_date`,
    mr.`read_date`,
    mr.`consumption`,
    mr.`contract_id`,
    mr.`reason`,
    CASE WHEN mr.`contract_id` IS NULL
         THEN 'expense'    -- phòng trống, chủ chịu
         ELSE 'invoice'    -- tính cho khách
    END              AS destination
FROM `meter_readings` mr
    JOIN `meters` m ON m.`id` = mr.`meter_id`
WHERE mr.`is_billed` = 0 AND mr.`del_flag` = 0;


CREATE OR REPLACE VIEW `v_invoice_balance` AS
SELECT
    i.`id`          AS invoice_id,
    i.`period_ym`,
    i.`room_id`,
    i.`contract_id`,
    i.`total`,
    COALESCE(SUM(p.`amount`), 0)              AS paid,
    i.`total` - COALESCE(SUM(p.`amount`), 0)  AS remaining,
    i.`status`
FROM `invoices` i
    LEFT JOIN `payments` p
        ON p.`invoice_id` = i.`id`
       AND p.`del_flag` = 0
WHERE i.`del_flag` = 0
  AND i.`status` <> '5'                           -- không tính hoá đơn đã huỷ
GROUP BY i.`id`;


-- Lời lỗ theo tháng.
-- Doanh thu = subtotal - discount. KHÔNG dùng invoices.total vì total đã cộng
-- carried_over (nợ kỳ trước) — cộng vào sẽ tính doanh thu 2 lần.
CREATE OR REPLACE VIEW `v_monthly_pnl` AS
SELECT
    period_ym,
    SUM(income)  AS total_income,
    SUM(outcome) AS total_expense,
    SUM(income) - SUM(outcome) AS profit
FROM (
    SELECT i.`period_ym`, i.`subtotal` - i.`discount` AS income, 0 AS outcome
    FROM `invoices` i
    WHERE i.`del_flag` = 0 AND i.`status` <> '5'
    UNION ALL
    SELECT e.`period_ym`, 0, e.`amount`
    FROM `expenses` e
    WHERE e.`del_flag` = 0 AND e.`period_ym` IS NOT NULL
) x
GROUP BY period_ym;


-- =============================================================================
-- GHI CHÚ ĐỔI GIẢ ĐỊNH
-- =============================================================================
-- Tiền phòng vào contract_services thay vì contracts.rent_amount:
--     UPDATE service_items SET is_service = 1 WHERE code = 'rent';
--     ALTER TABLE contracts DROP COLUMN rent_amount;
--     → mọi chỗ đọc giá thuê phải join contract_services
--
-- =============================================================================
-- QUY TẮC BẤT BIẾN (enforce ở tầng app — DB không có FK, không tự bảo vệ)
-- =============================================================================
--   - KHÔNG có FOREIGN KEY: xoá/sửa bản ghi cha KHÔNG được DB chặn.
--     Tầng app phải tự kiểm tra tồn tại trước khi ghi, và tự chặn xoá khi còn
--     bản ghi con. Chạy các truy vấn "KIỂM TRA TOÀN VẸN" bên dưới định kỳ.
--   - Ranh giới bất biến của invoice_details là LÚC CÓ TIỀN VÀO, không phải lúc
--     phát hành: sửa được khi paid_amount = 0 và status thuộc {1 nháp, 2 phát hành}.
--     Đã thu (3, 4) hoặc đã huỷ (5) → xoá giao dịch thu tiền trước, hoặc huỷ và
--     tạo hoá đơn điều chỉnh.
--   - Khi sửa số lượng của dòng điện/nước, phải GHI NGƯỢC về meter_readings
--     (consumption + reading) và viết lại description — nếu không hai bảng lệch
--     nhau và mô tả trên hoá đơn nói sai số.
--   - invoice_details.unit_price LUÔN copy từ contract_services (hoặc
--     contracts.rent_amount với tiền phòng) lúc chốt sổ. KHÔNG BAO GIỜ join
--     lại contract_services khi render hoá đơn cũ.
--   - contract_services chỉ chứa service_items có is_service = 1.
--     Tiền phòng lấy từ contracts.rent_amount.
--   - meter_readings.consumption do app tính (có xử lý rollover) rồi ghi vào,
--     không dùng generated column.
--   - Mỗi dòng meter_readings được tiêu thụ ĐÚNG MỘT LẦN: hoặc thành
--     invoice_details (contract_id NOT NULL), hoặc thành expenses (contract_id
--     NULL = phòng trống). Set is_billed=1 sau khi dùng để chặn tính 2 lần.
--   - Chuỗi đọc phải liền mạch: reading mới LUÔN lấy prev_reading từ dòng đọc
--     gần nhất của cùng meter_id (theo read_date), không phải "tháng trước".
--   - invoices.period_from / period_to là NGUỒN SỰ THẬT của biên kỳ. Sau khi
--     phát hành, không sửa. Ngày cuối tháng do app tính lúc chốt sổ:
--       period_from = DATE(CONCAT(period_ym,'01'))
--       period_to   = LAST_DAY(period_from)
--     rồi thu hẹp theo contracts.start_date / actual_end_date nếu vào/ra
--     giữa tháng.
--   - contract_occupants CHỈ phục vụ khai tạm trú và đếm đầu người.
--     Không dùng để tách tiền: mọi payments đều gắn contract, không gắn occupant.
--
-- TIỀN PHÒNG LẺ THÁNG (khách vào/ra giữa tháng)
--   Không nhân phân số (15/31 = 0.48 -> lệch tiền, khó giải thích cho khách).
--   Quy về ĐƠN GIÁ NGÀY, làm tròn đơn giá TRƯỚC rồi mới nhân:
--     days_in_month = DAY(LAST_DAY(period_from))
--     days_stayed   = DATEDIFF(period_to, period_from) + 1
--     unit_price    = ROUND(contracts.rent_amount / days_in_month)
--     quantity      = days_stayed
--     amount        = unit_price * days_stayed
--     description   = 'Tiền phòng 16/08-31/08 (16 ngày)'
--   Ở trọn tháng thì quantity = 1, unit_price = rent_amount (không quy ngày).
--   service_items.pricing_mode='4' (theo ngày) dùng cho trường hợp lẻ này.
--
-- =============================================================================
-- TRUY VẤN THAM CHIẾU (dùng khi cài đặt tầng app)
-- =============================================================================
--
-- [1] Nhập chỉ số mới cho 1 đồng hồ — lấy mắt xích trước:
--     SELECT last_reading_id, last_read_date, last_reading
--     FROM v_meter_last_reading WHERE meter_id = ?;
--
-- [2] Hợp đồng nào chịu đoạn tiêu thụ kết thúc tại read_date ?
--     Chọn HĐ phủ khoảng (prev_read_date, read_date]. Nếu không có -> NULL.
--     SELECT c.id FROM contracts c
--     WHERE c.room_id = ?
--       AND c.del_flag = 0
--       AND c.status IN ('2','3')                             -- hiệu lực / đã kết thúc
--       AND c.start_date <= ?                                 -- read_date
--       AND (COALESCE(c.actual_end_date, c.end_date) IS NULL
--            OR COALESCE(c.actual_end_date, c.end_date) >= ?)  -- prev_read_date
--     ORDER BY c.start_date DESC LIMIT 1;
--
-- [3] Chốt sổ kỳ 'YYYYMM' — các HĐ cần ra hoá đơn (kể cả HĐ đã kết thúc
--     giữa kỳ, và 2 HĐ cùng phòng):
--     SELECT c.* FROM contracts c
--     WHERE c.del_flag = 0
--       AND c.status IN ('2','3')
--       AND c.start_date <= LAST_DAY(?)                        -- ngày 1 của kỳ
--       AND (COALESCE(c.actual_end_date, c.end_date) IS NULL
--            OR COALESCE(c.actual_end_date, c.end_date) >= ?)
--       AND NOT EXISTS (SELECT 1 FROM invoices i
--                       WHERE i.contract_id = c.id AND i.period_ym = ?
--                         AND i.del_flag = 0);
--
-- [4] Các đoạn tiêu thụ chưa tính tiền, kèm đích đến:
--     SELECT * FROM v_unbilled_consumption WHERE room_id = ?;
--
-- [5] Nợ chuyển sang kỳ sau (carried_over của kỳ kế tiếp):
--     SELECT COALESCE(SUM(remaining), 0) FROM v_invoice_balance
--     WHERE contract_id = ? AND remaining > 0 AND period_ym < ?;
--
-- [6] Tất toán trả phòng — cọc còn lại:
--     SELECT c.deposit_amount
--            - COALESCE(SUM(CASE WHEN p.kind = '3'            -- hoàn cọc
--                                THEN ABS(p.amount) ELSE 0 END), 0) AS deposit_left
--     FROM contracts c
--     LEFT JOIN payments p ON p.contract_id = c.id AND p.del_flag = 0
--     WHERE c.id = ? GROUP BY c.id;
--
-- =============================================================================
-- KIỂM TRA TOÀN VẸN — QUAN TRỌNG vì không có FK
-- =============================================================================
--
-- [A] Chuỗi đọc bị đứt (prev_reading không khớp mắt xích trước):
--     SELECT mr.id, mr.meter_id, mr.read_date, mr.prev_reading, p.reading
--     FROM meter_readings mr JOIN meter_readings p ON p.id = mr.prev_reading_id
--     WHERE mr.prev_reading <> p.reading AND mr.del_flag = 0;
--
-- [B] Đoạn tiêu thụ bất thường (consumption != hiệu 2 chỉ số, không phải
--     rollover / thay đồng hồ) — cảnh báo, không phải lỗi:
--     SELECT * FROM meter_readings
--     WHERE consumption <> (reading - prev_reading)
--       AND reason NOT IN ('4','5')
--       AND del_flag = 0;
--
-- [C] Hoá đơn lệch tổng chi tiết:
--     SELECT i.id, i.subtotal, SUM(d.amount) AS details_total
--     FROM invoices i JOIN invoice_details d ON d.invoice_id = i.id
--     WHERE i.del_flag = 0 AND d.del_flag = 0
--     GROUP BY i.id HAVING i.subtotal <> SUM(d.amount);
--
-- [D] paid_amount lệch với payments:
--     SELECT vb.invoice_id, i.paid_amount, vb.paid FROM v_invoice_balance vb
--     JOIN invoices i ON i.id = vb.invoice_id
--     WHERE i.paid_amount <> vb.paid;
--
-- [E] Phòng đang 'đang thuê' nhưng không có HĐ hiệu lực (và ngược lại):
--     SELECT * FROM v_room_current_contract
--     WHERE (room_status = '2' AND contract_id IS NULL)
--        OR (room_status = '1' AND contract_id IS NOT NULL);
--
-- [F] MỒ CÔI — bản ghi con trỏ tới cha không tồn tại (chỉ xảy ra vì không có FK):
--     SELECT 'rooms.building_id'   AS col, r.id FROM rooms r
--       LEFT JOIN buildings b ON b.id = r.building_id WHERE b.id IS NULL
--     UNION ALL SELECT 'contracts.room_id', c.id FROM contracts c
--       LEFT JOIN rooms r ON r.id = c.room_id WHERE r.id IS NULL
--     UNION ALL SELECT 'contracts.tenant_id', c.id FROM contracts c
--       LEFT JOIN tenants t ON t.id = c.tenant_id WHERE t.id IS NULL
--     UNION ALL SELECT 'meter_readings.meter_id', mr.id FROM meter_readings mr
--       LEFT JOIN meters m ON m.id = mr.meter_id WHERE m.id IS NULL
--     UNION ALL SELECT 'invoice_details.invoice_id', d.id FROM invoice_details d
--       LEFT JOIN invoices i ON i.id = d.invoice_id WHERE i.id IS NULL
--     UNION ALL SELECT 'payments.contract_id', p.id FROM payments p
--       LEFT JOIN contracts c ON c.id = p.contract_id WHERE c.id IS NULL;
-- =============================================================================
