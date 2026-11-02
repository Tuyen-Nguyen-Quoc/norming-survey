// Every text the raters see. Edit freely, then upload this file to GitHub again.
//
// - Keep the quotes or backticks around each text, and the comma after it.
// - Words in curly brackets, such as {n} or {max}, are filled in by the survey; keep them as they are.
// - Texts whose name ends in "Html" may contain tags such as <p>…</p> (paragraph) and <b>…</b> (bold).
//   Keep the tags paired.

const TEXTS = {
  pageTitle: 'Khảo sát đánh giá từ vựng',

  // ---------- Welcome page ----------
  welcomeTitle: 'Khảo sát đánh giá từ vựng Trung - Việt - Anh',

  // Study information and consent: replace the bracketed text with your approved wording.
  studyInfoHtml: `
    <p><b>Tên nghiên cứu</b>: Sự đồng kích hoạt ngôn ngữ ở những người sử dụng ba ngôn ngữ Việt - Anh – Trung</p>
    <p><b>Mục đích</b>: Nghiên cứu tìm hiểu cách người học cả tiếng Anh và tiếng Trung nhận biết và xử lý từ vựng của ba ngôn ngữ. Khảo sát này thu thập đánh giá của bạn về một số từ tiếng Trung, tiếng Việt và tiếng Anh; kết quả được dùng để chọn từ cho các thí nghiệm tiếp theo.
    <p><b>Bạn sẽ làm gì</b>:</p>
<p>1. Đánh giá mức độ <b>quen thuộc</b> của từng từ (thang điểm 1–7).</p>
<p>2. Đánh giá mức độ <b>giống nhau</b> về âm và về nghĩa giữa các cặp từ <b>tiếng Việt – tiếng Trung</b>.</p>
<p>3. Đánh giá mức độ <b>giống nhau</b> về nghĩa giữa các cặp từ <b>tiếng Anh – tiếng Trung</b>.</p>
    <p>Không có câu trả lời đúng hay sai. Bạn có thể tạm dừng và quay lại bằng chính đường link này.</p>
    <p>Quyền lợi: <b>Khoản tiền 65,000đ</b>. Bạn cũng góp phần giúp hiểu rõ hơn việc học nhiều ngoại ngữ.</p>
    <p>Rủi ro: Nghiên cứu không có rủi ro đáng kể. Bạn có thể thấy hơi mệt vì phải tập trung khá lâu, vì vậy hãy nghỉ giữa các phần nếu cần.
</p>
    <p><b>Đồng ý tham gia</b></p>
<p>Khi đánh dấu vào ô đồng ý ở cuối trang, bạn xác nhận rằng:</p>
<p>1. Bạn đã đọc và hiểu các thông tin về nghiên cứu ở trên.</p>
<p>2. Bạn từ đủ 18 tuổi trở lên.</p>
<p>3. Bạn tham gia hoàn toàn tự nguyện và có thể dừng bất cứ lúc nào mà không cần nêu lý do.</p>
<p>4. Bạn đồng ý để nhóm nghiên cứu sử dụng câu trả lời của mình cho mục đích nghiên cứu, theo cam kết bảo mật dưới đây.</p>
  `,

  durationText: 'Thời gian dự kiến: khoảng 45–50 phút, có giờ nghỉ ở giữa.',
  deviceAdviceText: 'Bạn nên làm khảo sát trên máy tính xách tay, ở nơi yên tĩnh. Nếu phải dừng giữa chừng, bạn có thể mở lại đúng đường link này trên cùng thiết bị và trình duyệt để làm tiếp từ chỗ đã dừng.',

  participantHeading: 'Thông tin người tham gia',

  confidentialityHtml: `
    <p>Thông tin cá nhân mà bạn cung cấp dưới đây (họ và tên, mã số sinh viên, email, số điện thoại) sẽ được giữ bí mật nghiêm ngặt và chỉ được sử dụng cho mục đích nghiên cứu. Thông tin này được lưu riêng, tách biệt với các câu trả lời của bạn. Chỉ nhóm nghiên cứu được tiếp cận thông tin của bạn, và thông tin sẽ không được chia sẻ với bất kỳ bên nào khác. Kết quả nghiên cứu chỉ được công bố dưới dạng tổng hợp, không nêu danh tính người tham gia.</p>
    <p>Việc tham gia là hoàn toàn tự nguyện: bạn có thể dừng bất cứ lúc nào mà không cần nêu lý do, và có thể yêu cầu xóa dữ liệu của mình bằng cách liên hệ nhóm nghiên cứu.</p>
    <p>Thông tin cá nhân sẽ được xóa khi không còn cần thiết cho nghiên cứu.</p>
    <p>Nếu có thắc mắc, vui lòng liên hệ:</p>
    <p>Thầy Nguyễn Quốc Tuyển, tuyen.nq@ou.edu.vn</p>
    <p>Cô Hoàng Diễm Phúc, phuc.hd@ou.edu.vn.</p>
  `,

  raterIdShown: 'Mã người tham gia của bạn: {id}',

  fields: {
    // Shown only when the link has no ?id=
    rater_id: {
      label: 'Mã người tham gia',
      hint: 'Mã do nhóm nghiên cứu gửi cho bạn, ví dụ: R07.',
      error: 'Vui lòng nhập mã người tham gia (chỉ gồm chữ và số, ví dụ: R07).',
    },
    full_name: { label: 'Họ và tên', error: 'Vui lòng nhập họ và tên.' },
    student_id: { label: 'Mã số sinh viên', error: 'Vui lòng nhập mã số sinh viên.' },
    email: { label: 'Email', error: 'Email chưa đúng định dạng (ví dụ: ten@example.com).' },
    phone: { label: 'Số điện thoại', error: 'Số điện thoại chưa đúng (gồm 10 chữ số, bắt đầu bằng số 0).' },
  },

  consentCheckbox: 'Tôi đã đọc các thông tin trên và đồng ý tham gia nghiên cứu.',
  consentError: 'Vui lòng đánh dấu vào ô đồng ý để bắt đầu.',
  startButton: 'Bắt đầu',

  // ---------- Returning to the link ----------
  resumeTitle: 'Chào mừng bạn quay lại',
  resumeText: 'Bạn sẽ làm tiếp từ chỗ đã dừng. Những câu bạn đã trả lời vẫn được giữ nguyên.',

  // ---------- General ----------
  continueButton: 'Tiếp tục',
  loading: 'Đang tải…',
  loadError: 'Không tải được nội dung khảo sát. Vui lòng kiểm tra kết nối mạng rồi tải lại trang.',
  notReadyTitle: 'Khảo sát chưa sẵn sàng',
  notReadyText: 'Khảo sát này chưa được kết nối để lưu câu trả lời. Vui lòng liên hệ nhóm nghiên cứu.',
  testBadge: 'Chạy thử',
  offlineNotice: 'Đang mất kết nối. Câu trả lời vẫn được giữ trên máy này và sẽ tự gửi lại khi có mạng.',

  langName: { zh: 'tiếng Trung', vi: 'tiếng Việt', en: 'tiếng Anh' },

  // Progress line above each screen
  partName: {
    familiarity: 'Phần 1: Độ quen thuộc',
    similarity: 'Phần 2: Tiếng Việt và tiếng Trung',
    meaning_en: 'Phần 3: Tiếng Anh và tiếng Trung',
  },
  blockSuffix: ', khối {pos}/3 ({lang})',
  practiceCount: 'Luyện tập {n}/{total}',

  // ---------- Practice ----------
  practiceDoneTitle: 'Hết phần luyện tập',
  practiceDoneText: 'Từ đây trở đi là phần chính.',
  startMainButton: 'Bắt đầu phần chính',

  // ---------- Part 1: familiarity ----------
  famIntroTitle: 'Phần 1: Mức độ quen thuộc của từ',
  famIntroHtml: `
    <p>Trong phần này, bạn sẽ thấy lần lượt từng từ, chia thành ba khối: một khối tiếng Trung, một khối tiếng Việt và một khối tiếng Anh.</p>
    <p>Với mỗi từ, hãy cho biết bạn quen thuộc với từ đó đến mức nào, từ <b>1</b> (tôi không biết từ này) đến <b>7</b> (rất quen thuộc).</p>
    <p>Không có câu trả lời đúng hay sai. Hãy trả lời theo cảm nhận đầu tiên, không cần suy nghĩ lâu và không tra từ điển. Một vài mục có thể không phải là từ có thật; nếu bạn không biết một mục nào đó, hãy chọn 1.</p>
    <p>Bạn có thể bấm vào ô số hoặc nhấn phím 1–7 trên bàn phím. Sau khi bạn chọn, từ tiếp theo sẽ tự hiện ra.</p>
  `,
  famBlockTitle: 'Khối {pos}/3: từ {lang}',
  famBlockText: 'Hãy cho biết bạn quen thuộc với mỗi từ {lang} đến mức nào. Khối này bắt đầu bằng 2 từ để luyện tập.',
  famBlockNote: { zh: 'Các từ được viết bằng chữ Hán giản thể.', vi: '', en: '' },
  famQuestion: 'Bạn quen thuộc với từ này đến mức nào?',
  famLow: 'Tôi không biết từ này',
  famHigh: 'Rất quen thuộc',

  // ---------- Part 2: Vietnamese–Chinese ----------
  simIntroTitle: 'Phần 2: So sánh từ tiếng Việt và tiếng Trung',
  simIntroHtml: `
    <p>Mỗi màn hình có một từ tiếng Việt (bên trái) và một từ tiếng Trung (bên phải). Hãy trả lời hai câu hỏi:</p>
    <ol>
      <li><b>Hai từ này nghe giống nhau đến mức nào?</b> Từ 1 (hoàn toàn không giống) đến 7 (gần như giống hệt).</li>
      <li><b>Nghĩa của hai từ này giống nhau đến mức nào?</b> Từ 1 (hoàn toàn khác nhau) đến 7 (giống hệt nhau).</li>
    </ol>
    <p>Nếu bạn không biết từ tiếng Trung, hãy bấm <b>Tôi không biết từ tiếng Trung này</b>: bạn sẽ bỏ qua cả hai câu hỏi và chuyển sang cặp từ tiếp theo.</p>
    <p>{suggestNote}</p>
    <p>Phím 1–7 dùng cho câu hỏi đang được đánh dấu. Phần này bắt đầu bằng 2 cặp từ để luyện tập.</p>
  `,
  soundQuestion: 'Hai từ này nghe giống nhau đến mức nào?',
  soundLow: 'Hoàn toàn không giống',
  soundHigh: 'Gần như giống hệt',
  simDkn: 'Tôi không biết từ tiếng Trung này',
  simSuggest: 'Theo bạn, từ tiếng Việt nào sát nghĩa với từ tiếng Trung này hơn? (không bắt buộc)',
  answerBoth: 'Vui lòng trả lời cả câu hỏi thứ nhất.',

  // Shared by parts 2 and 3
  meaningQuestion: 'Nghĩa của hai từ này giống nhau đến mức nào?',
  meaningLow: 'Hoàn toàn khác nhau',
  meaningHigh: 'Giống hệt nhau',
  suggestNote: 'Nếu bạn chọn từ 1 đến {max} ở câu hỏi về nghĩa, một ô sẽ hiện ra để bạn ghi từ mà bạn thấy sát nghĩa hơn (không bắt buộc).',
  suggestPlaceholder: 'Nhập một từ, hoặc để trống',

  // ---------- Part 3: English–Chinese ----------
  menIntroTitle: 'Phần 3: So sánh nghĩa từ tiếng Anh và tiếng Trung',
  menIntroHtml: `
    <p>Mỗi màn hình có một từ tiếng Anh (bên trái) và một từ tiếng Trung (bên phải). Hãy cho biết <b>nghĩa của hai từ giống nhau đến mức nào</b>, từ 1 (hoàn toàn khác nhau) đến 7 (giống hệt nhau).</p>
    <p>Nếu bạn không biết một trong hai từ, hãy bấm <b>Tôi không biết một trong hai từ này</b>.</p>
    <p>{suggestNote}</p>
    <p>Phần này bắt đầu bằng 2 cặp từ để luyện tập.</p>
  `,
  menDkn: 'Tôi không biết một trong hai từ này',
  menSuggest: 'Theo bạn, từ tiếng Anh nào sát nghĩa với từ tiếng Trung này hơn? (không bắt buộc)',

  // ---------- Attention checks ----------
  checkSingle: 'Câu kiểm tra: với mục này, vui lòng chọn {n}.',
  checkPair: 'Câu kiểm tra: với mục này, vui lòng chọn {n} ở cả hai câu hỏi.',

  // ---------- Breaks ----------
  breakTitle: 'Nghỉ một chút',
  breakBlockText: 'Bạn đã xong khối {pos}/3. Hãy nghỉ một lát nếu cần, rồi bấm Tiếp tục.',
  breakTaskText: 'Bạn đã xong phần 2. Còn phần cuối, ngắn hơn. Hãy nghỉ một lát nếu cần, rồi bấm Tiếp tục.',
  midBreakTitle: 'Giờ nghỉ giữa khảo sát',
  midBreakHtml: '<p>Bạn đã xong phần 1, khoảng một nửa khảo sát. Hãy nghỉ vài phút: đứng dậy, uống nước, cho mắt nghỉ ngơi.</p>',
  midBreakWait: 'Bạn có thể tiếp tục sau {s} giây.',

  // ---------- End ----------
  endTitle: 'Sắp xong rồi',
  endText: 'Bạn đã hoàn thành cả ba phần.',
  commentLabel: 'Bạn có gặp vấn đề gì khi làm khảo sát không? (không bắt buộc)',
  commentPlaceholder: 'Ví dụ: một từ hiển thị không đúng, một câu hỏi khó hiểu…',
  finishButton: 'Gửi và hoàn tất',

  savingTitle: 'Đang lưu câu trả lời…',
  savingText: 'Vui lòng không đóng trang này.',

  doneTitle: 'Cảm ơn bạn!',
  doneText: 'Tất cả câu trả lời của bạn đã được lưu. Bạn có thể đóng trang này.',

  failTitle: 'Chưa lưu được câu trả lời',
  failHtml: `
    <p>Có thể do kết nối mạng. Câu trả lời của bạn vẫn được giữ trên máy này. Hãy bấm <b>Thử lại</b>.</p>
    <p>Nếu vẫn không được, hãy bấm <b>Tải câu trả lời của tôi</b> và gửi tệp vừa tải về qua email cho tuyen.nq@ou.edu.vn.</p>
  `,
  retryButton: 'Thử lại',
  downloadButton: 'Tải câu trả lời của tôi',
};
