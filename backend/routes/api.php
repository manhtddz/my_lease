<?php

use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\ContractController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\MeterReadingController;
use App\Http\Controllers\Api\MiscController;
use App\Http\Controllers\Api\RoomController;
use Illuminate\Support\Facades\Route;

// Ứng dụng một người dùng chạy nội bộ — chưa gắn auth.
// Khi mở ra ngoài mạng LAN thì bọc nhóm này bằng middleware xác thực.

Route::get('/meta', [MiscController::class, 'meta']);
Route::get('/dashboard', [DashboardController::class, 'index']);

// --- Ghi số điện nước ---
Route::get('/readings/sheet', [MeterReadingController::class, 'sheet']);
Route::post('/readings/bulk', [MeterReadingController::class, 'storeBulk']);
Route::get('/readings/unbilled', [MeterReadingController::class, 'unbilled']);
Route::get('/readings', [MeterReadingController::class, 'index']);
Route::put('/readings/{meterReading}', [MeterReadingController::class, 'update']);
Route::delete('/readings/{meterReading}', [MeterReadingController::class, 'destroy']);

// --- Chốt sổ ---
Route::get('/billing/preview', [BillingController::class, 'preview']);
Route::post('/billing/commit', [BillingController::class, 'commit']);

// --- Hoá đơn ---
Route::get('/invoices', [InvoiceController::class, 'index']);
Route::post('/invoices/issue-all', [InvoiceController::class, 'issueAll']);
Route::get('/invoices/{invoice}', [InvoiceController::class, 'show']);
Route::put('/invoices/{invoice}', [InvoiceController::class, 'update']);
Route::put('/invoices/{invoice}/details', [InvoiceController::class, 'updateDetails']);
Route::post('/invoices/{invoice}/issue', [InvoiceController::class, 'issue']);
Route::delete('/invoices/{invoice}', [InvoiceController::class, 'destroy']);
Route::post('/invoices/{invoice}/payments', [MiscController::class, 'storePayment']);
Route::delete('/payments/{payment}', [MiscController::class, 'destroyPayment']);

// --- Hợp đồng ---
Route::get('/contracts', [ContractController::class, 'index']);
Route::get('/contracts/move-in-defaults', [ContractController::class, 'moveInDefaults']);
Route::post('/contracts/move-in', [ContractController::class, 'moveIn']);
Route::get('/contracts/{contract}', [ContractController::class, 'show']);
Route::put('/contracts/{contract}/pricing', [ContractController::class, 'updatePricing']);
Route::post('/contracts/{contract}/cancel', [ContractController::class, 'cancel']);
Route::get('/contracts/{contract}/move-out-preview', [ContractController::class, 'moveOutPreview']);
Route::post('/contracts/{contract}/move-out', [ContractController::class, 'moveOut']);

// --- Phòng ---
Route::get('/buildings', [RoomController::class, 'buildings']);
Route::get('/rooms', [RoomController::class, 'index']);
Route::post('/rooms', [RoomController::class, 'store']);
Route::put('/rooms/{room}', [RoomController::class, 'update']);
Route::delete('/rooms/{room}', [RoomController::class, 'destroy']);

// --- Danh mục / chi phí / cấu hình / báo cáo ---
Route::get('/tenants', [MiscController::class, 'tenants']);
Route::get('/expenses', [MiscController::class, 'expenses']);
Route::post('/expenses', [MiscController::class, 'storeExpense']);
Route::delete('/expenses/{expense}', [MiscController::class, 'destroyExpense']);
Route::get('/service-items', [MiscController::class, 'serviceItems']);
Route::put('/service-items/{serviceItem}', [MiscController::class, 'updateServiceItem']);
Route::get('/settings', [MiscController::class, 'settings']);
Route::put('/settings', [MiscController::class, 'updateSettings']);
Route::get('/reports/monthly', [MiscController::class, 'monthlyReport']);
