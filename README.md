# ✨🎥 DoLive - Tool Livestream Đa Nền Tảng (React Edition) 🎥✨

Ứng dụng web quản lý và thiết lập livestream đa nền tảng (Facebook, YouTube, TikTok hoặc RTMP tùy chỉnh) được chuyển đổi từ bản Flask/Python sang React + TypeScript + Vite.

---

## 🌟 Tính năng chính

- **Xác thực Key 1 lần/ngày (Daily Key System):**
  - Tạo key ngẫu nhiên 12 ký tự hợp lệ theo ngày (`YYYY-MM-DD`).
  - Trang nhận key tương tác với hiệu ứng phong bì thư 3D lồng ghép (`/getkey`).
  - Hỗ trợ sao chép key nhanh vào clipboard chỉ với 1 click.
  - Tự động kiểm tra thời hạn key và bảo mật trạng thái đăng nhập trên trình duyệt.

- **Đa nguồn phát Video (Video Sources):**
  - Phát từ đường dẫn file video cục bộ (`file`).
  - Phát từ đường link video mạng xã hội (YouTube/Facebook URL).

- **Đa nền tảng RTMP (RTMP Streaming Targets):**
  - **Facebook Live**: `rtmp://live-api-s.facebook.com:443/rtmp/`
  - **YouTube Live**: `rtmp://a.rtmp.youtube.com/live2/`
  - **TikTok Live**: `rtmp://push-rtmp-l1-sg01.tiktokcdn.com/game/`
  - **RTMP tùy chỉnh**: Hỗ trợ bất kỳ RTMP / RTMPS URL nào (Twitch, Kick, server riêng,...).

- **Tuỳ chọn phát nâng cao:**
  - Công tắc bật/tắt **Lặp lại stream** (Stream Loop).
  - Ẩn/hiện Stream Key với nút con mắt bảo mật.

- **Bảng theo dõi Telemetry thời gian thực (Live Dashboard):**
  - Theo dõi **Frame** (tổng số khung hình phát).
  - Tốc độ khung hình thực tế **FPS** (ví dụ ~30.0 fps).
  - Thời gian đã phát sóng **Time** (HH:MM:SS).
  - Dung lượng đã truyền tải **Size** (kB / MB).
  - Băng thông thời gian thực **Bitrate** (kbits/s).
  - Tốc độ xử lý luồng **Speed** (x).
  - Nút **Dừng livestream** tiện lợi và an toàn.

- **Thiết kế & Giao diện:**
  - Giữ trọn vẹn phong cách thiết kế đặc trưng của DoLive (gradient pastel, hiệu ứng tim rơi lấp lánh, font chữ và các hộp thoại thông báo).

---

## 🚀 Khởi chạy ứng dụng

```bash
# Cài đặt thư viện
npm install

# Chạy môi trường phát triển (Port 3000)
npm run dev

# Đóng gói sản phẩm
npm run build
```
