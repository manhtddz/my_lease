<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
 * Laravel serve luôn bản build của React từ public/index.html, nên chạy trên
 * Herd chỉ cần MỘT domain và không mở cổng nào:
 *
 *   https://nha-tro.test/              giao diện React
 *   https://nha-tro.test/invoices/1    deep link, cũng do React Router lo
 *   https://nha-tro.test/api/...       API JSON
 *   https://nha-tro.test/assets/...    file tĩnh, web server trả trực tiếp
 *
 * Khi dev bằng `npm run dev` thì FE chạy ở cổng 5180 và không đi qua đây.
 */

Route::fallback(function (Request $request) {
    // Route API không khớp phải trả JSON 404, không trả HTML của SPA —
    // nếu không thì lỗi gọi sai endpoint hiện ra như một trang trắng.
    if ($request->is('api/*')) {
        abort(404, 'Endpoint không tồn tại.');
    }

    $index = public_path('index.html');

    abort_unless(
        file_exists($index),
        404,
        'Chưa build frontend. Chạy: cd frontend && npm run build'
    );

    return response()->file($index);
});
