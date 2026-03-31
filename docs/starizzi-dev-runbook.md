# Starizzi Dev Runbook

## Mục tiêu bản chạy thử
Bắt buộc người dùng đăng ký / đăng nhập rồi mới dùng app.

Hai tác vụ chính trong desktop:
1. Cài nhanh / mở OpenClaw
2. Đi tới luồng mua API của IzziAPI

## Chạy local
```bash
pnpm dev:marketplace
```

## Build toàn repo
```bash
pnpm build:all
```

## Marketplace API mode
- Nếu có `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` -> chạy `supabase mode`
- Nếu thiếu env -> chạy `demo mode`

## Demo mode hiện tại
- desktop vẫn bắt buộc đăng ký trước rồi mới đăng nhập được
- dữ liệu auth demo được lưu local trong app settings
- marketplace có catalog demo để test end-to-end local
- các route cần Supabase thật sẽ trả `503 unsupported_in_demo`

## Flow test nhanh
1. Mở desktop app
2. Đăng ký tài khoản mới
3. Đăng nhập
4. Từ Dashboard:
   - thử `Mở / cài OpenClaw`
   - thử `Mua API ngay`
5. Vào Marketplace -> cài thử extension demo
6. Vào Extensions -> kiểm tra extension đã xuất hiện

## Kỳ vọng cho phase tiếp theo
- nối Supabase thật
- nối auth thật với izziapi.com
- đưa luồng mua API / key / billing vào profile thật
- thêm install flow thực tế cho OpenClaw package/app
