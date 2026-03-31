# SA CTEL Daily Project Map

Giao diện mobile-first để theo dõi nhanh các dự án mà team SA CTEL đang handle trong ngày.

## Điểm chính

- Chỉ đọc dữ liệu từ backend API
- Không dùng `localStorage`
- Không có dữ liệu demo
- Không có nút `Nạp demo` và `Xóa dữ liệu`
- Có pixel map theo đúng tọa độ room/zone của housemap gốc mô phỏng project assignment theo zone và theo từng thành viên
- Có thể lọc nhanh theo từng người trong team

## API đang dùng

Khai báo trong `config.js`:

```js
window.APP_CONFIG = {
  apiBaseUrl: 'https://ctel-csdp-worker.thanhlm120797.workers.dev'
};
```

Frontend sẽ gọi:

- `GET /health`
- `GET /api/projects`

## Cách chạy

Chỉ cần host static các file sau:

- `index.html`
- `styles.css`
- `app.js`
- `config.js`

Ví dụ mở bằng:

- GitHub Pages
- Cloudflare Pages
- nginx / Apache
- VS Code Live Server

## Ghi chú mapping

Frontend tự ánh xạ dữ liệu backend sang mô hình hiển thị:

- `owner` -> tên thành viên trong team SA CTEL
- `stage` -> zone trên pixel map theo đúng tọa độ room/zone của housemap gốc
- `health_status` -> trạng thái hiển thị trên card dự án
- `health_score` -> điểm health để tính summary

Nếu tên `owner` từ backend không khớp với danh sách team hiện tại thì dự án vẫn hiển thị trong list, nhưng trên pixel map theo đúng tọa độ room/zone của housemap gốc sẽ rơi vào nhóm `Other`.


## v6
- Click member card or sprite on pixel map to open assign panel
- Select existing project, update PIC, stage, status, and note
- Front-end no longer stores state locally; updates are persisted via backend API


## v6.2 movement simulation
- Nhân vật tự di chuyển giữa bàn làm việc và zone dự án
- Có mô phỏng trao đổi ngắn giữa 2 thành viên tại khu meeting
- Không thay đổi backend schema; toàn bộ animation được suy ra từ dữ liệu hiện có
- Click trực tiếp vào nhân vật vẫn mở panel assign/update như bản v6
