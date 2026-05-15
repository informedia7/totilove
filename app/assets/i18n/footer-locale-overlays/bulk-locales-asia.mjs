/**
 * Hardcoded footer/legal overlays: RU, ZH, TH, PH (merged at build if no per-lang .mjs).
 */
import { readPrivacyHtml } from './privacy-fragments/read-privacy.mjs';
import { readTermsHtml } from './terms-fragments/read-terms.mjs';
import { readRefundHtml } from './refund-fragments/read-refund.mjs';
import { readAccessibilityHtml } from './accessibility-fragments/read-accessibility.mjs';
import { readCookieTopHtml, readCookiePrefsHtml } from './cookie-fragments/read-cookies.mjs';

export default {
    ru: {
        privacy: {
            metaDescription:
                'Политика конфиденциальности Totilove — как мы собираем, используем и защищаем ваши данные.',
            documentTitle: 'Политика конфиденциальности — Totilove',
            heroTitleHtml: 'Политика конфиденциальности',
            heroSubtitle: '',
            cardInnerHtml: readPrivacyHtml('ru'),
        },
        terms: {
            metaDescription:
                'Условия использования Totilove — правила и условия использования платформы.',
            documentTitle: 'Условия использования — Totilove',
            heroTitleHtml: 'Условия использования',
            heroSubtitle: '',
            cardInnerHtml: readTermsHtml('ru'),
        },
        cookies: {
            metaDescription:
                'Политика использования cookie Totilove — категории, согласие и управление на этой странице.',
            documentTitle: 'Файлы cookie — Totilove',
            heroTitleHtml: 'Файлы cookie',
            heroSubtitle: 'Апрель 2026 г.',
            cardTopHtml: readCookieTopHtml('ru'),
            cardPrefsHtml: readCookiePrefsHtml('ru'),
        },
        refund: {
            metaDescription:
                'Политика возврата средств Totilove — подписки, основания для возврата и как подать запрос.',
            documentTitle: 'Политика возврата средств — Totilove',
            heroTitleHtml: 'Политика возврата средств',
            heroSubtitle: '',
            cardInnerHtml: readRefundHtml('ru'),
        },
        safety: {
            metaDescription:
                'Советы по безопасности Totilove — оставайтесь в безопасности при онлайн-знакомствах и личных встречах.',
            documentTitle: 'Советы по безопасности — Totilove',
            heroTitleHtml: 'Советы по безопасности',
            heroSubtitle:
                'Ваша безопасность для нас на первом месте. Следуйте этим рекомендациям при общении онлайн и при личных встречах.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> На главную</a>
<h2><i class="fas fa-lock"></i> Защитите свою личную информацию</h2>
<p>Никогда не делитесь конфиденциальной личной информацией с другими пользователями, особенно в начале общения.</p>
<p>Это включает:</p>
<ul>
<li>Полное имя</li>
<li>Домашний адрес</li>
<li>Сведения о месте работы</li>
<li>Финансовую информацию</li>
<li>Удостоверяющие личность документы</li>
</ul>
<p>Используйте встроенную систему обмена сообщениями, пока не почувствуете себя комфортно и не начнете доверять другому человеку.</p>
<p><strong>Напоминание:</strong> Никаких домашних адресов &bull; Никаких банковских реквизитов &bull; Никаких удостоверений личности</p>
<hr class="fp-divider">
<h2><i class="fas fa-video"></i> Видеозвонок перед встречей</h2>
<p>Прежде чем встретиться лично, мы настоятельно рекомендуем сначала сделать видеозвонок.</p>
<p>Это поможет:</p>
<ul>
<li>подтвердить личность</li>
<li>построить доверие</li>
<li>снизить риск выдачи себя за другое лицо или мошенничества</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-map-marker-alt"></i> Безопасные первые встречи</h2>
<p>При первой встрече с кем-либо:</p>
<ul>
<li>Встречайтесь в общественном, многолюдном месте (например, кафе, ресторан, парк)</li>
<li>Сообщите другу или члену семьи о своих планах (кто, где и когда)</li>
<li>Пользуйтесь своим транспортом и избегайте поездок с незнакомцами</li>
<li>Держите телефон заряженным и всегда доступным</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-flag"></i> Распознавайте тревожные сигналы</h2>
<p>Будьте осторожны, если замечаете:</p>
<ul>
<li>Просьбы о деньгах, подарках или финансовой помощи (романтическое мошенничество)</li>
<li>Отказ от видеозвонка после длительного общения</li>
<li>Противоречивые или нереалистичные личные истории</li>
<li>Давление с целью перевести общение за пределы платформы (например, WhatsApp, Telegram)</li>
<li>Чрезмерную лесть или быструю эмоциональную привязанность</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-exclamation-triangle"></i> Пожаловаться и заблокировать</h2>
<p>Если что-то кажется подозрительным или небезопасным, доверьтесь своей интуиции.</p>
<p>Вы можете:</p>
<ul>
<li>Использовать кнопку «Пожаловаться» в профилях или сообщениях</li>
<li>Заблокировать пользователя мгновенно на странице его профиля</li>
</ul>
<p>Все жалобы проверяются нашей командой модераторов так быстро, насколько это разумно возможно.</p>
<hr class="fp-divider">
<h2><i class="fas fa-phone-alt"></i> Ресурсы экстренной помощи</h2>
<p>Если вы находитесь в непосредственной опасности, обратитесь в местные экстренные службы.</p>
<p>За помощью в связи с онлайн-злоупотреблениями или неправильным использованием изображений вы также можете обратиться к:</p>
<ul>
<li><a href="https://www.stopncii.org" target="_blank" rel="noopener noreferrer">StopNCII.org</a></li>
<li><a href="https://www.cybersmile.org" target="_blank" rel="noopener noreferrer">Cybersmile Foundation</a></li>
</ul>`,
        },
        contact: {
            metaDescription: 'Связаться со службой поддержки Totilove.',
            documentTitle: 'Контакты — Totilove',
            heroTitleHtml: 'Контакты',
            heroSubtitle:
                'Мы готовы помочь. Напишите нам — обычно отвечаем в течение 24 часов.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Назад на главную</a>
<h2><i class="fas fa-life-ring"></i> Перейти в поддержку</h2>
<p>Запросы в службу поддержки обрабатываются внутри области для участников.</p>
<p>Пожалуйста, сначала войдите в систему, и вы будете перенаправлены в Центр поддержки.</p>
<p>
<a href="/login?return=%2Fhelp&source=contact&message=Please%20log%20in%20to%20continue%20to%20Support%20Center." class="fp-btn" style="text-decoration:none;">
<i class="fas fa-sign-in-alt"></i> Войдите, чтобы продолжить
</a>
</p>
<hr class="fp-divider">
<h2><i class="fas fa-clock"></i> Время ответа</h2>
<p><strong>Общие вопросы:</strong> в течение 24 часов</p>
<p><strong>Сообщения о безопасности и нарушениях:</strong> в течение 4 часов</p>
<p><strong>Проблемы с оплатой:</strong> в течение 12 часов</p>
<p>Для срочных вопросов безопасности, пожалуйста, используйте кнопку «<strong>Пожаловаться</strong>» непосредственно на соответствующем профиле.</p>`,
        },
        accessibility: {
            metaDescription:
                'Заявление о доступности Totilove — WCAG 2.1 AA, поддерживаемые функции и обратная связь.',
            documentTitle: 'Доступность — Totilove',
            heroTitleHtml: 'Доступность',
            heroSubtitle:
                'Totilove стремится сделать любовь доступной для всех, независимо от возможностей.',
            cardInnerHtml: readAccessibilityHtml('ru'),
        },
        help: {
            metaDescription:
                'Центр помощи Totilove — ответы на частые вопросы и как получить максимум от платформы.',
            documentTitle: 'Центр помощи — Totilove',
            heroTitleHtml: 'Центр помощи',
            heroSubtitle:
                'Найдите ответы на частые вопросы и получите максимум от Totilove.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Назад на главную</a>
<h2><i class="fas fa-user-plus"></i> Первые шаги</h2>
<p>Создать аккаунт в Totilove бесплатно. Перейдите на <a href="/pages/register.html">страницу регистрации</a> и заполните свои данные. После регистрации заполните профиль, чтобы повысить свою заметность для совпадений.</p>
<hr class="fp-divider">
<h2><i class="fas fa-search-heart"></i> Поиск совпадений (матчей)</h2>
<p>Используйте <strong>Поиск</strong>, чтобы фильтровать по возрасту, местоположению, языку и интересам. Наш интеллектуальный алгоритм подбора также автоматически предлагает совместимые профили на основе ваших предпочтений.</p>
<hr class="fp-divider">
<h2><i class="fas fa-comments"></i> Сообщения</h2>
<p>Вы можете отправить сообщение любому профилю, с которым у вас совпадение. Перейдите в раздел <strong>Сообщения</strong> в панели навигации, чтобы просмотреть все диалоги. Все сообщения зашифрованы и конфиденциальны.</p>
<hr class="fp-divider">
<h2><i class="fas fa-cog"></i> Настройки аккаунта</h2>
<p>Управляйте настройками уведомлений, конфиденциальности и языком в разделе <strong>Настройки</strong>. Вы можете деактивировать или удалить свой аккаунт в любое время в разделе Аккаунт.</p>
<hr class="fp-divider">
<h2><i class="fas fa-credit-card"></i> Тарифы и подписки</h2>
<p>Totilove предлагает бесплатный тариф, а также премиум-планы. Просматривайте и управляйте своей подпиской в разделе <strong>Тарифы</strong> в меню аккаунта. Отмените в любое время — без скрытых комиссий.</p>
<hr class="fp-divider">
<h2><i class="fas fa-envelope"></i> Всё ещё нужна помощь?</h2>
<p>Не нашли ответ здесь? <a href="/pages/footer/contact.html">Свяжитесь с нашей службой поддержки</a>, и мы ответим вам в течение 24 часов.</p>`,
        },
        sitemap: {
            metaDescription: 'Карта сайта Totilove.',
            documentTitle: 'Карта сайта — Totilove',
            heroTitleHtml: 'Карта сайта',
            heroSubtitle: 'Основные разделы.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> На главную</a>
<h2><i class="fas fa-globe"></i> Страницы</h2>
<div class="fp-sitemap-grid">
<div class="fp-sitemap-section"><h3>Главное</h3><ul>
<li><a href="/"><i class="fas fa-angle-right"></i> Главная</a></li>
<li><a href="/pages/register.html"><i class="fas fa-angle-right"></i> Регистрация</a></li>
<li><a href="/login"><i class="fas fa-angle-right"></i> Вход</a></li>
<li><a href="/search"><i class="fas fa-angle-right"></i> Поиск</a></li>
<li><a href="/matches"><i class="fas fa-angle-right"></i> Совпадения</a></li>
<li><a href="/messages"><i class="fas fa-angle-right"></i> Сообщения</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Профиль</h3><ul>
<li><a href="/profile-full"><i class="fas fa-angle-right"></i> Профиль</a></li>
<li><a href="/profile-edit"><i class="fas fa-angle-right"></i> Изменить</a></li>
<li><a href="/profile-photos"><i class="fas fa-angle-right"></i> Фото</a></li>
<li><a href="/profile-stats"><i class="fas fa-angle-right"></i> Статистика</a></li>
<li><a href="/activity"><i class="fas fa-angle-right"></i> Активность</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Аккаунт</h3><ul>
<li><a href="/settings"><i class="fas fa-angle-right"></i> Настройки</a></li>
<li><a href="/billing"><i class="fas fa-angle-right"></i> Оплата</a></li>
<li><a href="/online"><i class="fas fa-angle-right"></i> Онлайн</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Поддержка</h3><ul>
<li><a href="/pages/footer/help.html"><i class="fas fa-angle-right"></i> Справка</a></li>
<li><a href="/pages/footer/safety.html"><i class="fas fa-angle-right"></i> Безопасность</a></li>
<li><a href="/pages/footer/contact.html"><i class="fas fa-angle-right"></i> Контакты</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Правовая информация</h3><ul>
<li><a href="/pages/footer/privacy.html"><i class="fas fa-angle-right"></i> Конфиденциальность</a></li>
<li><a href="/pages/footer/terms.html"><i class="fas fa-angle-right"></i> Условия</a></li>
<li><a href="/pages/footer/refund.html"><i class="fas fa-angle-right"></i> Возвраты</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Другое</h3><ul>
<li><a href="/pages/footer/accessibility.html"><i class="fas fa-angle-right"></i> Доступность</a></li>
<li><a href="/pages/footer/cookies.html"><i class="fas fa-angle-right"></i> Cookie</a></li>
<li><a href="/pages/footer/sitemap.html"><i class="fas fa-angle-right"></i> Карта сайта</a></li>
</ul></div>
</div>`,
        },
    },
    zh: {
        privacy: {
            metaDescription: 'Totilove 隐私政策 — 我们如何收集、使用和保护您的数据。',
            documentTitle: '隐私政策 — Totilove',
            heroTitleHtml: '隐私政策',
            heroSubtitle: '',
            cardInnerHtml: readPrivacyHtml('zh'),
        },
        terms: {
            metaDescription: 'Totilove 服务条款 — 使用平台的规则与条件。',
            documentTitle: '服务条款 — Totilove',
            heroTitleHtml: '服务条款',
            heroSubtitle: '',
            cardInnerHtml: readTermsHtml('zh'),
        },
        cookies: {
            metaDescription: 'Totilove Cookie 政策 — 类别、同意与本页偏好控件。',
            documentTitle: 'Cookie — Totilove',
            heroTitleHtml: 'Cookie',
            heroSubtitle: '2026年4月',
            cardTopHtml: readCookieTopHtml('zh'),
            cardPrefsHtml: readCookiePrefsHtml('zh'),
        },
        refund: {
            metaDescription: 'Totilove 退款政策 — 订阅、退款资格与申请方式。',
            documentTitle: '退款政策 — Totilove',
            heroTitleHtml: '退款政策',
            heroSubtitle: '',
            cardInnerHtml: readRefundHtml('zh'),
        },
        safety: {
            metaDescription: 'Totilove 安全提示 — 在线约会与线下见面时保护自己。',
            documentTitle: '安全提示 — Totilove',
            heroTitleHtml: '安全提示',
            heroSubtitle:
                '您的安全是我们的首要任务。请遵循以下指南，以保障线上互动与线下见面的安全。',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> 返回首页</a>
<h2><i class="fas fa-lock"></i> 保护您的个人信息</h2>
<p>切勿与其他用户分享敏感个人信息，尤其是在早期对话中。</p>
<p>这包括：</p>
<ul>
<li>全名</li>
<li>家庭地址</li>
<li>工作单位详情</li>
<li>财务信息</li>
<li>身份证件</li>
</ul>
<p>在您感到舒适并信任对方之前，请使用应用内的消息系统。</p>
<p><strong>提醒：</strong>不要透露家庭地址 &bull; 不要透露银行信息 &bull; 不要透露身份证件</p>
<hr class="fp-divider">
<h2><i class="fas fa-video"></i> 见面之前先视频通话</h2>
<p>在亲自见面之前，我们强烈建议先进行视频通话。</p>
<p>这有助于：</p>
<ul>
<li>确认身份</li>
<li>建立信任</li>
<li>减少身份冒充或欺诈的风险</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-map-marker-alt"></i> 安全的第一次见面</h2>
<p>第一次见面时：</p>
<ul>
<li>选择公共、人多的场所（例如咖啡馆、餐厅、公园）</li>
<li>告诉朋友或家人您的计划（见谁、去哪里、什么时间）</li>
<li>自行安排交通，避免接受陌生人的搭乘</li>
<li>始终保持手机电量充足并随时可用</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-flag"></i> 识别危险信号</h2>
<p>如果发现以下情况，请保持警惕：</p>
<ul>
<li>索要金钱、礼物或经济援助（情感诈骗）</li>
<li>长时间聊天后拒绝视频通话</li>
<li>个人经历前后矛盾或不切实际</li>
<li>被施压将对话转移到平台外（例如 WhatsApp、Telegram）</li>
<li>过度恭维或快速建立情感依恋</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-exclamation-triangle"></i> 举报和屏蔽</h2>
<p>如果某事感觉可疑或不安全，请相信您的直觉。</p>
<p>您可以：</p>
<ul>
<li>使用个人资料或消息上的举报按钮</li>
<li>直接从其个人资料页面屏蔽用户</li>
</ul>
<p>所有举报都会由我们的审核团队在合理范围内尽快审核。</p>
<hr class="fp-divider">
<h2><i class="fas fa-phone-alt"></i> 紧急资源</h2>
<p>如果您面临紧急危险，请联系当地紧急服务机构。</p>
<p>如需有关在线滥用或图像滥用的支持，您还可以参考：</p>
<ul>
<li><a href="https://www.stopncii.org" target="_blank" rel="noopener noreferrer">StopNCII.org</a></li>
<li><a href="https://www.cybersmile.org" target="_blank" rel="noopener noreferrer">Cybersmile Foundation</a></li>
</ul>`,
        },
        contact: {
            metaDescription: '联系 Totilove 支持团队。',
            documentTitle: '联系我们 — Totilove',
            heroTitleHtml: '联系我们',
            heroSubtitle: '我们随时为您提供帮助。发送消息，我们将在24小时内回复。',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> 返回首页</a>
<h2><i class="fas fa-life-ring"></i> 继续前往帮助中心</h2>
<p>支持请求在会员区域内处理。</p>
<p>请先登录，您将被重定向到帮助中心。</p>
<p>
<a href="/login?return=%2Fhelp&source=contact&message=Please%20log%20in%20to%20continue%20to%20Support%20Center." class="fp-btn" style="text-decoration:none;">
<i class="fas fa-sign-in-alt"></i> 登录以继续
</a>
</p>
<hr class="fp-divider">
<h2><i class="fas fa-clock"></i> 响应时间</h2>
<p><strong>一般咨询：</strong>24小时内</p>
<p><strong>安全与滥用举报：</strong>4小时内</p>
<p><strong>账单问题：</strong>12小时内</p>
<p>如有紧急安全问题，请直接使用相关个人资料上的<strong>举报</strong>按钮。</p>`,
        },
        accessibility: {
            metaDescription: 'Totilove 无障碍声明 — WCAG 2.1 AA、支持的功能与反馈渠道。',
            documentTitle: '无障碍访问 — Totilove',
            heroTitleHtml: '无障碍访问',
            heroSubtitle: 'Totilove 致力于让所有人都能获得爱情，无论其能力如何。',
            cardInnerHtml: readAccessibilityHtml('zh'),
        },
        help: {
            metaDescription: 'Totilove 帮助中心 — 常见问题解答与如何充分利用平台。',
            documentTitle: '帮助中心 — Totilove',
            heroTitleHtml: '帮助中心',
            heroSubtitle: '查找常见问题的答案，并充分利用 Totilove。',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> 返回首页</a>
<h2><i class="fas fa-user-plus"></i> 新手上路</h2>
<p>在 Totilove 上创建账户是免费的。访问<a href="/pages/register.html">注册页面</a>并填写您的信息。注册完成后，完善您的个人资料以提高匹配可见度。</p>
<hr class="fp-divider">
<h2><i class="fas fa-search-heart"></i> 寻找匹配</h2>
<p>使用<strong>搜索</strong>功能按年龄、位置、语言和兴趣进行筛选。我们的智能匹配引擎还会根据您的偏好自动推荐兼容的个人资料。</p>
<hr class="fp-divider">
<h2><i class="fas fa-comments"></i> 消息功能</h2>
<p>您可以向任何匹配成功的个人资料发送消息。前往导航栏中的<strong>消息</strong>查看所有对话。所有消息均经过加密且私密。</p>
<hr class="fp-divider">
<h2><i class="fas fa-cog"></i> 账户设置</h2>
<p>在<strong>设置</strong>中管理您的通知偏好、隐私设置和语言。您可以随时在「账户」部分停用或删除您的账户。</p>
<hr class="fp-divider">
<h2><i class="fas fa-credit-card"></i> 账单与订阅</h2>
<p>Totilove 提供免费版本和高级套餐。在账户菜单的<strong>账单</strong>部分查看和管理您的订阅。可随时取消 — 无隐藏费用。</p>
<hr class="fp-divider">
<h2><i class="fas fa-envelope"></i> 仍然需要帮助？</h2>
<p>在这里找不到答案？<a href="/pages/footer/contact.html">请联系我们的支持团队</a>，我们将在 24 小时内回复您。</p>`,
        },
        sitemap: {
            metaDescription: 'Totilove 网站地图。',
            documentTitle: '网站地图 — Totilove',
            heroTitleHtml: '网站地图',
            heroSubtitle: '主要页面一览。',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> 返回首页</a>
<h2><i class="fas fa-globe"></i> 页面</h2>
<div class="fp-sitemap-grid">
<div class="fp-sitemap-section"><h3>主要</h3><ul>
<li><a href="/"><i class="fas fa-angle-right"></i> 首页</a></li>
<li><a href="/pages/register.html"><i class="fas fa-angle-right"></i> 注册</a></li>
<li><a href="/login"><i class="fas fa-angle-right"></i> 登录</a></li>
<li><a href="/search"><i class="fas fa-angle-right"></i> 搜索</a></li>
<li><a href="/matches"><i class="fas fa-angle-right"></i> 匹配</a></li>
<li><a href="/messages"><i class="fas fa-angle-right"></i> 消息</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>个人资料</h3><ul>
<li><a href="/profile-full"><i class="fas fa-angle-right"></i> 我的资料</a></li>
<li><a href="/profile-edit"><i class="fas fa-angle-right"></i> 编辑资料</a></li>
<li><a href="/profile-photos"><i class="fas fa-angle-right"></i> 照片</a></li>
<li><a href="/profile-stats"><i class="fas fa-angle-right"></i> 统计</a></li>
<li><a href="/activity"><i class="fas fa-angle-right"></i> 动态</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>账户</h3><ul>
<li><a href="/settings"><i class="fas fa-angle-right"></i> 设置</a></li>
<li><a href="/billing"><i class="fas fa-angle-right"></i> 账单</a></li>
<li><a href="/online"><i class="fas fa-angle-right"></i> 在线用户</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>支持</h3><ul>
<li><a href="/pages/footer/help.html"><i class="fas fa-angle-right"></i> 帮助</a></li>
<li><a href="/pages/footer/safety.html"><i class="fas fa-angle-right"></i> 安全</a></li>
<li><a href="/pages/footer/contact.html"><i class="fas fa-angle-right"></i> 联系</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>法律</h3><ul>
<li><a href="/pages/footer/privacy.html"><i class="fas fa-angle-right"></i> 隐私</a></li>
<li><a href="/pages/footer/terms.html"><i class="fas fa-angle-right"></i> 条款</a></li>
<li><a href="/pages/footer/refund.html"><i class="fas fa-angle-right"></i> 退款</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>其他</h3><ul>
<li><a href="/pages/footer/accessibility.html"><i class="fas fa-angle-right"></i> 无障碍</a></li>
<li><a href="/pages/footer/cookies.html"><i class="fas fa-angle-right"></i> Cookie</a></li>
<li><a href="/pages/footer/sitemap.html"><i class="fas fa-angle-right"></i> 网站地图</a></li>
</ul></div>
</div>`,
        },
    },
    th: {
        privacy: {
            metaDescription:
                'นโยบายความเป็นส่วนตัว Totilove — วิธีที่เรารวบรวม ใช้ และปกป้องข้อมูลของคุณ',
            documentTitle: 'นโยบายความเป็นส่วนตัว — Totilove',
            heroTitleHtml: 'นโยบายความเป็นส่วนตัว',
            heroSubtitle: '',
            cardInnerHtml: readPrivacyHtml('th'),
        },
        terms: {
            metaDescription:
                'ข้อกำหนดในการให้บริการ Totilove — กฎและเงื่อนไขการใช้งานแพลตฟอร์ม',
            documentTitle: 'ข้อกำหนดในการให้บริการ — Totilove',
            heroTitleHtml: 'ข้อกำหนดในการให้บริการ',
            heroSubtitle: '',
            cardInnerHtml: readTermsHtml('th'),
        },
        cookies: {
            metaDescription:
                'นโยบายคุกกี้ Totilove — ประเภท ความยินยอม และการจัดการบนหน้านี้',
            documentTitle: 'คุกกี้ — Totilove',
            heroTitleHtml: 'คุกกี้',
            heroSubtitle: 'เมษายน 2569',
            cardTopHtml: readCookieTopHtml('th'),
            cardPrefsHtml: readCookiePrefsHtml('th'),
        },
        refund: {
            metaDescription:
                'นโยบายการคืนเงิน Totilove — การสมัครสมาชิก สิทธิ์ในการคืนเงิน และวิธีขอคืนเงิน',
            documentTitle: 'นโยบายการคืนเงิน — Totilove',
            heroTitleHtml: 'นโยบายการคืนเงิน',
            heroSubtitle: '',
            cardInnerHtml: readRefundHtml('th'),
        },
        safety: {
            metaDescription:
                'เคล็ดลับความปลอดภัย Totilove — ปลอดภัยเมื่อเดทออนไลน์และพบปะตัวจริง',
            documentTitle: 'เคล็ดลับความปลอดภัย — Totilove',
            heroTitleHtml: 'เคล็ดลับความปลอดภัย',
            heroSubtitle:
                'ความปลอดภัยของคุณคือสิ่งสำคัญอันดับแรก โปรดปฏิบัติตามแนวทางเหล่านี้เมื่อพูดคุยออนไลน์และเมื่อนัดพบ',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> กลับหน้าแรก</a>
<h2><i class="fas fa-lock"></i> ปกป้องข้อมูลส่วนตัวของคุณ</h2>
<p>อย่าแชร์ข้อมูลส่วนตัวที่ละเอียดอ่อนกับผู้ใช้อื่น โดยเฉพาะอย่างยิ่งในการสนทนาในช่วงแรก</p>
<p>ซึ่งรวมถึง:</p>
<ul>
<li>ชื่อ-นามสกุล</li>
<li>ที่อยู่บ้าน</li>
<li>รายละเอียดสถานที่ทำงาน</li>
<li>ข้อมูลทางการเงิน</li>
<li>เอกสารประจำตัว</li>
</ul>
<p>ใช้ระบบส่งข้อความในแอปจนกว่าคุณจะรู้สึกสบายใจและไว้วางใจอีกฝ่าย</p>
<p><strong>ข้อควรจำ:</strong> ไม่มีที่อยู่บ้าน &bull; ไม่มีรายละเอียดธนาคาร &bull; ไม่มีเอกสารประจำตัว</p>
<hr class="fp-divider">
<h2><i class="fas fa-video"></i> วิดีโอคอลก่อนนัดพบ</h2>
<p>ก่อนที่จะพบกันตัวต่อตัว เราแนะนำอย่างยิ่งให้วิดีโอคอลก่อน</p>
<p>สิ่งนี้ช่วย:</p>
<ul>
<li>ยืนยันตัวตน</li>
<li>สร้างความไว้วางใจ</li>
<li>ลดความเสี่ยงจากการปลอมแปลงตัวตนหรือกลโกง</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-map-marker-alt"></i> การนัดพบครั้งแรกอย่างปลอดภัย</h2>
<p>เมื่อเจอใครสักคนเป็นครั้งแรก:</p>
<ul>
<li>นัดกันในที่สาธารณะที่มีคนพลุกพล่าน (เช่น คาเฟ่ ร้านอาหาร สวนสาธารณะ)</li>
<li>บอกเพื่อนหรือสมาชิกในครอบครัวเกี่ยวกับแผนของคุณ (พบใคร ที่ไหน และเมื่อไหร่)</li>
<li>จัดการเดินทางด้วยตนเองและหลีกเลี่ยงการโดยสารรถกับคนแปลกหน้า</li>
<li>ชาร์จโทรศัพท์ให้พร้อมและสามารถเข้าถึงได้ตลอดเวลา</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-flag"></i> สังเกตสัญญาณอันตราย</h2>
<p>ระวังไว้หากคุณสังเกตเห็น:</p>
<ul>
<li>การขอเงิน ของขวัญ หรือความช่วยเหลือทางการเงิน (มิจฉาชีพหลอกลวงทางความรัก)</li>
<li>การปฏิเสธที่จะวิดีโอคอลหลังจากคุยกันมานาน</li>
<li>เรื่องราวส่วนตัวที่ไม่สอดคล้องกันหรือไม่สมจริง</li>
<li>แรงกดดันให้ย้ายการสนทนาไปนอกแพลตฟอร์ม (เช่น WhatsApp, Telegram)</li>
<li>การยกยอมากเกินไปหรือการผูกพันทางอารมณ์ที่รวดเร็ว</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-exclamation-triangle"></i> รายงานและบล็อก</h2>
<p>หากมีสิ่งที่น่าสงสัยหรือไม่ปลอดภัย ให้เชื่อสัญชาตญาณของคุณ</p>
<p>คุณสามารถ:</p>
<ul>
<li>ใช้ปุ่มรายงานบนโปรไฟล์หรือข้อความ</li>
<li>บล็อกผู้ใช้ได้ทันทีจากหน้าโปรไฟล์ของพวกเขา</li>
</ul>
<p>รายงานทั้งหมดจะถูกตรวจสอบโดยทีมงานผู้ดูแลของเราโดยเร็วที่สุดเท่าที่จะทำได้</p>
<hr class="fp-divider">
<h2><i class="fas fa-phone-alt"></i> แหล่งข้อมูลฉุกเฉิน</h2>
<p>หากคุณตกอยู่ในอันตรายทันที ให้ติดต่อบริการฉุกเฉินในพื้นที่ของคุณ</p>
<p>สำหรับการสนับสนุนที่เกี่ยวข้องกับการละเมิดออนไลน์หรือการใช้รูปภาพในทางที่ผิด คุณสามารถดูได้ที่:</p>
<ul>
<li><a href="https://www.stopncii.org" target="_blank" rel="noopener noreferrer">StopNCII.org</a></li>
<li><a href="https://www.cybersmile.org" target="_blank" rel="noopener noreferrer">Cybersmile Foundation</a></li>
</ul>`,
        },
        contact: {
            metaDescription: 'ติดต่อฝ่ายสนับสนุน Totilove',
            documentTitle: 'ติดต่อ — Totilove',
            heroTitleHtml: 'ติดต่อเรา',
            heroSubtitle: 'เราพร้อมช่วยเหลือ ส่งข้อความถึงเรา โดยปกติจะตอบกลับภายใน 24 ชั่วโมง',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> กลับสู่หน้าหลัก</a>
<h2><i class="fas fa-life-ring"></i> ดำเนินการต่อเพื่อขอรับการสนับสนุน</h2>
<p>คำขอรับการสนับสนุนจะถูกจัดการภายในพื้นที่สมาชิก</p>
<p>โปรดเข้าสู่ระบบก่อน แล้วคุณจะถูกเปลี่ยนเส้นทางไปยังศูนย์สนับสนุน</p>
<p>
<a href="/login?return=%2Fhelp&source=contact&message=Please%20log%20in%20to%20continue%20to%20Support%20Center." class="fp-btn" style="text-decoration:none;">
<i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบเพื่อดำเนินการต่อ
</a>
</p>
<hr class="fp-divider">
<h2><i class="fas fa-clock"></i> เวลาตอบสนอง</h2>
<p><strong>คำถามทั่วไป:</strong> ภายใน 24 ชั่วโมง</p>
<p><strong>การรายงานความปลอดภัยและการละเมิด:</strong> ภายใน 4 ชั่วโมง</p>
<p><strong>ปัญหาการเรียกเก็บเงิน:</strong> ภายใน 12 ชั่วโมง</p>
<p>สำหรับข้อกังวลด้านความปลอดภัยเร่งด่วน โปรดใช้ปุ่ม<strong>รายงาน</strong>โดยตรงบนโปรไฟล์ที่เกี่ยวข้อง</p>`,
        },
        accessibility: {
            metaDescription:
                'คำชี้แจงการช่วยการเข้าถึง Totilove — WCAG 2.1 AA ฟีเจอร์ที่รองรับและช่องทางติดต่อ',
            documentTitle: 'การช่วยการเข้าถึง — Totilove',
            heroTitleHtml: 'การช่วยการเข้าถึง',
            heroSubtitle:
                'Totilove มุ่งมั่นที่จะทำให้ความรักเข้าถึงได้สำหรับทุกคน โดยไม่คำนึงถึงความสามารถ',
            cardInnerHtml: readAccessibilityHtml('th'),
        },
        help: {
            metaDescription:
                'ศูนย์ช่วยเหลือ Totilove — คำตอบสำหรับคำถามที่พบบ่อยและการใช้งานให้เกิดประโยชน์สูงสุด',
            documentTitle: 'ศูนย์ช่วยเหลือ — Totilove',
            heroTitleHtml: 'ศูนย์ช่วยเหลือ',
            heroSubtitle:
                'ค้นหาคำตอบสำหรับคำถามที่พบบ่อยและใช้ Totilove ให้เกิดประโยชน์สูงสุด',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> กลับสู่หน้าหลัก</a>
<h2><i class="fas fa-user-plus"></i> เริ่มต้นใช้งาน</h2>
<p>การสร้างบัญชีบน Totilove นั้นฟรี ไปที่<a href="/pages/register.html">หน้าลงทะเบียน</a>และกรอกข้อมูลของคุณ เมื่อลงทะเบียนแล้ว กรอกโปรไฟล์ของคุณให้สมบูรณ์เพื่อเพิ่มโอกาสในการถูกแมตช์</p>
<hr class="fp-divider">
<h2><i class="fas fa-search-heart"></i> การค้นหาแมตช์</h2>
<p>ใช้ฟีเจอร์<strong>ค้นหา</strong>เพื่อกรองตามอายุ สถานที่ ภาษา และความสนใจ ระบบจับคู่อัจฉริยะของเราจะแนะนำโปรไฟล์ที่เหมาะกับคุณโดยอัตโนมัติตามความต้องการของคุณ</p>
<hr class="fp-divider">
<h2><i class="fas fa-comments"></i> การส่งข้อความ</h2>
<p>คุณสามารถส่งข้อความถึงโปรไฟล์ที่คุณแมตช์ได้ ไปที่<strong>ข้อความ</strong>ในแถบนำทางเพื่อดูการสนทนาทั้งหมด ข้อความทั้งหมดถูกเข้ารหัสและเป็นส่วนตัว</p>
<hr class="fp-divider">
<h2><i class="fas fa-cog"></i> การตั้งค่าบัญชี</h2>
<p>จัดการการแจ้งเตือน การตั้งค่าความเป็นส่วนตัว และภาษาได้ใน<strong>การตั้งค่า</strong> คุณสามารถปิดใช้งานหรือลบบัญชีของคุณได้ตลอดเวลาในส่วนบัญชี</p>
<hr class="fp-divider">
<h2><i class="fas fa-credit-card"></i> การเรียกเก็บเงินและแพ็กเกจ</h2>
<p>Totilove มีทั้งแบบฟรีและแบบพรีเมียม ดูและจัดการการสมัครสมาชิกของคุณในส่วน<strong>การเรียกเก็บเงิน</strong>จากเมนูบัญชี ยกเลิกได้ตลอดเวลา — ไม่มีค่าใช้จ่ายแอบแฝง</p>
<hr class="fp-divider">
<h2><i class="fas fa-envelope"></i> ยังต้องการความช่วยเหลืออยู่ใช่ไหม?</h2>
<p>ไม่พบคำตอบที่นี่ใช่ไหม? <a href="/pages/footer/contact.html">ติดต่อทีมสนับสนุนของเรา</a> แล้วเราจะตอบคุณภายใน 24 ชั่วโมง</p>`,
        },
        sitemap: {
            metaDescription: 'แผนผังเว็บไซต์ Totilove',
            documentTitle: 'แผนผัง — Totilove',
            heroTitleHtml: 'แผนผังเว็บไซต์',
            heroSubtitle: 'ภาพรวมหน้า',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> กลับหน้าแรก</a>
<h2><i class="fas fa-globe"></i> หน้า</h2>
<div class="fp-sitemap-grid">
<div class="fp-sitemap-section"><h3>หลัก</h3><ul>
<li><a href="/"><i class="fas fa-angle-right"></i> หน้าแรก</a></li>
<li><a href="/pages/register.html"><i class="fas fa-angle-right"></i> ลงทะเบียน</a></li>
<li><a href="/login"><i class="fas fa-angle-right"></i> เข้าสู่ระบบ</a></li>
<li><a href="/search"><i class="fas fa-angle-right"></i> ค้นหา</a></li>
<li><a href="/matches"><i class="fas fa-angle-right"></i> แมตช์</a></li>
<li><a href="/messages"><i class="fas fa-angle-right"></i> ข้อความ</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>โปรไฟล์</h3><ul>
<li><a href="/profile-full"><i class="fas fa-angle-right"></i> โปรไฟล์</a></li>
<li><a href="/profile-edit"><i class="fas fa-angle-right"></i> แก้ไข</a></li>
<li><a href="/profile-photos"><i class="fas fa-angle-right"></i> รูป</a></li>
<li><a href="/profile-stats"><i class="fas fa-angle-right"></i> สถิติ</a></li>
<li><a href="/activity"><i class="fas fa-angle-right"></i> กิจกรรม</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>บัญชี</h3><ul>
<li><a href="/settings"><i class="fas fa-angle-right"></i> ตั้งค่า</a></li>
<li><a href="/billing"><i class="fas fa-angle-right"></i> การเรียกเก็บเงิน</a></li>
<li><a href="/online"><i class="fas fa-angle-right"></i> ออนไลน์</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>ช่วยเหลือ</h3><ul>
<li><a href="/pages/footer/help.html"><i class="fas fa-angle-right"></i> ช่วยเหลือ</a></li>
<li><a href="/pages/footer/safety.html"><i class="fas fa-angle-right"></i> ความปลอดภัย</a></li>
<li><a href="/pages/footer/contact.html"><i class="fas fa-angle-right"></i> ติดต่อ</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>กฎหมาย</h3><ul>
<li><a href="/pages/footer/privacy.html"><i class="fas fa-angle-right"></i> ความเป็นส่วนตัว</a></li>
<li><a href="/pages/footer/terms.html"><i class="fas fa-angle-right"></i> ข้อกำหนด</a></li>
<li><a href="/pages/footer/refund.html"><i class="fas fa-angle-right"></i> คืนเงิน</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>อื่นๆ</h3><ul>
<li><a href="/pages/footer/accessibility.html"><i class="fas fa-angle-right"></i> การเข้าถึง</a></li>
<li><a href="/pages/footer/cookies.html"><i class="fas fa-angle-right"></i> คุกกี้</a></li>
<li><a href="/pages/footer/sitemap.html"><i class="fas fa-angle-right"></i> แผนผัง</a></li>
</ul></div>
</div>`,
        },
    },
    ph: {
        privacy: {
            metaDescription:
                'Patakaran sa Privacy ng Totilove — kung paano namin kinokolekta, ginagamit, at pinoprotektahan ang iyong data.',
            documentTitle: 'Patakaran sa Privacy — Totilove',
            heroTitleHtml: 'Patakaran sa Privacy',
            heroSubtitle: '',
            cardInnerHtml: readPrivacyHtml('ph'),
        },
        terms: {
            metaDescription:
                'Mga Tuntunin ng Serbisyo ng Totilove — mga patakaran at kundisyon sa paggamit ng platform.',
            documentTitle: 'Mga Tuntunin ng Serbisyo — Totilove',
            heroTitleHtml: 'Mga Tuntunin ng Serbisyo',
            heroSubtitle: '',
            cardInnerHtml: readTermsHtml('ph'),
        },
        cookies: {
            metaDescription:
                'Patakaran sa cookie ng Totilove — mga kategorya, pahintulot, at pamamahala sa pahinang ito.',
            documentTitle: 'Cookie — Totilove',
            heroTitleHtml: 'Cookie',
            heroSubtitle: 'Abril 2026.',
            cardTopHtml: readCookieTopHtml('ph'),
            cardPrefsHtml: readCookiePrefsHtml('ph'),
        },
        refund: {
            metaDescription:
                'Patakaran sa Refund ng Totilove — subscription, eligibility, at paano humiling ng refund.',
            documentTitle: 'Patakaran sa Refund — Totilove',
            heroTitleHtml: 'Patakaran sa Refund',
            heroSubtitle: '',
            cardInnerHtml: readRefundHtml('ph'),
        },
        safety: {
            metaDescription:
                'Mga tip sa kaligtasan ng Totilove — manatiling ligtas online at sa personal na pagkikita.',
            documentTitle: 'Mga tip sa kaligtasan — Totilove',
            heroTitleHtml: 'Mga tip sa kaligtasan',
            heroSubtitle:
                'Ang iyong kaligtasan ang aming pangunahing priyoridad. Sundin ang mga alituntuning ito para manatiling ligtas online at kapag nagkikita nang personal.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Bumalik sa home</a>
<h2><i class="fas fa-lock"></i> Protektahan ang Iyong Personal na Impormasyon</h2>
<p>Huwag kailanman magbahagi ng sensitibong personal na impormasyon sa ibang mga user, lalo na sa mga unang pag-uusap.</p>
<p>Kabilang dito ang:</p>
<ul>
<li>Buong pangalan</li>
<li>Address ng bahay</li>
<li>Mga detalye ng lugar ng trabaho</li>
<li>Impormasyong pinansyal</li>
<li>Mga dokumento ng pagkakakilanlan</li>
</ul>
<p>Gamitin ang in-app messaging system hanggang sa maging komportable ka at magtiwala sa kabilang tao.</p>
<p><strong>Paalala:</strong> Walang address ng bahay &bull; Walang detalye ng bangko &bull; Walang dokumento ng pagkakakilanlan</p>
<hr class="fp-divider">
<h2><i class="fas fa-video"></i> Mag-Video Call Bago Magkita</h2>
<p>Bago personal na magkita, mariing naming inirerekomenda na mag-video call muna.</p>
<p>Nakakatulong ito upang:</p>
<ul>
<li>kumpirmahin ang pagkakakilanlan</li>
<li>bumuo ng tiwala</li>
<li>bawasan ang panganib ng panloloko o pangunguwalta</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-map-marker-alt"></i> Ligtas na Unang Pagkikita</h2>
<p>Kapag may nakilala sa unang pagkakataon:</p>
<ul>
<li>Magkita sa isang pampublikong lugar na maraming tao (hal. café, restaurant, parke)</li>
<li>Sabihin sa isang kaibigan o kapamilya ang iyong mga plano (sino, saan, at kailan)</li>
<li>Mag-ayos ng sarili mong transportasyon at iwasang sumakay sa mga estranghero</li>
<li>Panatilihing naka-charge at laging accessible ang iyong telepono</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-flag"></i> Kilalanin ang Mga Pulang Bandila</h2>
<p>Mag-ingat kung mapansin mo ang:</p>
<ul>
<li>Mga kahilingan para sa pera, regalo, o pinansyal na tulong (romance scams)</li>
<li>Pagtanggi na mag-video call kahit matagal na kayong nagcha-chat</li>
<li>Hindi tugma o hindi makatotohanang personal na mga kuwento</li>
<li>Pressure na ilipat ang usapan sa labas ng platform (hal. WhatsApp, Telegram)</li>
<li>Labis na pambobola o mabilis na emosyonal na pag-attach</li>
</ul>
<hr class="fp-divider">
<h2><i class="fas fa-exclamation-triangle"></i> Mag-ulat at I-block</h2>
<p>Kung may kahina-hinala o hindi ligtas, magtiwala sa iyong kutob.</p>
<p>Maaari mong:</p>
<ul>
<li>Gamitin ang button na I-ulat sa mga profile o mensahe</li>
<li>I-block agad ang mga user mula sa kanilang profile page</li>
</ul>
<p>Lahat ng ulat ay sinusuri ng aming moderation team sa lalong madaling panahon.</p>
<hr class="fp-divider">
<h2><i class="fas fa-phone-alt"></i> Mga Mapagkukunan sa Emergency</h2>
<p>Kung ikaw ay nasa agarang panganib, makipag-ugnayan sa iyong lokal na serbisyong pang-emergency.</p>
<p>Para sa suporta na may kaugnayan sa online na pang-aabuso o maling paggamit ng imahe, maaari ka ring sumangguni sa:</p>
<ul>
<li><a href="https://www.stopncii.org" target="_blank" rel="noopener noreferrer">StopNCII.org</a></li>
<li><a href="https://www.cybersmile.org" target="_blank" rel="noopener noreferrer">Cybersmile Foundation</a></li>
</ul>`,
        },
        contact: {
            metaDescription: 'Makipag-ugnayan sa support team ng Totilove.',
            documentTitle: 'Makipag-ugnayan — Totilove',
            heroTitleHtml: 'Makipag-ugnayan',
            heroSubtitle:
                'Nandito kami para tumulong. Magpadala ng mensahe at karaniwang tumutugon kami sa loob ng 24 na oras.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Bumalik sa Home</a>
<h2><i class="fas fa-life-ring"></i> Magpatuloy sa Suporta</h2>
<p>Ang mga kahilingan para sa suporta ay hinahandle sa loob ng member area.</p>
<p>Mangyaring mag-log in muna at ikaw ay ididirekta sa Support Center.</p>
<p>
<a href="/login?return=%2Fhelp&source=contact&message=Please%20log%20in%20to%20continue%20to%20Support%20Center." class="fp-btn" style="text-decoration:none;">
<i class="fas fa-sign-in-alt"></i> Mag-log in para magpatuloy
</a>
</p>
<hr class="fp-divider">
<h2><i class="fas fa-clock"></i> Mga Oras ng Pagtugon</h2>
<p><strong>Pangkalahatang tanong:</strong> sa loob ng 24 na oras</p>
<p><strong>Mga ulat sa kaligtasan at pang-aabuso:</strong> sa loob ng 4 na oras</p>
<p><strong>Mga isyu sa pagsingil:</strong> sa loob ng 12 oras</p>
<p>Para sa mga agarang alalahanin sa kaligtasan, mangyaring gamitin ang button na <strong>I-ulat</strong> nang direkta sa nauugnay na profile.</p>`,
        },
        accessibility: {
            metaDescription:
                'Pahayag ng accessibility ng Totilove — WCAG 2.1 AA, suportadong feature, at contact.',
            documentTitle: 'Accessibility — Totilove',
            heroTitleHtml: 'Accessibility',
            heroSubtitle:
                'Ang Totilove ay nakatuon na gawing accessible ang pag-ibig sa lahat, anuman ang kanilang kakayahan.',
            cardInnerHtml: readAccessibilityHtml('ph'),
        },
        help: {
            metaDescription:
                'Sentro ng Tulong ng Totilove — mga sagot sa madalas na tanong at kung paano sulitin ang Totilove.',
            documentTitle: 'Sentro ng Tulong — Totilove',
            heroTitleHtml: 'Sentro ng Tulong',
            heroSubtitle:
                'Maghanap ng mga sagot sa madalas na tanong at sulitin ang Totilove.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Bumalik sa home</a>
<h2><i class="fas fa-user-plus"></i> Pagsisimula</h2>
<p>Libre ang gumawa ng account sa Totilove. Bisitahin ang <a href="/pages/register.html">pahina ng Magrehistro</a> at punan ang iyong mga detalye. Kapag nakapagrehistro na, kumpletuhin ang iyong profile para mas makita ka sa mga match.</p>
<hr class="fp-divider">
<h2><i class="fas fa-search-heart"></i> Paghahanap ng Matches</h2>
<p>Gamitin ang <strong>Search</strong> para mag-filter ayon sa edad, lokasyon, wika, at interes. Ang aming smart matching engine ay awtomatikong nagmumungkahi ng mga compatible na profile batay sa iyong mga kagustuhan.</p>
<hr class="fp-divider">
<h2><i class="fas fa-comments"></i> Pagmemensahe</h2>
<p>Maaari kang magpadala ng mensahe sa anumang profile na na-match mo. Pumunta sa <strong>Messages</strong> sa navigation bar para makita ang lahat ng usapan. Lahat ng mensahe ay naka-encrypt at pribado.</p>
<hr class="fp-divider">
<h2><i class="fas fa-cog"></i> Mga Setting ng Account</h2>
<p>Pamahalaan ang iyong mga notification preference, privacy setting, at wika sa <strong>Settings</strong>. Maaari mong i-deactivate o tanggalin ang iyong account anumang oras mula sa Account section.</p>
<hr class="fp-divider">
<h2><i class="fas fa-credit-card"></i> Pagsingil at Mga Subscription</h2>
<p>Nag-aalok ang Totilove ng libreng tier pati na rin mga premium na plano. Tingnan at pamahalaan ang iyong subscription sa ilalim ng <strong>Billing</strong> sa menu ng iyong account. Mag-cancel anumang oras — walang hidden fees.</p>
<hr class="fp-divider">
<h2><i class="fas fa-envelope"></i> Kailangan Pa ng Tulong?</h2>
<p>Hindi mo mahanap ang sagot dito? <a href="/pages/footer/contact.html">Makipag-ugnayan sa aming support team</a> at magre-response kami sa iyo sa loob ng 24 na oras.</p>`,
        },
        sitemap: {
            metaDescription: 'Sitemap ng Totilove.',
            documentTitle: 'Sitemap — Totilove',
            heroTitleHtml: 'Sitemap',
            heroSubtitle: 'Buod ng mga pahina.',
            cardInnerHtml: `<a href="/" class="fp-back"><i class="fas fa-arrow-left"></i> Bumalik sa home</a>
<h2><i class="fas fa-globe"></i> Mga pahina</h2>
<div class="fp-sitemap-grid">
<div class="fp-sitemap-section"><h3>Pangunahin</h3><ul>
<li><a href="/"><i class="fas fa-angle-right"></i> Home</a></li>
<li><a href="/pages/register.html"><i class="fas fa-angle-right"></i> Magrehistro</a></li>
<li><a href="/login"><i class="fas fa-angle-right"></i> Login</a></li>
<li><a href="/search"><i class="fas fa-angle-right"></i> Hanapin</a></li>
<li><a href="/matches"><i class="fas fa-angle-right"></i> Matches</a></li>
<li><a href="/messages"><i class="fas fa-angle-right"></i> Mensahe</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Profile</h3><ul>
<li><a href="/profile-full"><i class="fas fa-angle-right"></i> Profile ko</a></li>
<li><a href="/profile-edit"><i class="fas fa-angle-right"></i> I-edit</a></li>
<li><a href="/profile-photos"><i class="fas fa-angle-right"></i> Larawan</a></li>
<li><a href="/profile-stats"><i class="fas fa-angle-right"></i> Stats</a></li>
<li><a href="/activity"><i class="fas fa-angle-right"></i> Aktibidad</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Account</h3><ul>
<li><a href="/settings"><i class="fas fa-angle-right"></i> Settings</a></li>
<li><a href="/billing"><i class="fas fa-angle-right"></i> Billing</a></li>
<li><a href="/online"><i class="fas fa-angle-right"></i> Online</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Suporta</h3><ul>
<li><a href="/pages/footer/help.html"><i class="fas fa-angle-right"></i> Help</a></li>
<li><a href="/pages/footer/safety.html"><i class="fas fa-angle-right"></i> Safety</a></li>
<li><a href="/pages/footer/contact.html"><i class="fas fa-angle-right"></i> Contact</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Legal</h3><ul>
<li><a href="/pages/footer/privacy.html"><i class="fas fa-angle-right"></i> Privacy</a></li>
<li><a href="/pages/footer/terms.html"><i class="fas fa-angle-right"></i> Terms</a></li>
<li><a href="/pages/footer/refund.html"><i class="fas fa-angle-right"></i> Refund</a></li>
</ul></div>
<div class="fp-sitemap-section"><h3>Iba pa</h3><ul>
<li><a href="/pages/footer/accessibility.html"><i class="fas fa-angle-right"></i> Accessibility</a></li>
<li><a href="/pages/footer/cookies.html"><i class="fas fa-angle-right"></i> Cookies</a></li>
<li><a href="/pages/footer/sitemap.html"><i class="fas fa-angle-right"></i> Sitemap</a></li>
</ul></div>
</div>`,
        },
    },
};
