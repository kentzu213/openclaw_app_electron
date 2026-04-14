# Hello Starizzi — Extension Mẫu

Tiện ích demo cho nền tảng Starizzi. Minh họa cách sử dụng các API cốt lõi: **storage**, **notifications**, **network**, và **commands**.

## Cài đặt

1. Mở Starizzi Desktop App
2. Vào **🧩 Tiện ích mở rộng** → **📦 Cài .ocx**
3. Chọn file `.ocx` (hoặc copy thư mục này vào thư mục extensions)

## Tính năng

| Command | Mô tả |
|---------|-------|
| `hello-starizzi.greet` | Hiển thị lời chào |
| `hello-starizzi.fetchQuote` | Lấy trích dẫn ngẫu nhiên từ API |
| `hello-starizzi.counter` | Đếm số lần sử dụng (lưu vào storage) |

## Quyền cần thiết

- `storage.local` — Lưu đếm số lần dùng
- `ui.notification` — Hiển thị thông báo
- `net.http` — Gọi API lấy trích dẫn

## Phát triển

```bash
# Cấu trúc thư mục
hello-starizzi/
├── manifest.json      # Khai báo extension
├── dist/
│   └── index.js       # Entry point (compiled)
└── README.md
```

## License

MIT
