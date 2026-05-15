/** Hardcoded Vietnamese footer/legal overlays (merged onto English JSON at build time). Lives under app/assets/i18n for shipping with i18n assets. */
import { readPrivacyHtml } from './privacy-fragments/read-privacy.mjs';
import { readTermsHtml } from './terms-fragments/read-terms.mjs';
import { readRefundHtml } from './refund-fragments/read-refund.mjs';
import { readAccessibilityHtml } from './accessibility-fragments/read-accessibility.mjs';
import { readCookieTopHtml, readCookiePrefsHtml } from './cookie-fragments/read-cookies.mjs';

export default {
    privacy: {
        metaDescription:
            'Chính sách quyền riêng tư Totilove — cách chúng tôi thu thập, sử dụng và bảo vệ dữ liệu của bạn.',
        documentTitle: 'Chính sách quyền riêng tư — Totilove',
        heroTitleHtml: 'Chính sách quyền riêng tư',
        heroSubtitle: '',
        cardInnerHtml: readPrivacyHtml('vi'),
    },
    terms: {
        metaDescription: 'Điều khoản dịch vụ Totilove — quy tắc và điều kiện sử dụng nền tảng.',
        documentTitle: 'Điều khoản dịch vụ — Totilove',
        heroTitleHtml: 'Điều khoản dịch vụ',
        heroSubtitle: '',
        cardInnerHtml: readTermsHtml('vi'),
    },
    cookies: {
        metaDescription:
            'Chính sách cookie Totilove — các loại, đồng ý và quản lý tùy chọn trên trang này.',
        documentTitle: 'Cookie — Totilove',
        heroTitleHtml: 'Cookie',
        heroSubtitle: 'Tháng 4, 2026.',
        cardTopHtml: readCookieTopHtml('vi'),
        cardPrefsHtml: readCookiePrefsHtml('vi'),
    },
    refund: {
        metaDescription:
            'Chính sách hoàn tiền Totilove — gói đăng ký, điều kiện đủ điều kiện và cách yêu cầu hoàn tiền.',
        documentTitle: 'Chính sách hoàn tiền — Totilove',
        heroTitleHtml: 'Chính sách hoàn tiền',
        heroSubtitle: '',
        cardInnerHtml: readRefundHtml('vi'),
    },
    safety: {
        metaDescription: 'Mẹo an toàn Totilove — giữ an toàn khi hẹn hò trực tuyến và gặp mặt trực tiếp.',
        documentTitle: 'Mẹo an toàn — Totilove',
        heroTitleHtml: 'Mẹo an toàn',
        heroSubtitle:
            'An toàn của bạn là ưu tiên hàng đầu. Hãy làm theo các hướng dẫn này khi tương tác trực tuyến và khi gặp mặt ngoài đời.',
        cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Về trang chủ</a>
<h2><i class="fas fa-lock"></i> Bảo vệ thông tin cá nhân của bạn</h2>
<p>Không bao giờ chia sẻ thông tin cá nhân nhạy cảm với người dùng khác, đặc biệt là trong các cuộc trò chuyện ban đầu.</p>
<p>Điều này bao gồm:</p>
<ul>
<li>Họ và tên đầy đủ</li>
<li>Địa chỉ nhà riêng</li>
<li>Thông tin nơi làm việc</li>
<li>Thông tin tài chính</li>
<li>Giấy tờ tùy thân</li>
</ul>
<p>Sử dụng hệ thống nhắn tin trong ứng dụng cho đến khi bạn cảm thấy thoải mái và tin tưởng người kia.</p>
<p><strong>Lời nhắc:</strong> Không chia sẻ địa chỉ nhà &bull; Không chia sẻ thông tin ngân hàng &bull; Không chia sẻ giấy tờ tùy thân</p>
<hr class="fp-divider">
<h2><i class="fas fa-video"></i> Gọi video trước khi gặp mặt</h2>
<p>Trước khi gặp trực tiếp, chúng tôi đặc biệt khuyên bạn nên thực hiện cuộc gọi video trước.</p>
<p>Điều này giúp:</p>
<ul>
<li>xác nhận danh tính</li>
<li>xây dựng lòng tin</li>
<li>giảm nguy cơ mạo danh hoặc lừa đảo</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-map-marker-alt"></i> Buổi gặp đầu tiên an toàn</h2>
<p>Khi gặp ai đó lần đầu:</p>
<ul>
<li>Gặp ở nơi công cộng, đông người (ví dụ: quán cà phê, nhà hàng, công viên)</li>
<li>Nói cho bạn bè hoặc người thân biết kế hoạch của bạn (gặp ai, ở đâu và khi nào)</li>
<li>Tự chủ phương tiện di chuyển và tránh đi nhờ xe người lạ</li>
<li>Luôn giữ điện thoại sạc pin và có thể liên lạc được</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-flag"></i> Nhận biết các dấu hiệu cảnh báo</h2>
<p>Hãy thận trọng nếu bạn nhận thấy:</p>
<ul>
<li>Yêu cầu tiền bạc, quà cáp hoặc hỗ trợ tài chính (lừa đảo tình cảm)</li>
<li>Từ chối gọi video sau khi trò chuyện lâu dài</li>
<li>Những câu chuyện cá nhân mâu thuẫn hoặc không thực tế</li>
<li>Bị ép chuyển cuộc trò chuyện ra ngoài nền tảng (ví dụ: WhatsApp, Telegram)</li>
<li>Tâng bốc quá mức hoặc gắn bó cảm xúc nhanh chóng</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-exclamation-triangle"></i> Báo cáo &amp; chặn</h2>
<p>Nếu có điều gì đó đáng ngờ hoặc không an toàn, hãy tin vào trực giác của bạn.</p>
<p>Bạn có thể:</p>
<ul>
<li>Sử dụng nút Báo cáo trên hồ sơ hoặc tin nhắn</li>
<li>Chặn người dùng ngay lập tức từ trang hồ sơ của họ</li>
</ul>
<p>Tất cả các báo cáo được nhóm kiểm duyệt của chúng tôi xem xét nhanh nhất có thể.</p>
<hr class="fp-divider">
<h2><i class="fas fa-phone-alt"></i> Tài nguyên khẩn cấp</h2>
<p>Nếu bạn đang gặp nguy hiểm ngay lập tức, hãy liên hệ với dịch vụ khẩn cấp tại địa phương.</p>
<p>Để được hỗ trợ liên quan đến lạm dụng trực tuyến hoặc sử dụng sai hình ảnh, bạn cũng có thể tham khảo:</p>
<ul>
<li><a href="https://www.stopncii.org" target="_blank" rel="noopener noreferrer">StopNCII.org</a></li>
<li><a href="https://www.cybersmile.org" target="_blank" rel="noopener noreferrer">Cybersmile Foundation</a></li>
</ul>`,
    },
    contact: {
        metaDescription: 'Liên hệ đội hỗ trợ Totilove.',
        documentTitle: 'Liên hệ — Totilove',
        heroTitleHtml: 'Liên hệ',
        heroSubtitle: 'Chúng tôi sẵn sàng hỗ trợ. Gửi tin nhắn và chúng tôi phản hồi trong vòng 24 giờ.',
        cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Quay lại trang chủ</a>
<h2><i class="fas fa-life-ring"></i> Tiếp tục đến Hỗ trợ</h2>
<p>Các yêu cầu hỗ trợ được xử lý trong khu vực thành viên.</p>
<p>Vui lòng đăng nhập trước và bạn sẽ được chuyển hướng đến Trung tâm Hỗ trợ.</p>
<p>
<a href="/login?return=%2Fhelp&source=contact&message=Please%20log%20in%20to%20continue%20to%20Support%20Center." class="fp-btn" style="text-decoration:none;">
<i class="fas fa-sign-in-alt"></i> Đăng nhập để tiếp tục
</a>
</p>
<hr class="fp-divider">
<h2><i class="fas fa-clock"></i> Thời gian phản hồi</h2>
<p><strong>Các câu hỏi chung:</strong> trong vòng 24 giờ</p>
<p><strong>Báo cáo về an toàn và lạm dụng:</strong> trong vòng 4 giờ</p>
<p><strong>Vấn đề thanh toán:</strong> trong vòng 12 giờ</p>
<p>Đối với các vấn đề an toàn khẩn cấp, vui lòng sử dụng nút <strong>Báo cáo</strong> trực tiếp trên hồ sơ liên quan.</p>`,
    },
    accessibility: {
        metaDescription:
            'Tuyên bố khả năng tiếp cận Totilove — WCAG 2.1 AA, tính năng hỗ trợ và liên hệ.',
        documentTitle: 'Khả năng tiếp cận — Totilove',
        heroTitleHtml: 'Khả năng tiếp cận',
        heroSubtitle:
            'Totilove cam kết mang tình yêu đến với mọi người, bất kể khả năng của họ như thế nào.',
        cardInnerHtml: readAccessibilityHtml('vi'),
    },
    help: {
        metaDescription: 'Trung tâm trợ giúp Totilove.',
        documentTitle: 'Trung tâm trợ giúp — Totilove',
        heroTitleHtml: 'Trung tâm trợ giúp',
        heroSubtitle: 'Câu trả lời cho câu hỏi thường gặp và cách tận dụng Totilove.',
        cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Về trang chủ</a>
<h2><i class="fas fa-user-plus"></i> Bắt đầu</h2>
<p>Đăng ký miễn phí tại <a href="/pages/register.html">trang Đăng ký</a>. Hoàn thiện hồ sơ để tăng hiển thị ghép đôi.</p>
<hr class="fp-divider">
<h2><i class="fas fa-search-heart"></i> Tìm ghép</h2>
<p>Dùng <strong>Tìm kiếm</strong> theo tuổi, vị trí, ngôn ngữ, sở thích; hệ thống cũng gợi ý hồ sơ phù hợp.</p>
<hr class="fp-divider">
<h2><i class="fas fa-comments"></i> Tin nhắn</h2>
<p>Nhắn cho người bạn đã ghép; mở <strong>Tin nhắn</strong> trên thanh điều hướng. Nội dung được mã hóa riêng tư.</p>
<hr class="fp-divider">
<h2><i class="fas fa-cog"></i> Cài đặt tài khoản</h2>
<p>Quản lý thông báo, quyền riêng tư và ngôn ngữ trong <strong>Cài đặt</strong>. Bạn có thể vô hiệu hóa hoặc xóa tài khoản trong mục Tài khoản.</p>
<hr class="fp-divider">
<h2><i class="fas fa-credit-card"></i> Thanh toán &amp; gói</h2>
<p>Có gói miễn phí và trả phí; quản lý tại <strong>Thanh toán</strong>. Hủy bất kỳ lúc nào.</p>
<hr class="fp-divider">
<h2><i class="fas fa-envelope"></i> Vẫn cần trợ giúp?</h2>
<p><a href="/pages/footer/contact.html">Liên hệ hỗ trợ</a> — phản hồi trong 24 giờ.</p>`,
    },
    sitemap: {
        metaDescription: 'Sơ đồ trang Totilove — mọi trang trên nền tảng.',
        documentTitle: 'Sơ đồ trang — Totilove',
        heroTitleHtml: 'Sơ đồ trang',
        heroSubtitle: 'Tổng quan các trang trên Totilove.',
        cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Về trang chủ</a>
<h2><i class="fas fa-globe"></i> Tất cả trang</h2>
<div class="fp-sitemap-grid">
<div class="fp-sitemap-section">
<h3>Chính</h3>
<ul>
<li><a href="/"><i class="fas fa-angle-right"></i> Trang chủ</a></li>
<li><a href="/pages/register.html"><i class="fas fa-angle-right"></i> Đăng ký</a></li>
<li><a href="/login"><i class="fas fa-angle-right"></i> Đăng nhập</a></li>
<li><a href="/search"><i class="fas fa-angle-right"></i> Tìm kiếm</a></li>
<li><a href="/matches"><i class="fas fa-angle-right"></i> Ghép đôi</a></li>
<li><a href="/messages"><i class="fas fa-angle-right"></i> Tin nhắn</a></li>
</ul>
</div>
<div class="fp-sitemap-section">
<h3>Hồ sơ</h3>
<ul>
<li><a href="/profile-full"><i class="fas fa-angle-right"></i> Hồ sơ của tôi</a></li>
<li><a href="/profile-edit"><i class="fas fa-angle-right"></i> Sửa hồ sơ</a></li>
<li><a href="/profile-photos"><i class="fas fa-angle-right"></i> Ảnh của tôi</a></li>
<li><a href="/profile-stats"><i class="fas fa-angle-right"></i> Thống kê</a></li>
<li><a href="/activity"><i class="fas fa-angle-right"></i> Hoạt động</a></li>
</ul>
</div>
<div class="fp-sitemap-section">
<h3>Tài khoản</h3>
<ul>
<li><a href="/settings"><i class="fas fa-angle-right"></i> Cài đặt</a></li>
<li><a href="/billing"><i class="fas fa-angle-right"></i> Thanh toán</a></li>
<li><a href="/online"><i class="fas fa-angle-right"></i> Người dùng trực tuyến</a></li>
</ul>
</div>
<div class="fp-sitemap-section">
<h3>Hỗ trợ</h3>
<ul>
<li><a href="/pages/footer/help.html"><i class="fas fa-angle-right"></i> Trợ giúp</a></li>
<li><a href="/pages/footer/safety.html"><i class="fas fa-angle-right"></i> An toàn</a></li>
<li><a href="/pages/footer/contact.html"><i class="fas fa-angle-right"></i> Liên hệ</a></li>
</ul>
</div>
<div class="fp-sitemap-section">
<h3>Pháp lý</h3>
<ul>
<li><a href="/pages/footer/privacy.html"><i class="fas fa-angle-right"></i> Quyền riêng tư</a></li>
<li><a href="/pages/footer/terms.html"><i class="fas fa-angle-right"></i> Điều khoản</a></li>
<li><a href="/pages/footer/refund.html"><i class="fas fa-angle-right"></i> Hoàn tiền</a></li>
</ul>
</div>
<div class="fp-sitemap-section">
<h3>Khác</h3>
<ul>
<li><a href="/pages/footer/accessibility.html"><i class="fas fa-angle-right"></i> Tiếp cận</a></li>
<li><a href="/pages/footer/cookies.html"><i class="fas fa-angle-right"></i> Cookie</a></li>
<li><a href="/pages/footer/sitemap.html"><i class="fas fa-angle-right"></i> Sơ đồ trang</a></li>
</ul>
</div>
</div>`,
    },
};
