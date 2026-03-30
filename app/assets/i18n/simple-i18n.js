/**
 * Simple I18n Implementation for Totilove
 * Works with file:// URLs and basic HTTP serving
 */

class SimpleI18n {
    constructor() {
        this.currentLanguage = 'en';
        this.translations = {};
        this.supportedLanguages = ['en', 'vi', 'th', 'zh', 'fr', 'de', 'it', 'es', 'ru', 'ph'];
    }

    async init() {
        // Detect user's preferred language
        this.currentLanguage = this.detectLanguage();
        
        // Load all translations
        await this.loadAllTranslations();
        
        // Apply initial translations
        this.translatePage();
        
        // I18n initialized with language
    }

    detectLanguage() {
        // Check if language is stored in preferences (session manager or localStorage)
        const stored = this.getLanguagePreference();
        if (stored && this.supportedLanguages.includes(stored)) {
            return stored;
        }

        // Check browser language
        const browserLang = navigator.language.split('-')[0];
        if (this.supportedLanguages.includes(browserLang)) {
            return browserLang;
        }

        return 'en'; // Default
    }

    getLanguagePreference() {
        try {
            // Try session manager first (preferred method)
            if (window.sessionManager && window.sessionManager.getCurrentUser) {
                const user = window.sessionManager.getCurrentUser();
                if (user && user.id) {
                    // No localStorage fallback
                    return null;
                }
            }
            
            // No localStorage fallback
            return null;
        } catch (error) {
            // Error getting language preference
            return null;
        }
    }

    setLanguagePreference(languageCode) {
        try {
            // Store in session manager if available
            if (window.sessionManager && window.sessionManager.getCurrentUser) {
                const user = window.sessionManager.getCurrentUser();
                if (user && user.id) {
                    // No localStorage storage
                }
            }
        } catch (error) {
            // Error setting language preference
        }
    }

