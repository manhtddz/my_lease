<?php

/**
 * Thông điệp validate tiếng Việt.
 *
 * Chỉ khai các rule mà dự án thực sự dùng — thêm rule mới thì bổ sung vào đây,
 * nếu thiếu Laravel sẽ rơi về tiếng Anh (dễ nhận ra để đi bù).
 *
 * Các thông điệp này hiện thẳng lên UI qua interceptor của axios, nên viết cho
 * người dùng cuối đọc, không viết cho developer.
 */
return [
    'required' => 'Vui lòng nhập :attribute.',
    'required_if' => 'Vui lòng nhập :attribute.',
    'required_with' => 'Vui lòng nhập :attribute.',
    'required_without' => 'Vui lòng nhập :attribute.',
    'filled' => ':attribute không được để trống.',
    'present' => 'Thiếu :attribute.',

    'string' => ':attribute phải là chữ.',
    'integer' => ':attribute phải là số nguyên.',
    'numeric' => ':attribute phải là số.',
    'boolean' => ':attribute phải là đúng hoặc sai.',
    'array' => ':attribute phải là danh sách.',
    'date' => ':attribute không phải ngày hợp lệ.',
    'email' => ':attribute không phải email hợp lệ.',

    'min' => [
        'numeric' => ':attribute không được nhỏ hơn :min.',
        'string' => ':attribute phải có ít nhất :min ký tự.',
        'array' => ':attribute phải có ít nhất :min phần tử.',
    ],

    'max' => [
        'numeric' => ':attribute không được lớn hơn :max.',
        'string' => ':attribute không được dài hơn :max ký tự.',
        'array' => ':attribute không được nhiều hơn :max phần tử.',
    ],

    'size' => [
        'numeric' => ':attribute phải bằng :size.',
        'string' => ':attribute phải đúng :size ký tự.',
        'array' => ':attribute phải có đúng :size phần tử.',
    ],

    'after' => ':attribute phải sau ngày :date.',
    'after_or_equal' => ':attribute phải từ ngày :date trở đi.',
    'before' => ':attribute phải trước ngày :date.',
    'before_or_equal' => ':attribute phải trước hoặc bằng ngày :date.',

    'exists' => ':attribute không tồn tại.',
    'unique' => ':attribute đã được dùng.',
    'in' => ':attribute không hợp lệ.',

    /*
     * Tên field hiện ra cho người dùng. Thiếu ở đây thì Laravel dùng luôn tên
     * cột kỹ thuật (vd "deposit_deduction"), đọc rất khó hiểu.
     */
    'attributes' => [
        'period_ym' => 'kỳ',
        'read_date' => 'ngày ghi số',
        'entries' => 'danh sách chỉ số',
        'entries.*.reading' => 'chỉ số',
        'reading' => 'chỉ số',

        'room_id' => 'phòng',
        'tenant_id' => 'người thuê',
        'tenant.full_name' => 'họ tên',
        'tenant.phone' => 'số điện thoại',
        'tenant.id_card_no' => 'CCCD/CMND',
        'tenant.dob' => 'ngày sinh',

        'start_date' => 'ngày vào',
        'end_date' => 'ngày hết hạn',
        'rent_amount' => 'tiền phòng',
        'deposit_amount' => 'tiền cọc',
        'occupant_count' => 'số người ở',
        'occupants' => 'danh sách người ở ghép',
        'occupants.*.full_name' => 'họ tên người ở ghép',

        'services' => 'phí dịch vụ',
        'services.*.unit_price' => 'đơn giá',
        'services.*.quantity_fixed' => 'số lượng',
        'meter_readings' => 'chỉ số đồng hồ',
        'meter_readings.*.reading' => 'chỉ số',

        'deposit_deduction' => 'tiền trừ cọc',
        'deduction_reason' => 'lý do trừ cọc',
        'refund_deposit' => 'hoàn cọc',
        'discount' => 'giảm giá',
        'note' => 'ghi chú',

        'amount' => 'số tiền',
        'paid_at' => 'ngày thu',
        'method' => 'hình thức thanh toán',
        'ref_no' => 'mã giao dịch',

        'category' => 'loại chi phí',
        'spent_at' => 'ngày chi',
        'vendor' => 'nhà cung cấp',

        'details' => 'chi tiết hoá đơn',
        'details.*.quantity' => 'số lượng',
        'details.*.unit_price' => 'đơn giá',

        'contract_ids' => 'danh sách hợp đồng',
        'expense_room_ids' => 'danh sách phòng',
        'default_price' => 'giá mặc định',
        'values' => 'giá trị cấu hình',
    ],
];
