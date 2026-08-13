<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Schema quản lý nhà trọ — theo docs/02-schema.sql.
 *
 * Quy ước:
 *   - Tiền: integer, đơn vị VND (không thập phân)
 *   - Phân loại: char(1) mã số, ý nghĩa xem App\Enums\*
 *   - KHÔNG dùng foreign key — quan hệ do tầng app đảm bảo (fake FK)
 */
return new class extends Migration
{
    public function up(): void
    {
        // ---------------------------------------------------------------
        // A · TÀI SẢN
        // ---------------------------------------------------------------
        Schema::create('buildings', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->char('type', 1)->default('1');      // 1=dãy trọ, 2=căn hộ
            $table->string('address', 500)->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá
        });

        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('building_id');
            $table->string('code', 50);
            $table->decimal('area_m2', 8, 2)->nullable();
            $table->unsignedBigInteger('default_rent')->default(0);
            $table->char('status', 1)->default('1');    // 1=trống, 2=đang thuê, 3=bảo trì
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            $table->unique(['building_id', 'code']);
            $table->index('status');
        });

        // ---------------------------------------------------------------
        // B · NGƯỜI THUÊ & HỢP ĐỒNG
        // ---------------------------------------------------------------
        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->string('full_name');
            $table->string('phone', 20)->nullable();
            $table->string('id_card_no', 20)->nullable();
            $table->date('dob')->nullable();
            $table->char('gender', 1)->nullable();      // 1=nam, 2=nữ, 3=khác
            $table->string('hometown', 500)->nullable();
            $table->string('email')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            $table->index('phone');
            $table->index('id_card_no');
        });

        Schema::create('contracts', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->nullable()->unique();
            $table->unsignedBigInteger('room_id');
            $table->unsignedBigInteger('tenant_id');
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->date('actual_end_date')->nullable();
            $table->unsignedBigInteger('rent_amount');          // NGUỒN DUY NHẤT của tiền phòng
            $table->unsignedBigInteger('deposit_amount')->default(0);
            $table->unsignedTinyInteger('occupant_count')->default(1);
            $table->char('status', 1)->default('2');    // 1=nháp, 2=hiệu lực, 3=kết thúc, 4=huỷ
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            $table->index(['room_id', 'start_date']);
            $table->index('tenant_id');
            $table->index('status');
        });

        Schema::create('contract_occupants', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contract_id');
            $table->string('full_name');
            $table->string('id_card_no', 20)->nullable();
            $table->date('dob')->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('relationship', 100)->nullable();
            $table->date('moved_in_at')->nullable();
            $table->date('moved_out_at')->nullable();
            $table->boolean('is_registered')->default(false);
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            $table->index('contract_id');
        });

        // ---------------------------------------------------------------
        // C · ĐỒNG HỒ
        // ---------------------------------------------------------------
        Schema::create('meters', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('room_id');
            $table->char('type', 1);                    // 1=điện, 2=nước
            $table->string('serial_no', 100)->nullable();
            $table->unsignedTinyInteger('digits')->default(5);
            $table->decimal('initial_reading', 12, 2)->default(0);
            $table->date('installed_at');
            $table->date('removed_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            $table->index(['room_id', 'type', 'is_active']);
        });

        Schema::create('meter_readings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('meter_id');
            $table->unsignedBigInteger('room_id');

            // Chuỗi theo ngày đọc — KHÔNG khoá theo tháng
            $table->date('read_date');
            $table->decimal('reading', 12, 2);
            $table->unsignedBigInteger('prev_reading_id')->nullable();
            $table->decimal('prev_reading', 12, 2);
            $table->date('prev_read_date')->nullable();
            $table->decimal('consumption', 12, 2);

            // Ai chịu đoạn tiêu thụ (prev_read_date -> read_date)
            $table->unsignedBigInteger('contract_id')->nullable();
            $table->char('reason', 1)->default('1');    // 1=định kỳ 2=khách vào 3=khách ra 4=thay đh 5=điều chỉnh
            $table->char('period_ym', 6);               // NHÃN, không unique

            $table->boolean('is_estimated')->default(false);
            $table->boolean('is_billed')->default(false);
            $table->string('photo_path', 500)->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            $table->unique(['meter_id', 'read_date']);
            $table->index(['room_id', 'period_ym']);
            $table->index('contract_id');
            $table->index('prev_reading_id');
            $table->index(['is_billed', 'room_id']);
        });

        // ---------------------------------------------------------------
        // D · DANH MỤC & BẢNG GIÁ
        // ---------------------------------------------------------------
        Schema::create('service_items', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->unique();
            $table->string('name');
            $table->char('pricing_mode', 1);            // 1=cố định 2=theo chỉ số 3=đầu người 4=theo ngày
            $table->char('meter_type', 1)->nullable();  // 1=điện, 2=nước
            $table->string('unit_label', 50)->nullable();
            $table->unsignedBigInteger('default_price')->default(0);
            $table->boolean('is_service')->default(true);   // 0 = không vào contract_services (tiền phòng)
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá
        });

        Schema::create('contract_services', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contract_id');
            $table->unsignedBigInteger('service_item_id');
            $table->unsignedBigInteger('unit_price');
            $table->decimal('quantity_fixed', 12, 2)->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            $table->unique(['contract_id', 'service_item_id']);
            $table->index('service_item_id');
        });

        // ---------------------------------------------------------------
        // E · HOÁ ĐƠN & THU TIỀN
        // ---------------------------------------------------------------
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->nullable()->unique();
            $table->unsignedBigInteger('contract_id');
            $table->unsignedBigInteger('room_id');
            $table->char('period_ym', 6);
            $table->date('period_from');
            $table->date('period_to');
            $table->date('issue_date');
            $table->date('due_date')->nullable();
            $table->bigInteger('subtotal')->default(0);
            $table->bigInteger('discount')->default(0);
            $table->bigInteger('carried_over')->default(0);
            $table->bigInteger('total')->default(0);
            $table->bigInteger('paid_amount')->default(0);
            $table->boolean('is_settlement')->default(false);
            $table->char('status', 1)->default('1');    // 1=nháp 2=phát hành 3=trả một phần 4=trả đủ 5=huỷ
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            // KHÔNG unique(contract_id, period_ym): hoá đơn huỷ/xoá mềm vẫn chiếm
            // chỗ trong unique index, làm bế tắc ca "chốt sổ rồi khách trả phòng".
            // Chống trùng do tầng app lo (BillingService::commit lọc HĐ đã có hoá đơn),
            // nhất quán với triết lý fake FK của schema này.
            $table->index(['contract_id', 'period_ym']);
            $table->index(['period_ym', 'status']);
            $table->index('room_id');
        });

        Schema::create('invoice_details', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('invoice_id');
            $table->unsignedBigInteger('service_item_id');
            $table->string('description', 500);
            $table->unsignedBigInteger('meter_reading_id')->nullable();
            $table->decimal('quantity', 12, 3)->default(1);
            $table->bigInteger('unit_price');
            $table->bigInteger('amount');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            $table->index('invoice_id');
            $table->index('service_item_id');
            $table->index('meter_reading_id');
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contract_id');
            $table->unsignedBigInteger('invoice_id')->nullable();
            $table->char('kind', 1)->default('1');      // 1=thuê/dịch vụ 2=thu cọc 3=hoàn cọc 4=khác
            $table->bigInteger('amount');               // âm = chi ra
            $table->date('paid_at');
            $table->char('method', 1)->default('1');    // 1=tiền mặt 2=chuyển khoản 3=khác
            $table->string('ref_no', 100)->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            $table->index('invoice_id');
            $table->index(['contract_id', 'paid_at']);
        });

        // ---------------------------------------------------------------
        // F · CHI PHÍ & FILE
        // ---------------------------------------------------------------
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('building_id')->nullable();
            $table->unsignedBigInteger('room_id')->nullable();
            $table->char('category', 1);                // 1=tiện ích 2=sửa chữa 3=thuế 4=thiết bị 5=internet 6=khác
            $table->char('period_ym', 6)->nullable();
            $table->bigInteger('amount');
            $table->date('spent_at');
            $table->string('vendor')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            $table->index('period_ym');
            $table->index('building_id');
            $table->index('room_id');
        });

        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->string('attachable_type', 100);
            $table->unsignedBigInteger('attachable_id');
            $table->string('path', 500);
            $table->string('original_name')->nullable();
            $table->string('mime', 100)->nullable();
            $table->unsignedInteger('size')->nullable();
            $table->string('note')->nullable();
            $table->timestamps();
            $table->unsignedTinyInteger('del_flag')->default(0);  // 0=còn, 1=đã xoá

            $table->index(['attachable_type', 'attachable_id']);
        });

        Schema::create('settings', function (Blueprint $table) {
            $table->string('setting_key', 100)->primary();
            $table->text('setting_value')->nullable();
            $table->string('note')->nullable();
            $table->timestamp('updated_at')->nullable();
        });
    }

    public function down(): void
    {
        foreach ([
            'settings', 'attachments', 'expenses', 'payments', 'invoice_details',
            'invoices', 'contract_services', 'service_items', 'meter_readings',
            'meters', 'contract_occupants', 'contracts', 'tenants', 'rooms', 'buildings',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
