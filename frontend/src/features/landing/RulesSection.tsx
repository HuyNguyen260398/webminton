export function RulesSection() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="kicker">Chơi vui, thi đấu hết mình</span>
            <h2>
              MỘT GIẢI ĐẤU.
              <br />
              BỐN ĐỘI CÙNG CHÁY.
            </h2>
          </div>
          <p>
            Bốc thăm cân bằng trình độ. Không tự chọn đồng đội. Mỗi điểm đều có
            ý nghĩa trên bảng xếp hạng.
          </p>
        </div>
        <div className="cards">
          <article className="card">
            <div className="number">04</div>
            <h3>Đội cùng tranh tài</h3>
            <p>
              Chia đều theo giới tính và trình độ. Tối thiểu 16, lý tưởng 24 VĐV
              cùng lên sân.
            </p>
          </article>
          <article className="card yellow">
            <div className="number">03</div>
            <h3>Nội dung thi đấu</h3>
            <p>
              Đôi nam · Đôi nữ · Đôi nam nữ.
              <br />
              Mỗi trận một séc, 21 điểm. Hòa thì hơn hai điểm, trần 25.
            </p>
          </article>
          <article className="card dark">
            <div className="number">24</div>
            <h3>Trận, hết mình từng điểm</h3>
            <p>
              18 trận vòng tròn, tiếp nối 6 trận tranh hạng. Nhất gặp nhì; ba
              gặp tư.
            </p>
          </article>
        </div>
        <div className="rules-note">
          <strong>Nhớ luật trước khi lên sân:</strong> Xếp hạng theo tổng điểm
          ghi được → số trận thắng → hiệu số → đối đầu do BTC phân định. Đổi sân
          ở điểm 11. Vắng mặt: đối phương thắng 21–0. Vòng tranh hạng vẫn đánh
          đủ 3 nội dung.
        </div>
      </div>
    </section>
  );
}