    async loadAllTranslations() {
        const translations = {
            en: {
                "app": { "name": "Totilove" },
                "hero": {
                    "title": "Find Love Across Borders",
                    "subtitle": "Connect with people worldwide through our intelligent matching system. Support for 25+ languages, cultural preferences, and your preferred measurement system.",
                    "features": {
                        "languages": "25+ Languages",
                        "matching": "Smart Matching",
                        "security": "Safe & Secure",
                        "mobile": "Mobile Ready"
                    },
                    "cta": {
                        "primary": "Join Free Today",
                        "secondary": "Learn More"
                    }
                },
                "features": {
                    "title": "Why Choose Totilove?",
                    "subtitle": "Our platform combines cutting-edge technology with cultural sensitivity to help you find meaningful connections worldwide.",
                    "items": {
                        "languages": {
                            "title": "Multi-Language Support",
                            "description": "Connect in your native language. We support 25+ world languages with fluency tracking and cultural matching preferences."
                        },
                        "matching": {
                            "title": "Smart Matching Algorithm",
                            "description": "Our AI-powered system considers shared languages, interests, cultural background, and personal preferences for optimal compatibility."
                        },
                        "interests": {
                            "title": "Interest-Based Connections",
                            "description": "Find people who share your passions. From sports to arts, technology to travel - connect over what you love most."
                        },
                        "culture": {
                            "title": "Cultural Intelligence",
                            "description": "Respect cultural differences with automatic regional preferences, measurement systems, and culturally-aware matching."
                        },
                        "privacy": {
                            "title": "Privacy & Security",
                            "description": "Your safety is our priority. Advanced verification, privacy controls, and secure messaging keep your personal information protected."
                        },
                        "mobile": {
                            "title": "Mobile Optimized",
                            "description": "Stay connected anywhere. Our responsive design works perfectly on desktop, tablet, and mobile devices."
                        }
                    }
                },
                "showcase": {
                    "title": "Express Yourself Completely",
                    "subtitle": "Share your languages, interests, and preferences in the way that feels most natural to you.",
                    "tabs": {
                        "languages": "Languages",
                        "interests": "Interests",
                        "measurements": "Measurements"
                    },
                    "languages": {
                        "english": "Native, Fluent, Advanced",
                        "vietnamese": "Southeast Asian Language",
                        "thai": "Tonal Language Family",
                        "chinese": "Mandarin Chinese",
                        "more": "Worldwide Coverage"
                    }
                },
                "demo": {
                    "title": "Experience Global Love",
                    "subtitle": "See how our platform connects hearts across cultures and continents",
                    "coverage": "Global Coverage",
                    "users": "Active Users",
                    "regions": "Regions Served",
                    "continents": "Continents",
                    "quality": "Quality Matches",
                    "professional": "Professional Support"
                },
                "cta": {
                    "title": "Ready to Find Your Perfect Match?",
                    "description": "Join thousands of people worldwide who have found love through our intelligent, culturally-aware matching system.",
                    "primary": "Start Your Journey",
                    "secondary": "Sign In"
                },
                "footer": {
                    "description": "Connecting hearts across cultures and continents. Find love that transcends borders.",
                    "features": "Features",
                    "support": "Support",
                    "legal": "Legal",
                    "copyright": "All rights reserved. Made with ❤️ for love without borders."
                }
            },
            vi: {
                "app": { "name": "Totilove" },
                "hero": {
                    "title": "Tìm Tình Yêu Vượt Biên Giới",
                    "subtitle": "Kết nối với mọi người trên thế giới thông qua hệ thống ghép đôi thông minh. Hỗ trợ 25+ ngôn ngữ, sở thích văn hóa và hệ thống đo lường ưa thích của bạn.",
                    "features": {
                        "languages": "25+ Ngôn Ngữ",
                        "matching": "Ghép Đôi Thông Minh",
                        "security": "An Toàn & Bảo Mật",
                        "mobile": "Tối Ưu Di Động"
                    },
                    "cta": {
                        "primary": "Tham Gia Miễn Phí",
                        "secondary": "Tìm Hiểu Thêm"
                    }
                },
                "features": {
                    "title": "Tại Sao Chọn Totilove?",
                    "subtitle": "Nền tảng của chúng tôi kết hợp công nghệ tiên tiến với sự nhạy cảm văn hóa để giúp bạn tìm thấy những kết nối ý nghĩa trên toàn thế giới.",
                    "items": {
                        "languages": {
                            "title": "Hỗ Trợ Đa Ngôn Ngữ",
                            "description": "Kết nối bằng ngôn ngữ mẹ đẻ của bạn. Chúng tôi hỗ trợ 25+ ngôn ngữ thế giới với theo dõi trình độ và sở thích ghép đôi văn hóa."
                        },
                        "matching": {
                            "title": "Thuật Toán Ghép Đôi Thông Minh",
                            "description": "Hệ thống AI của chúng tôi xem xét ngôn ngữ chung, sở thích, bối cảnh văn hóa và sở thích cá nhân để có sự tương thích tối ưu."
                        },
                        "interests": {
                            "title": "Kết Nối Dựa Trên Sở Thích",
                            "description": "Tìm những người chia sẻ đam mê của bạn. Từ thể thao đến nghệ thuật, công nghệ đến du lịch - kết nối qua những gì bạn yêu thích nhất."
                        },
                        "culture": {
                            "title": "Trí Tuệ Văn Hóa",
                            "description": "Tôn trọng sự khác biệt văn hóa với sở thích khu vực tự động, hệ thống đo lường và ghép đôi có ý thức văn hóa."
                        },
                        "privacy": {
                            "title": "Riêng Tư & Bảo Mật",
                            "description": "Sự an toàn của bạn là ưu tiên của chúng tôi. Xác minh nâng cao, kiểm soát quyền riêng tư và nhắn tin an toàn bảo vệ thông tin cá nhân của bạn."
                        },
                        "mobile": {
                            "title": "Tối Ưu Di Động",
                            "description": "Luôn kết nối mọi lúc mọi nơi. Thiết kế responsive của chúng tôi hoạt động hoàn hảo trên máy tính để bàn, máy tính bảng và thiết bị di động."
                        }
                    }
                },
                "showcase": {
                    "title": "Thể Hiện Bản Thân Hoàn Toàn",
                    "subtitle": "Chia sẻ ngôn ngữ, sở thích và sở thích của bạn theo cách cảm thấy tự nhiên nhất.",
                    "tabs": {
                        "languages": "Ngôn Ngữ",
                        "interests": "Sở Thích",
                        "measurements": "Đo Lường"
                    },
                    "languages": {
                        "english": "Bản ngữ, Thành thạo, Nâng cao",
                        "vietnamese": "Ngôn Ngữ Đông Nam Á",
                        "thai": "Họ Ngôn Ngữ Thanh Điệu",
                        "chinese": "Tiếng Trung Quan Thoại",
                        "more": "Phủ Sóng Toàn Cầu"
                    }
                },
                "demo": {
                    "title": "Trải Nghiệm Tình Yêu Toàn Cầu",
                    "subtitle": "Xem cách nền tảng của chúng tôi kết nối trái tim qua các nền văn hóa và lục địa",
                    "coverage": "Phủ Sóng Toàn Cầu",
                    "users": "Người Dùng Hoạt Động",
                    "regions": "Khu Vực Phục Vụ",
                    "continents": "Lục Địa",
                    "quality": "Ghép Đôi Chất Lượng",
                    "professional": "Hỗ Trợ Chuyên Nghiệp"
                },
                "cta": {
                    "title": "Sẵn Sàng Tìm Người Phù Hợp Hoàn Hảo?",
                    "description": "Tham gia cùng hàng nghìn người trên thế giới đã tìm thấy tình yêu thông qua hệ thống ghép đôi thông minh, có ý thức văn hóa của chúng tôi.",
                    "primary": "Bắt Đầu Hành Trình",
                    "secondary": "Đăng Nhập"
                },
                "footer": {
                    "description": "Kết nối trái tim qua các nền văn hóa và lục địa. Tìm tình yêu vượt qua biên giới.",
                    "features": "Tính Năng",
                    "support": "Hỗ Trợ",
                    "legal": "Pháp Lý",
                    "copyright": "Bản quyền được bảo vệ. Được tạo với ❤️ cho tình yêu không biên giới."
                }
            },
            th: {
                "app": { "name": "Totilove" },
                "hero": {
                    "title": "ค้นหาความรักข้ามพรมแดน",
                    "subtitle": "เชื่อมต่อกับผู้คนทั่วโลกผ่านระบบจับคู่อัจฉริยะของเรา รองรับ 25+ ภาษา ความชอบทางวัฒนธรรม และระบบการวัดที่คุณต้องการ",
                    "features": {
                        "languages": "25+ ภาษา",
                        "matching": "การจับคู่อัจฉริยะ",
                        "security": "ปลอดภัย & มั่นคง",
                        "mobile": "พร้อมใช้งานมือถือ"
                    },
                    "cta": {
                        "primary": "เข้าร่วมฟรีวันนี้",
                        "secondary": "เรียนรู้เพิ่มเติม"
                    }
                },
                "features": {
                    "title": "ทำไมต้องเลือก Totilove?",
                    "subtitle": "แพลตฟอร์มของเราผสมผสานเทคโนโลยีล้ำสมัยกับความไวทางวัฒนธรรม เพื่อช่วยให้คุณค้นหาการเชื่อมต่อที่มีความหมายทั่วโลก",
                    "items": {
                        "languages": {
                            "title": "รองรับหลายภาษา",
                            "description": "เชื่อมต่อด้วยภาษาแม่ของคุณ เรารองรับ 25+ ภาษาทั่วโลกพร้อมการติดตามความคล่องแคล่วและการจับคู่ตามความชอบทางวัฒนธรรม"
                        },
                        "matching": {
                            "title": "อัลกอริทึมการจับคู่อัจฉริยะ",
                            "description": "ระบบ AI ของเราพิจารณาภาษาที่ใช้ร่วมกัน ความสนใจ ภูมิหลังทางวัฒนธรรม และความชอบส่วนบุคคลเพื่อความเข้ากันได้ที่เหมาะสมที่สุด"
                        },
                        "interests": {
                            "title": "การเชื่อมต่อตามความสนใจ",
                            "description": "ค้นหาผู้คนที่มีความหลงใหลเหมือนกับคุณ ตั้งแต่กีฬาไปจนถึงศิลปะ เทคโนโลยีไปจนถึงการท่องเที่ยว - เชื่อมต่อผ่านสิ่งที่คุณรักมากที่สุด"
                        },
                        "culture": {
                            "title": "ปัญญาทางวัฒนธรรม",
                            "description": "เคารพความแตกต่างทางวัฒนธรรมด้วยความชอบระดับภูมิภาคอัตโนมัติ ระบบการวัด และการจับคู่ที่ตระหนักถึงวัฒนธรรม"
                        },
                        "privacy": {
                            "title": "ความเป็นส่วนตัวและความปลอดภัย",
                            "description": "ความปลอดภัยของคุณคือสิ่งสำคัญของเรา การยืนยันขั้นสูง การควบคุมความเป็นส่วนตัว และการส่งข้อความที่ปลอดภัยเพื่อปกป้องข้อมูลส่วนบุคคลของคุณ"
                        },
                        "mobile": {
                            "title": "เหมาะสำหรับมือถือ",
                            "description": "เชื่อมต่อได้ทุกที่ การออกแบบที่ตอบสนองของเราทำงานได้อย่างสมบูรณ์แบบบนเดสก์ท็อป แท็บเล็ต และอุปกรณ์มือถือ"
                        }
                    }
                },
                "showcase": {
                    "title": "แสดงออกอย่างสมบูรณ์",
                    "subtitle": "แบ่งปันภาษา ความสนใจ และความชอบของคุณในแบบที่รู้สึกเป็นธรรมชาติที่สุด",
                    "tabs": {
                        "languages": "ภาษา",
                        "interests": "ความสนใจ",
                        "measurements": "การวัด"
                    },
                    "languages": {
                        "english": "ภาษาแม่, คล่องแคล่ว, ขั้นสูง",
                        "vietnamese": "ภาษาเอเชียตะวันออกเฉียงใต้",
                        "thai": "ตระกูลภาษาเสียงวรรณยุกต์",
                        "chinese": "ภาษาจีนกลาง",
                        "more": "ครอบคลุมทั่วโลก"
                    }
                },
                "demo": {
                    "title": "สัมผัสประสบการณ์ความรักข้ามโลก",
                    "subtitle": "ดูว่าแพลตฟอร์มของเราเชื่อมต่อหัวใจข้ามวัฒนธรรมและทวีปอย่างไร",
                    "coverage": "ครอบคลุมทั่วโลก",
                    "users": "ผู้ใช้ที่ใช้งานอยู่",
                    "regions": "ภูมิภาคที่ให้บริการ",
                    "continents": "ทวีป",
                    "quality": "การจับคู่คุณภาพ",
                    "professional": "การสนับสนุนระดับมืออาชีพ"
                },
                "cta": {
                    "title": "พร้อมที่จะหาคู่ที่สมบูรณ์แบบของคุณหรือยัง?",
                    "description": "เข้าร่วมกับผู้คนหลายพันคนทั่วโลกที่ได้พบความรักผ่านระบบการจับคู่ที่ชาญฉลาดและตระหนักถึงวัฒนธรรมของเรา",
                    "primary": "เริ่มต้นการเดินทางของคุณ",
                    "secondary": "เข้าสู่ระบบ"
                },
                "footer": {
                    "description": "เชื่อมต่อหัวใจข้ามวัฒนธรรมและทวีป ค้นหาความรักที่ข้ามขอบเขต",
                    "features": "คุณสมบัติ",
                    "support": "การสนับสนุน",
                    "legal": "กฎหมาย",
                    "copyright": "สงวนลิขสิทธิ์ทั้งหมด สร้างด้วย ❤️ เพื่อความรักไร้พรมแดน"
                }
            },
            zh: {
                "app": { "name": "Totilove" },
                "hero": {
                    "title": "寻找跨越国界的爱情",
                    "subtitle": "通过我们的智能匹配系统与世界各地的人们建立联系。支持25+种语言、文化偏好和您偏爱的测量系统。",
                    "features": {
                        "languages": "25+种语言",
                        "matching": "智能匹配",
                        "security": "安全可靠",
                        "mobile": "移动就绪"
                    },
                    "cta": {
                        "primary": "今天免费加入",
                        "secondary": "了解更多"
                    }
                },
                "features": {
                    "title": "为什么选择Totilove？",
                    "subtitle": "我们的平台将尖端技术与文化敏感性相结合，帮助您在全球范围内找到有意义的联系。",
                    "items": {
                        "languages": {
                            "title": "多语言支持",
                            "description": "用您的母语进行连接。我们支持25+种世界语言，具有流利度跟踪和文化匹配偏好。"
                        },
                        "matching": {
                            "title": "智能匹配算法",
                            "description": "我们的AI驱动系统考虑共同语言、兴趣、文化背景和个人偏好，以实现最佳兼容性。"
                        },
                        "interests": {
                            "title": "基于兴趣的连接",
                            "description": "找到与您分享激情的人。从体育到艺术，从技术到旅行——通过您最爱的事物建立联系。"
                        },
                        "culture": {
                            "title": "文化智能",
                            "description": "通过自动区域偏好、测量系统和文化感知匹配来尊重文化差异。"
                        },
                        "privacy": {
                            "title": "隐私与安全",
                            "description": "您的安全是我们的首要任务。高级验证、隐私控制和安全消息传递保护您的个人信息。"
                        },
                        "mobile": {
                            "title": "移动优化",
                            "description": "随时随地保持连接。我们的响应式设计在桌面、平板电脑和移动设备上完美运行。"
                        }
                    }
                },
                "showcase": {
                    "title": "完全表达自己",
                    "subtitle": "以最自然的方式分享您的语言、兴趣和偏好。",
                    "tabs": {
                        "languages": "语言",
                        "interests": "兴趣",
                        "measurements": "测量"
                    },
                    "languages": {
                        "english": "母语、流利、高级",
                        "vietnamese": "东南亚语言",
                        "thai": "声调语言族",
                        "chinese": "普通话",
                        "more": "全球覆盖"
                    }
                },
                "demo": {
                    "title": "体验全球爱情",
                    "subtitle": "看看我们的平台如何连接跨越文化和大陆的心灵",
                    "coverage": "全球覆盖",
                    "users": "活跃用户",
                    "regions": "服务地区",
                    "continents": "大洲",
                    "quality": "优质匹配",
                    "professional": "专业支持"
                },
                "cta": {
                    "title": "准备找到您的完美伴侣了吗？",
                    "description": "加入全球数千人，他们通过我们智能的、具有文化意识的匹配系统找到了爱情。",
                    "primary": "开始您的旅程",
                    "secondary": "登录"
                },
                "footer": {
                    "description": "连接跨越文化和大陆的心灵。找到超越边界的爱情。",
                    "features": "功能",
                    "support": "支持",
                    "legal": "法律",
                    "copyright": "版权所有。用❤️为无边界的爱情而制作。"
                }
            },
            fr: {
                "app": { "name": "Totilove" },
                "hero": {
                    "title": "Trouvez l'Amour au-delà des Frontières",
                    "subtitle": "Connectez-vous avec des personnes du monde entier grâce à notre système de correspondance intelligent. Support pour 25+ langues, préférences culturelles et votre système de mesure préféré.",
                    "features": {
                        "languages": "25+ Langues",
                        "matching": "Correspondance Intelligente",
                        "security": "Sûr et Sécurisé",
                        "mobile": "Optimisé Mobile"
                    },
                    "cta": {
                        "primary": "Rejoignez Gratuitement",
                        "secondary": "En Savoir Plus"
                    }
                },
                "features": {
                    "title": "Pourquoi Choisir Totilove ?",
                    "subtitle": "Notre plateforme combine une technologie de pointe avec une sensibilité culturelle pour vous aider à trouver des connexions significatives dans le monde entier.",
                    "items": {
                        "languages": {
                            "title": "Support Multi-Langues",
                            "description": "Connectez-vous dans votre langue maternelle. Nous prenons en charge 25+ langues mondiales avec suivi de maîtrise et préférences de correspondance culturelle."
                        },
                        "matching": {
                            "title": "Algorithme de Correspondance Intelligent",
                            "description": "Notre système alimenté par IA considère les langues partagées, les intérêts, l'arrière-plan culturel et les préférences personnelles pour une compatibilité optimale."
                        },
                        "interests": {
                            "title": "Connexions Basées sur les Intérêts",
                            "description": "Trouvez des personnes qui partagent vos passions. Du sport aux arts, de la technologie aux voyages - connectez-vous sur ce que vous aimez le plus."
                        },
                        "culture": {
                            "title": "Intelligence Culturelle",
                            "description": "Respectez les différences culturelles avec des préférences régionales automatiques, des systèmes de mesure et une correspondance consciente de la culture."
                        },
                        "privacy": {
                            "title": "Confidentialité et Sécurité",
                            "description": "Votre sécurité est notre priorité. Vérification avancée, contrôles de confidentialité et messagerie sécurisée protègent vos informations personnelles."
                        },
                        "mobile": {
                            "title": "Optimisé Mobile",
                            "description": "Restez connecté partout. Notre design responsive fonctionne parfaitement sur ordinateur, tablette et appareils mobiles."
                        }
                    }
                },
                "showcase": {
                    "title": "Exprimez-vous Complètement",
                    "subtitle": "Partagez vos langues, intérêts et préférences de la manière qui vous semble la plus naturelle.",
                    "tabs": {
                        "languages": "Langues",
                        "interests": "Intérêts",
                        "measurements": "Mesures"
                    },
                    "languages": {
                        "english": "Natif, Courant, Avancé",
                        "vietnamese": "Langue d'Asie du Sud-Est",
                        "thai": "Famille de Langues Tonales",
                        "chinese": "Chinois Mandarin",
                        "more": "Couverture Mondiale"
                    }
                },
                "demo": {
                    "title": "Expérimentez l'Amour Mondial",
                    "subtitle": "Découvrez comment notre plateforme connecte les cœurs à travers les cultures et les continents",
                    "coverage": "Couverture Mondiale",
                    "users": "Utilisateurs Actifs",
                    "regions": "Régions Desservies",
                    "continents": "Continents",
                    "quality": "Correspondances de Qualité",
                    "professional": "Support Professionnel"
                },
                "cta": {
                    "title": "Prêt à Trouver Votre Partenaire Parfait ?",
                    "description": "Rejoignez des milliers de personnes dans le monde qui ont trouvé l'amour grâce à notre système de correspondance intelligent et culturellement conscient.",
                    "primary": "Commencez Votre Voyage",
                    "secondary": "Se Connecter"
                },
                "footer": {
                    "description": "Connecter les cœurs à travers les cultures et les continents. Trouvez l'amour qui transcende les frontières.",
                    "features": "Fonctionnalités",
                    "support": "Support",
                    "legal": "Légal",
                    "copyright": "Tous droits réservés. Fait avec ❤️ pour l'amour sans frontières."
                }
            },
            de: {
                "app": { "name": "Totilove" },
                "hero": {
                    "title": "Finde Liebe Über Grenzen Hinweg",
                    "subtitle": "Verbinde dich mit Menschen weltweit durch unser intelligentes Matching-System. Unterstützung für 25+ Sprachen, kulturelle Präferenzen und dein bevorzugtes Maßsystem.",
                    "features": {
                        "languages": "25+ Sprachen",
                        "matching": "Intelligentes Matching",
                        "security": "Sicher & Geschützt",
                        "mobile": "Mobil Optimiert"
                    },
                    "cta": {
                        "primary": "Heute Kostenlos Beitreten",
                        "secondary": "Mehr Erfahren"
                    }
                },
                "features": {
                    "title": "Warum Totilove Wählen?",
                    "subtitle": "Unsere Plattform kombiniert modernste Technologie mit kultureller Sensibilität, um dir dabei zu helfen, bedeutungsvolle Verbindungen weltweit zu finden.",
                    "items": {
                        "languages": {
                            "title": "Mehrsprachige Unterstützung",
                            "description": "Verbinde dich in deiner Muttersprache. Wir unterstützen 25+ Weltsprachen mit Sprachkenntnissen-Tracking und kulturellen Matching-Präferenzen."
                        },
                        "matching": {
                            "title": "Intelligenter Matching-Algorithmus",
                            "description": "Unser KI-gestütztes System berücksichtigt gemeinsame Sprachen, Interessen, kulturellen Hintergrund und persönliche Präferenzen für optimale Kompatibilität."
                        },
                        "interests": {
                            "title": "Interessensbasierte Verbindungen",
                            "description": "Finde Menschen, die deine Leidenschaften teilen. Von Sport bis Kunst, Technologie bis Reisen - verbinde dich über das, was du am meisten liebst."
                        },
                        "culture": {
                            "title": "Kulturelle Intelligenz",
                            "description": "Respektiere kulturelle Unterschiede mit automatischen regionalen Präferenzen, Maßsystemen und kulturbewusstem Matching."
                        },
                        "privacy": {
                            "title": "Privatsphäre & Sicherheit",
                            "description": "Deine Sicherheit ist unsere Priorität. Erweiterte Verifizierung, Privatsphäre-Kontrollen und sichere Nachrichten schützen deine persönlichen Informationen."
                        },
                        "mobile": {
                            "title": "Mobil Optimiert",
                            "description": "Bleibe überall verbunden. Unser responsives Design funktioniert perfekt auf Desktop, Tablet und mobilen Geräten."
                        }
                    }
                },
                "showcase": {
                    "title": "Drücke Dich Vollständig Aus",
                    "subtitle": "Teile deine Sprachen, Interessen und Präferenzen auf die Art, die sich für dich am natürlichsten anfühlt.",
                    "tabs": {
                        "languages": "Sprachen",
                        "interests": "Interessen",
                        "measurements": "Maße"
                    },
                    "languages": {
                        "english": "Muttersprache, Fließend, Fortgeschritten",
                        "vietnamese": "Südostasiatische Sprache",
                        "thai": "Tonsprachen-Familie",
                        "chinese": "Mandarin-Chinesisch",
                        "more": "Weltweite Abdeckung"
                    }
                },
                "demo": {
                    "title": "Erlebe Globale Liebe",
                    "subtitle": "Sehe wie unsere Plattform Herzen über Kulturen und Kontinente hinweg verbindet",
                    "coverage": "Globale Abdeckung",
                    "users": "Aktive Nutzer",
                    "regions": "Bediente Regionen",
                    "continents": "Kontinente",
                    "quality": "Qualitäts-Matches",
                    "professional": "Professioneller Support"
                },
                "cta": {
                    "title": "Bereit, Deinen Perfekten Partner zu Finden?",
                    "description": "Tritt Tausenden von Menschen weltweit bei, die durch unser intelligentes, kulturbewusstes Matching-System Liebe gefunden haben.",
                    "primary": "Beginne Deine Reise",
                    "secondary": "Anmelden"
                },
                "footer": {
                    "description": "Herzen über Kulturen und Kontinente hinweg verbinden. Finde Liebe, die Grenzen überschreitet.",
                    "features": "Funktionen",
                    "support": "Support",
                    "legal": "Rechtliches",
                    "copyright": "Alle Rechte vorbehalten. Mit ❤️ für grenzenlose Liebe gemacht."
                }
            },
            it: {
                "app": { "name": "Totilove" },
                "hero": {
                    "title": "Trova l'Amore Oltre i Confini",
                    "subtitle": "Connettiti con persone di tutto il mondo attraverso il nostro sistema di matching intelligente. Supporto per 25+ lingue, preferenze culturali e il tuo sistema di misurazione preferito.",
                    "features": {
                        "languages": "25+ Lingue",
                        "matching": "Matching Intelligente",
                        "security": "Sicuro e Protetto",
                        "mobile": "Ottimizzato Mobile"
                    },
                    "cta": {
                        "primary": "Unisciti Gratis Oggi",
                        "secondary": "Scopri di Più"
                    }
                },
                "features": {
                    "title": "Perché Scegliere Totilove?",
                    "subtitle": "La nostra piattaforma combina tecnologia all'avanguardia con sensibilità culturale per aiutarti a trovare connessioni significative in tutto il mondo.",
                    "items": {
                        "languages": {
                            "title": "Supporto Multi-Lingua",
                            "description": "Connettiti nella tua lingua madre. Supportiamo 25+ lingue mondiali con tracciamento della fluenza e preferenze di matching culturale."
                        },
                        "matching": {
                            "title": "Algoritmo di Matching Intelligente",
                            "description": "Il nostro sistema alimentato dall'IA considera lingue condivise, interessi, background culturale e preferenze personali per una compatibilità ottimale."
                        },
                        "interests": {
                            "title": "Connessioni Basate sugli Interessi",
                            "description": "Trova persone che condividono le tue passioni. Dallo sport all'arte, dalla tecnologia ai viaggi - connettiti su quello che ami di più."
                        },
                        "culture": {
                            "title": "Intelligenza Culturale",
                            "description": "Rispetta le differenze culturali con preferenze regionali automatiche, sistemi di misurazione e matching culturalmente consapevole."
                        },
                        "privacy": {
                            "title": "Privacy e Sicurezza",
                            "description": "La tua sicurezza è la nostra priorità. Verifica avanzata, controlli della privacy e messaggistica sicura proteggono le tue informazioni personali."
                        },
                        "mobile": {
                            "title": "Ottimizzato Mobile",
                            "description": "Rimani connesso ovunque. Il nostro design responsive funziona perfettamente su desktop, tablet e dispositivi mobili."
                        }
                    }
                },
                "showcase": {
                    "title": "Esprimi Te Stesso Completamente",
                    "subtitle": "Condividi le tue lingue, interessi e preferenze nel modo che ti sembra più naturale.",
                    "tabs": {
                        "languages": "Lingue",
                        "interests": "Interessi",
                        "measurements": "Misurazioni"
                    },
                    "languages": {
                        "english": "Madrelingua, Fluente, Avanzato",
                        "vietnamese": "Lingua del Sud-Est Asiatico",
                        "thai": "Famiglia di Lingue Tonali",
                        "chinese": "Cinese Mandarino",
                        "more": "Copertura Mondiale"
                    }
                },
                "demo": {
                    "title": "Sperimenta l'Amore Globale",
                    "subtitle": "Vedi come la nostra piattaforma connette cuori attraverso culture e continenti",
                    "coverage": "Copertura Globale",
                    "users": "Utenti Attivi",
                    "regions": "Regioni Servite",
                    "continents": "Continenti",
                    "quality": "Match di Qualità",
                    "professional": "Supporto Professionale"
                },
                "cta": {
                    "title": "Pronto a Trovare il Tuo Partner Perfetto?",
                    "description": "Unisciti a migliaia di persone in tutto il mondo che hanno trovato l'amore attraverso il nostro sistema di matching intelligente e culturalmente consapevole.",
                    "primary": "Inizia il Tuo Viaggio",
                    "secondary": "Accedi"
                },
                "footer": {
                    "description": "Connettere cuori attraverso culture e continenti. Trova l'amore che trascende i confini.",
                    "features": "Caratteristiche",
                    "support": "Supporto",
                    "legal": "Legale",
                    "copyright": "Tutti i diritti riservati. Fatto con ❤️ per l'amore senza confini."
                }
            },
            es: {
                "app": { "name": "Totilove" },
                "hero": {
                    "title": "Encuentra el Amor Más Allá de las Fronteras",
                    "subtitle": "Conéctate con personas de todo el mundo a través de nuestro sistema de emparejamiento inteligente. Soporte para 25+ idiomas, preferencias culturales y tu sistema de medición preferido.",
                    "features": {
                        "languages": "25+ Idiomas",
                        "matching": "Emparejamiento Inteligente",
                        "security": "Seguro y Protegido",
                        "mobile": "Optimizado Móvil"
                    },
                    "cta": {
                        "primary": "Únete Gratis Hoy",
                        "secondary": "Aprende Más"
                    }
                },
                "features": {
                    "title": "¿ Por Qué Elegir Totilove?",
                    "subtitle": "Nuestra plataforma combina tecnología de vanguardia con sensibilidad cultural para ayudarte a encontrar conexiones significativas en todo el mundo.",
                    "items": {
                        "languages": {
                            "title": "Soporte Multi-Idioma",
                            "description": "Conéctate en tu idioma nativo. Soportamos 25+ idiomas mundiales con seguimiento de fluidez y preferencias de emparejamiento cultural."
                        },
                        "matching": {
                            "title": "Algoritmo de Emparejamiento Inteligente",
                            "description": "Nuestro sistema impulsado por IA considera idiomas compartidos, intereses, trasfondo cultural y preferencias personales para una compatibilidad óptima."
                        },
                        "interests": {
                            "title": "Conexiones Basadas en Intereses",
                            "description": "Encuentra personas que comparten tus pasiones. Desde deportes hasta arte, tecnología hasta viajes - conéctate sobre lo que más amas."
                        },
                        "culture": {
                            "title": "Inteligencia Cultural",
                            "description": "Respeta las diferencias culturales con preferencias regionales automáticas, sistemas de medición y emparejamiento culturalmente consciente."
                        },
                        "privacy": {
                            "title": "Privacidad y Seguridad",
                            "description": "Tu seguridad es nuestra prioridad. Verificación avanzada, controles de privacidad y mensajería segura protegen tu información personal."
                        },
                        "mobile": {
                            "title": "Optimizado Móvil",
                            "description": "Mantente conectado en cualquier lugar. Nuestro diseño responsivo funciona perfectamente en escritorio, tablet y dispositivos móviles."
                        }
                    }
                },
                "showcase": {
                    "title": "Exprésate Completamente",
                    "subtitle": "Comparte tus idiomas, intereses y preferencias de la manera que te resulte más natural.",
                    "tabs": {
                        "languages": "Idiomas",
                        "interests": "Intereses",
                        "measurements": "Mediciones"
                    },
                    "languages": {
                        "english": "Nativo, Fluido, Avanzado",
                        "vietnamese": "Idioma del Sudeste Asiático",
                        "thai": "Familia de Idiomas Tonales",
                        "chinese": "Chino Mandarín",
                        "more": "Cobertura Mundial"
                    }
                },
                "demo": {
                    "title": "Experimenta el Amor Global",
                    "subtitle": "Ve cómo nuestra plataforma conecta corazones a través de culturas y continentes",
                    "coverage": "Cobertura Global",
                    "users": "Usuarios Activos",
                    "regions": "Regiones Atendidas",
                    "continents": "Continentes",
                    "quality": "Coincidencias de Calidad",
                    "professional": "Soporte Profesional"
                },
                "cta": {
                    "title": "¿Listo para Encontrar tu Pareja Perfecta?",
                    "description": "Únete a miles de personas en todo el mundo que han encontrado el amor a través de nuestro sistema de emparejamiento inteligente y culturalmente consciente.",
                    "primary": "Comienza tu Viaje",
                    "secondary": "Iniciar Sesión"
                },
                "footer": {
                    "description": "Conectando corazones a través de culturas y continentes. Encuentra amor que trasciende fronteras.",
                    "features": "Características",
                    "support": "Soporte",
                    "legal": "Legal",
                    "copyright": "Todos los derechos reservados. Hecho con ❤️ para el amor sin fronteras."
                }
            },
            ru: {
                "app": { "name": "Totilove" },
                "hero": {
                    "title": "Найдите Любовь За Пределами Границ",
                    "subtitle": "Связывайтесь с людьми по всему миру через нашу интеллектуальную систему подбора. Поддержка 25+ языков, культурные предпочтения и ваша предпочитаемая система измерений.",
                    "features": {
                        "languages": "25+ Языков",
                        "matching": "Умный Подбор",
                        "security": "Безопасно и Надёжно",
                        "mobile": "Мобильная Оптимизация"
                    },
                    "cta": {
                        "primary": "Присоединиться Бесплатно",
                        "secondary": "Узнать Больше"
                    }
                },
                "features": {
                    "title": "Почему Выбрать Totilove?",
                    "subtitle": "Наша платформа сочетает передовые технологии с культурной чувствительностью, чтобы помочь вам найти значимые связи по всему миру.",
                    "items": {
                        "languages": {
                            "title": "Многоязычная Поддержка",
                            "description": "Общайтесь на своём родном языке. Мы поддерживаем 25+ мировых языков с отслеживанием беглости и культурными предпочтениями подбора."
                        },
                        "matching": {
                            "title": "Интеллектуальный Алгоритм Подбора",
                            "description": "Наша система на основе ИИ учитывает общие языки, интересы, культурный фон и личные предпочтения для оптимальной совместимости."
                        },
                        "interests": {
                            "title": "Связи На Основе Интересов",
                            "description": "Найдите людей, которые разделяют ваши страсти. От спорта до искусства, от технологий до путешествий - общайтесь через то, что вы больше всего любите."
                        },
                        "culture": {
                            "title": "Культурный Интеллект",
                            "description": "Уважайте культурные различия с автоматическими региональными предпочтениями, системами измерений и культурно-осознанным подбором."
                        },
                        "privacy": {
                            "title": "Приватность и Безопасность",
                            "description": "Ваша безопасность - наш приоритет. Расширенная верификация, контроль приватности и безопасные сообщения защищают вашу личную информацию."
                        },
                        "mobile": {
                            "title": "Мобильная Оптимизация",
                            "description": "Оставайтесь на связи везде. Наш адаптивный дизайн отлично работает на настольных компьютерах, планшетах и мобильных устройствах."
                        }
                    }
                },
                "showcase": {
                    "title": "Выражайте Себя Полностью",
                    "subtitle": "Делитесь своими языками, интересами и предпочтениями способом, который кажется вам наиболее естественным.",
                    "tabs": {
                        "languages": "Языки",
                        "interests": "Интересы",
                        "measurements": "Измерения"
                    },
                    "languages": {
                        "english": "Родной, Свободный, Продвинутый",
                        "vietnamese": "Язык Юго-Восточной Азии",
                        "thai": "Семья Тональных Языков",
                        "chinese": "Китайский Мандарин",
                        "more": "Мировое Покрытие"
                    }
                },
                "demo": {
                    "title": "Испытайте Глобальную Любовь",
                    "subtitle": "Посмотрите, как наша платформа соединяет сердца через культуры и континенты",
                    "coverage": "Глобальное Покрытие",
                    "users": "Активные Пользователи",
                    "regions": "Обслуживаемые Регионы",
                    "continents": "Континенты",
                    "quality": "Качественные Совпадения",
                    "professional": "Профессиональная Поддержка"
                },
                "cta": {
                    "title": "Готовы Найти Своего Идеального Партнёра?",
                    "description": "Присоединяйтесь к тысячам людей по всему миру, которые нашли любовь через нашу интеллектуальную, культурно-осознанную систему подбора.",
                    "primary": "Начать Своё Путешествие",
                    "secondary": "Войти"
                },
                "footer": {
                    "description": "Соединяя сердца через культуры и континенты. Найдите любовь, которая превосходит границы.",
                    "features": "Функции",
                    "support": "Поддержка",
                    "legal": "Правовая Информация",
                    "copyright": "Все права защищены. Сделано с ❤️ для любви без границ."
                }
            },
            ph: {
                "app": { "name": "Totilove" },
                "hero": {
                    "title": "Maghanap ng Pag-ibig sa Buong Mundo",
                    "subtitle": "Makipag-ugnayan sa mga tao sa buong mundo sa pamamagitan ng aming matalinong sistema ng pagpapares. Suporta para sa 25+ wika, mga kultural na kagustuhan, at iyong ginustong sistema ng pagsukat.",
                    "features": {
                        "languages": "25+ Wika",
                        "matching": "Matalinong Pagpapares",
                        "security": "Ligtas at Secure",
                        "mobile": "Handa sa Mobile"
                    },
                    "cta": {
                        "primary": "Sumali Libre Ngayon",
                        "secondary": "Matuto Pa"
                    }
                },
                "features": {
                    "title": "Bakit Piliin ang Totilove?",
                    "subtitle": "Ang aming platform ay pinagsasama ang cutting-edge na teknolohiya na may cultural sensitivity upang matulungan kang makahanap ng makabuluhang koneksyon sa buong mundo.",
                    "items": {
                        "languages": {
                            "title": "Multi-Language Support",
                            "description": "Makipag-ugnayan sa iyong sariling wika. Sinusuportahan namin ang 25+ wika sa mundo na may fluency tracking at cultural matching preferences."
                        },
                        "matching": {
                            "title": "Smart Matching Algorithm",
                            "description": "Ang aming AI-powered system ay isinasaalang-alang ang shared languages, interests, cultural background, at personal preferences para sa optimal compatibility."
                        },
                        "interests": {
                            "title": "Interest-Based Connections",
                            "description": "Maghanap ng mga taong may parehong passion. Mula sa sports hanggang arts, technology hanggang travel - kumonekta sa mga bagay na mahal mo."
                        },
                        "culture": {
                            "title": "Cultural Intelligence",
                            "description": "Igalang ang mga pagkakaiba sa kultura na may automatic regional preferences, measurement systems, at culturally-aware matching."
                        },
                        "privacy": {
                            "title": "Privacy & Security",
                            "description": "Ang iyong kaligtasan ay aming prayoridad. Advanced verification, privacy controls, at secure messaging ay pinoprotektahan ang iyong personal na impormasyon."
                        },
                        "mobile": {
                            "title": "Mobile Optimized",
                            "description": "Manatiling konektado kahit saan. Ang aming responsive design ay gumagana nang perpekto sa desktop, tablet, at mobile devices."
                        }
                    }
                },
                "showcase": {
                    "title": "Ipahayag ang Iyong Sarili nang Buo",
                    "subtitle": "Ibahagi ang iyong mga wika, interests, at preferences sa paraan na pinaka-natural sa iyo.",
                    "tabs": {
                        "languages": "Mga Wika",
                        "interests": "Mga Interest",
                        "measurements": "Mga Sukat"
                    },
                    "languages": {
                        "english": "Native, Fluent, Advanced",
                        "vietnamese": "Southeast Asian Language",
                        "thai": "Tonal Language Family",
                        "chinese": "Mandarin Chinese",
                        "more": "Worldwide Coverage"
                    }
                },
                "demo": {
                    "title": "Makaranas ng Global Love",
                    "subtitle": "Tingnan kung paano ang aming platform ay kumokonekta ng mga puso sa buong kultura at kontinente",
                    "coverage": "Global Coverage",
                    "users": "Active Users",
                    "regions": "Regions Served",
                    "continents": "Continents",
                    "quality": "Quality Matches",
                    "professional": "Professional Support"
                },
                "cta": {
                    "title": "Handa na ba kayong Maghanap ng Inyong Perfect Match?",
                    "description": "Sumali sa libu-libong tao sa buong mundo na nakahanap ng pag-ibig sa pamamagitan ng aming intelligent, culturally-aware matching system.",
                    "primary": "Simulan ang Inyong Journey",
                    "secondary": "Sign In"
                },
                "footer": {
                    "description": "Kumokonekta ng mga puso sa buong kultura at kontinente. Maghanap ng pag-ibig na lumalampas sa mga hangganan.",
                    "features": "Features",
                    "support": "Support",
                    "legal": "Legal",
                    "copyright": "All rights reserved. Made with ❤️ for love without borders."
                }
            }
        };

        this.translations = translations;
    }

    async switchLanguage(languageCode) {
        if (!this.supportedLanguages.includes(languageCode)) {
            // Language not supported
            return;
        }

        this.currentLanguage = languageCode;
        this.setLanguagePreference(languageCode);
        
        this.translatePage();
        
        // Dispatch custom event
        document.dispatchEvent(new CustomEvent('languageChanged', {
            detail: { language: languageCode }
        }));
    }

    translatePage() {
        const elements = document.querySelectorAll('[data-i18n]');
        
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.getTranslation(key);
            
            if (translation) {
                if (element.tagName === 'INPUT' && element.type === 'text') {
                    element.placeholder = translation;
                } else {
                    element.textContent = translation;
                }
            }
        });
    }

    getTranslation(key) {
        const keys = key.split('.');
        let value = this.translations[this.currentLanguage];
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                // Fallback to English
                value = this.translations['en'];
                for (const fallbackKey of keys) {
                    if (value && typeof value === 'object' && fallbackKey in value) {
                        value = value[fallbackKey];
                    } else {
                        return key; // Return key if translation not found
                    }
                }
                break;
            }
        }
        
        return typeof value === 'string' ? value : key;
    }
}

// Global instance
window.simpleI18n = new SimpleI18n();
