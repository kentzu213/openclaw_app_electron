# SOP — OpenClaw ↔ Antigravity phối hợp làm việc

## Mục tiêu
Dùng OpenClaw làm bộ điều phối và execution lane chính. Dùng Antigravity làm IDE companion trong cùng repo.

## Vai trò
- OpenClaw
  - nhận yêu cầu
  - audit repo
  - chọn milestone
  - giao việc / thực thi
  - chạy build/check
  - commit
  - báo cáo trạng thái
- Antigravity
  - mở đúng workspace
  - hỗ trợ đọc code, chat theo ngữ cảnh repo
  - hỗ trợ thao tác IDE tại chỗ

## Quy tắc vận hành
1. Repo phải được chốt rõ trước khi bắt đầu.
2. OpenClaw luôn là nguồn sự thật cho:
   - checklist đã có / còn thiếu / đang làm
   - trạng thái build
   - trạng thái git
   - commit cuối cùng
3. Antigravity không được coi là đã làm xong cho đến khi OpenClaw xác minh qua:
   - file thay đổi
   - build/check
   - git status / git log
4. Nếu ACP runtime không ổn định, ưu tiên fallback sang acpx trực tiếp.
5. Nếu Antigravity chỉ mở UI/chat mà không tạo deliverable xác minh được, chuyển execution về OpenClaw ngay.

## Luồng chuẩn
1. Nhận task
2. Audit repo
3. Chốt milestone gần nhất có thể tạo giá trị chạy được
4. Mở Antigravity đúng workspace nếu cần hỗ trợ IDE
5. OpenClaw thực thi hoặc giám sát execution lane
6. Build/check
7. Commit
8. Báo cáo ngắn

## Format báo cáo chuẩn
- DA_CO:
- CON_THIEU:
- DANG_LAM:
- FILE_THAY_DOI:
- BUILD_TEST:
- COMMIT:
- BLOCK:

## Khi nào dùng Antigravity
- cần quan sát workspace trực quan
- cần companion chat trong IDE
- cần điều hướng code nhanh trong editor

## Khi nào không chờ Antigravity
- không có thay đổi file xác minh được
- không có log/build/commit rõ ràng
- CLI chỉ mở app nhưng không có control loop kín

## Default cho repo Starizzi B2C
- OpenClaw: execution lane chính
- Antigravity: companion lane
- mọi xác nhận hoàn thành phải quay về git/build/check do OpenClaw kiểm tra
