import express from "express";
import multer from "multer";
import path from "node:path";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, createPrivateKey, createPublicKey, createSign, createVerify, randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { access, appendFile, copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createOrderStore } from "./order-store.js";
import { createMerchantStore } from "./merchant-store.js";
import { createCommerceStore } from "./commerce-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const localEnvPath = path.join(rootDir, ".env");

// Load .env before reading any environment-backed configuration constants below.
loadLocalEnv();

const authDebugLogPath = path.join(rootDir, "data", "auth-debug.log");
const dataPath = path.join(rootDir, "data", "styles.json");
const styleGroupsPath = path.join(rootDir, "data", "style-groups.json");
const imageJobRoot = path.join(rootDir, "data", "image-jobs");
const drawCardSessionRoot = path.join(rootDir, "data", "draw-card-sessions");
const bodyBookSessionRoot = path.join(rootDir, "data", "body-book-sessions");
const visitSessionRoot = path.join(rootDir, "data", "visit-sessions");
const tempReferenceRoot = path.join(rootDir, "data", "temp-image-references");
const visitorStateRoot = path.join(rootDir, "data", "visitor-states");
const inviteCodePath = path.join(rootDir, "data", "invite-codes.json");
const merchantDataPath = path.join(rootDir, "data", "merchants.json");
const adminSessionRoot = path.join(rootDir, "data", "admin-sessions");
const appSettingsPath = path.join(rootDir, "data", "app-settings.json");
const apiProviderDataPath = path.join(rootDir, "data", "api-providers.json");
const orderDbPath = path.join(rootDir, "data", "orders.sqlite");
const storageBackupRoot = path.join(rootDir, "data", "storage-backups");
const storageExportTempRoot = path.join(rootDir, "data", "storage-export-temp");
const orderAssetPublicRoot = path.join(rootDir, "public", "order-assets");
const accountAvatarPublicRoot = path.join(rootDir, "public", "account-avatars");
const orderOriginalArchiveRoot = path.join(rootDir, "data", "order-original-downloads");
const bodyBookPrintBackCoverPath = path.join(rootDir, "public", "body-book-color-pages", "print-back-cover.jpg");
const bodyBookPresetPageRoot = path.join(rootDir, "public", "body-book-preset-pages");
const previewRoot = path.join(rootDir, "public", "style-previews");
const generatedImageRoot = path.join(rootDir, "data", "private-generated-images");
const generatedPreviewRoot = path.join(rootDir, "public", "generated-previews");
const generatedThumbnailRoot = path.join(rootDir, "public", "generated-thumbnails");
const legacyGeneratedImageRoot = path.join(rootDir, "public", "generated-images");
const jobReferenceRoot = path.join(rootDir, "data", "private-job-references");
const jobReferenceThumbnailRoot = path.join(rootDir, "public", "job-reference-thumbnails");
const miniDataPath = path.join(rootDir, "wechat-miniprogram", "miniprogram", "data", "styles.js");
const miniImageRoot = path.join(rootDir, "wechat-miniprogram", "miniprogram", "images-small");
const miniCompressScript = path.join(rootDir, "tools", "compress_for_miniprogram.ps1");
const execFileAsync = promisify(execFile);
const RESULT_THUMBNAIL_MAX_EDGE = 384;
const PUBLIC_PREVIEW_MAX_EDGE = 1536;
const REFERENCE_THUMBNAIL_MAX_EDGE = 240;
const DRAW_CARD_GROUP_NAME = "抽卡";
const BODY_BOOK_MAX_REFERENCE_COUNT = 3;
const FRIDGE_MAGNET_GROUP_NAME = "冰箱贴";
const DRAW_CARD_DEFAULT_SIZE = "1024x1536";
const STYLE_GROUP_SIZE_OPTIONS = new Set(["1024x1536", "1536x1024", "1024x1024", "1024x1365", "1365x1024"]);
const DRAW_CARD_WAITING_MESSAGE = "总计需要约 5 分钟。无需保持当前页面开启，可切到后台，稍后回来查看结果。";
const DRAW_CARD_SUCCESS_MESSAGE = "结果已准备好。";
const DRAW_CARD_FAILURE_MESSAGE = "这一轮未能顺利完成，请重新开始。";
const DRAW_CARD_PARTIAL_MESSAGE = "部分结果已准备好，仅扣除成功生成的币。";
const PUBLIC_PREVIEW_WATERMARK_TEXT = "AI小画家";
const PUBLIC_PREVIEW_WATERMARK_OUTLINE_FONT_SIZE = 100;
const PUBLIC_PREVIEW_WATERMARK_OUTLINE_ADVANCE = 404.3;
const PUBLIC_PREVIEW_WATERMARK_OUTLINE_BASELINE = 96.48;
const PUBLIC_PREVIEW_WATERMARK_OUTLINE_PATH = "M64.7 83.98L55.32 83.98L49.85 63.28L32.67 63.28L27.2 83.98L17.82 83.98L37.35 16.41L45.17 16.41ZM47.9 55.86L41.65 32.03L40.87 32.03L34.62 55.86ZM97.07 83.98L88.09 83.98L88.09 17.19L97.07 17.19ZM174.37 5.47C174.1 9.11 173.97 14.06 173.97 20.31L173.97 83.2C173.97 88.15 172.67 91.28 170.07 92.58C167.46 93.88 163.04 94.79 156.79 95.31C156.27 92.19 155.09 89.19 153.27 86.33C159 86.33 162.58 86.2 164.01 85.94C165.45 85.68 166.16 84.11 166.16 81.25L166.16 20.31C166.16 15.63 166.03 10.68 165.77 5.47ZM152.1 32.81C149.76 39.32 147.02 46.81 143.9 55.27C140.77 63.74 138.04 70.05 135.69 74.22C133.09 72.14 130.35 70.83 127.49 70.31C131.92 62.5 135.43 54.75 138.04 47.07C140.64 39.39 142.33 33.72 143.12 30.08C146.24 31.64 149.24 32.55 152.1 32.81ZM192.72 29.69C203.14 48.44 209.39 61.2 211.47 67.97C208.87 68.49 206.27 69.66 203.66 71.48C199.76 60.29 193.77 47.79 185.69 33.98C187.78 32.94 190.12 31.51 192.72 29.69ZM295.7 26.56C295.44 30.47 295.31 35.16 295.31 40.63L295.31 57.03C295.31 60.68 295.44 66.15 295.7 73.44L250 73.44C250.26 69.27 250.39 64.97 250.39 60.55L250.39 41.41C250.39 35.68 250.26 30.73 250 26.56ZM239.06 82.81L306.25 82.81L306.25 43.36C306.25 41.02 306.12 37.89 305.86 33.98L314.45 33.98C314.19 37.63 314.06 40.76 314.06 43.36L314.06 83.98C314.06 86.59 314.19 90.36 314.45 95.31L306.25 95.31L306.25 88.67L231.25 88.67C231.51 85.81 231.64 82.29 231.64 78.13L231.64 44.14C231.64 40.76 231.51 37.5 231.25 34.38L239.06 34.38ZM297.27 10.55C302.99 10.55 308.59 10.42 314.06 10.16L314.06 17.19C308.59 16.93 302.99 16.8 297.27 16.8L251.56 16.8C245.05 16.8 238.67 16.93 232.42 17.19L232.42 10.16C238.67 10.42 245.05 10.55 251.56 10.55ZM269.53 67.19L269.53 52.73L257.42 52.73L257.42 67.19ZM269.53 46.48L269.53 32.42L257.42 32.42L257.42 46.48ZM288.28 67.19L288.28 52.73L276.56 52.73L276.56 67.19ZM288.28 46.48L288.28 32.42L276.56 32.42L276.56 46.48ZM379.15 68.36C370.56 75.13 362.61 80.47 355.32 84.38C348.03 88.28 341.78 91.54 336.57 94.14C334.49 91.54 332.54 89.19 330.71 87.11C343.47 82.94 353.56 78.52 360.99 73.83C368.41 69.14 373.68 65.1 376.81 61.72C375.77 59.9 374.72 58.33 373.68 57.03C365.61 62.76 358.45 67.32 352.2 70.7C345.95 74.09 341 76.43 337.35 77.73C335.53 75.13 333.58 72.92 331.49 71.09C341.91 67.97 350.18 64.58 356.3 60.94C362.42 57.29 366.78 54.3 369.38 51.95C368.34 50.65 367.17 49.22 365.87 47.66C361.7 50 357.21 52.28 352.39 54.49C347.57 56.71 342.43 58.98 336.96 61.33C335.4 58.72 333.58 56.12 331.49 53.52C342.17 50.91 350.37 48.18 356.1 45.31C361.83 42.45 366 39.58 368.6 36.72L363.13 36.72C359.49 36.72 355.19 36.85 350.24 37.11L350.24 30.08C355.19 30.34 359.49 30.47 363.13 30.47L389.7 30.47C393.08 30.47 397.25 30.34 402.2 30.08L402.2 37.11C397.25 36.85 393.08 36.72 389.7 36.72L379.15 36.72C376.81 38.8 374.2 41.15 371.34 43.75C373.42 45.57 375.37 47.46 377.2 49.41C379.02 51.37 380.97 54.04 383.06 57.42C386.18 55.86 389.7 53.71 393.6 50.98C397.51 48.24 401.03 44.79 404.15 40.63C408.06 44.27 410.66 46.74 411.96 48.05C408.84 49.35 406.1 50.65 403.76 51.95C401.42 53.26 399.46 54.69 397.9 56.25C400.24 64.06 403.24 69.66 406.88 73.05C410.53 76.43 415.61 79.69 422.12 82.81C419.52 84.64 417.17 87.11 415.09 90.23C407.8 85.55 402.46 80.66 399.07 75.59C395.69 70.51 393.34 65.23 392.04 59.77C389.96 61.07 387.87 62.24 385.79 63.28C387.09 70.31 387.68 76.17 387.55 80.86C387.42 85.55 385.47 89.13 381.69 91.6C377.91 94.08 373.42 95.7 368.21 96.48C367.17 93.1 366 90.1 364.7 87.5C369.12 87.5 372.64 87.11 375.24 86.33C377.85 85.55 379.35 83.59 379.74 80.47C380.13 77.34 379.93 73.31 379.15 68.36ZM377.98 3.52C378.5 6.12 379.67 10.03 381.49 15.23L417.43 15.23C417.17 19.4 417.04 22.79 417.04 25.39C417.04 27.73 417.17 30.73 417.43 34.38L409.23 34.38L409.23 21.48L341.26 21.48L341.26 36.33L333.06 36.33C333.32 32.16 333.45 28.52 333.45 25.39C333.45 22.01 333.32 18.62 333.06 15.23L372.12 15.23C371.08 11.85 369.91 8.85 368.6 6.25C371.99 5.47 375.11 4.56 377.98 3.52Z";
const VISITOR_COOKIE_NAME = "pg_visitor";
const WEB_ACCOUNT_COOKIE_NAME = "pg_web_account";
const USER_SESSION_COOKIE_NAME = "pg_user_session";
const WEB_WECHAT_OAUTH_STATE_COOKIE_NAME = "pg_wechat_oauth_state";
const ADMIN_COOKIE_NAME = "pg_admin";
const VISITOR_INVITE_BONUS = 5;
const VISITOR_RUNNING_JOB_LIMIT = 1;
const VISITOR_RATE_WINDOW_MS = 10 * 60 * 1000;
const VISITOR_RATE_LIMIT = 6;
const IP_RATE_WINDOW_MS = 10 * 60 * 1000;
const IP_RATE_LIMIT = 8;
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const USER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const INVITE_DEFAULT_MAX_REDEMPTIONS = 1;
const DEFAULT_CONTACT_MESSAGE = "如需更多生图机会，请联系客服领取兑换码。";
const DEFAULT_VISITOR_ANONYMOUS_LIMIT = 5;
const DEFAULT_STORAGE_CLEANUP_DAYS = 30;
const MAX_STORAGE_CLEANUP_DAYS = 3650;
const DEFAULT_FRIDGE_ORDERING_ENABLED = false;
const DEFAULT_FRIDGE_MAGNET_UNIT_PRICE_CENTS = 2000;
const DEFAULT_SINGLE_ITEM_SHIPPING_FEE_CENTS = 800;
const DEFAULT_BODY_BOOK_ORDERING_ENABLED = false;
const DEFAULT_BODY_BOOK_PRICE_CENTS = 0;
const DEFAULT_BODY_BOOK_SHIPPING_FEE_CENTS = 0;
const DEFAULT_FREE_SHIPPING_ITEM_COUNT = 2;
const DEFAULT_ORDER_PAYMENT_MODE = "manual";
const DEFAULT_MANUAL_PAYMENT_EXPIRE_DAYS = 7;
const DEFAULT_CONTACT_WECHAT_ID = "PetPaint";
const WEB_SIGNUP_CREDITS = 5;
const WEB_SIGNUP_BEANS = 10;
const MERCHANT_SOURCE_LOCK_MS = 30 * 24 * 60 * 60 * 1000;
const MERCHANT_SIGNATURE_BYTES = 8;
const MERCHANT_STATUS_VALUES = new Set(["active", "inactive"]);
const ORDER_PAYMENT_EXPIRE_MS = 30 * 60 * 1000;
const ORDER_SEARCH_LIMIT = 100;
const MERCHANT_SEARCH_LIMIT = 500;
const ORDER_PAYMENT_STATUS_VALUES = new Set(["unpaid", "paid", "failed", "expired"]);
const ORDER_FULFILLMENT_STATUS_VALUES = new Set(["new", "in_production", "shipped", "completed", "cancelled"]);
const ORDER_PAYMENT_MODE_VALUES = new Set(["manual", "wechat"]);
const ORDER_STATUS_VALUES = new Set(["pending_payment", "pending_shipment", "shipped", "completed", "cancelled", "expired"]);
const SHIPPING_CARRIER_OPTIONS = [
  { code: "shunfeng", name: "顺丰速运", aliases: ["顺丰", "顺丰快递"] },
  { code: "zhongtong", name: "中通快递", aliases: ["中通"] },
  { code: "yuantong", name: "圆通速递", aliases: ["圆通", "圆通快递"] },
  { code: "shentong", name: "申通快递", aliases: ["申通"] },
  { code: "yunda", name: "韵达快递", aliases: ["韵达"] },
  { code: "jtexpress", name: "极兔速递", aliases: ["极兔", "极兔快递"] },
  { code: "jingdong", name: "京东快递", aliases: ["京东", "京东物流"] },
  { code: "debangwuliu", name: "德邦快递", aliases: ["德邦", "德邦物流"] },
  { code: "baishiwuliu", name: "百世快递", aliases: ["百世", "百世物流"] },
  { code: "ems", name: "EMS", aliases: ["邮政ems"] },
  { code: "youzhengguonei", name: "中国邮政速递物流", aliases: ["中国邮政", "邮政", "邮政快递"] },
  { code: "zhaijisong", name: "宅急送", aliases: [] },
  { code: "dhl", name: "DHL", aliases: [] },
  { code: "fedex", name: "FedEx", aliases: [] },
  { code: "ups", name: "UPS", aliases: [] },
  { code: "tnt", name: "TNT", aliases: [] }
];
const BACKUP_KIND_CONFIG = "config-snapshot";
const BACKUP_KIND_IMAGE_RANGE = "image-range-zip";
const ADMIN_DRAW_CARD_SESSION_LIMIT = 3;
const IMAGE_JOB_QUERY_STATUS_VALUES = new Set(["all", "queued", "running", "partial", "succeeded", "failed", "cancelled"]);
const DEFAULT_IMAGE_JOB_PAGE = 1;
const DEFAULT_IMAGE_JOB_LIMIT = 20;
const MAX_IMAGE_JOB_LIMIT = 100;
const DEFAULT_PUBLIC_EXPERIENCE_TYPE = "draw-card";
const DEFAULT_SUBJECT_CLASSIFIER_MODEL = "gpt-5.4-mini";
const DEFAULT_SUBJECT_CLASSIFIER_BASE_URL = "https://api.openai.com/v1";
const SUBJECT_CLASSIFIER_TIMEOUT_MS = 30000;
const SUBJECT_CLASSIFIER_CONFIDENCE_THRESHOLD = 0.55;
const DRAW_CARD_MIN_STYLE_COUNT = 1;
const DRAW_CARD_MAX_STYLE_COUNT = 6;
const DRAW_CARD_DEFAULT_STYLE_COUNT = 2;
const BODY_BOOK_SIZE = "1024x1024";
const BODY_BOOK_GENERATION_MODE = String(process.env.BODY_BOOK_GENERATION_MODE || "mock").trim().toLowerCase();
const BODY_BOOK_MOCK_MODE = BODY_BOOK_GENERATION_MODE !== "live";
const BODY_BOOK_BILLING_ENABLED = !["0", "false", "no", "off"].includes(String(process.env.BODY_BOOK_BILLING_ENABLED || "true").trim().toLowerCase());
const BODY_BOOK_MOCK_PROVIDER = { id: "body-book-mock", name: "开发模拟", model: "mock" };
const BODY_BOOK_PARTS = [
  { key: "head", chinese: "头部", english: "Head", copy: "This is my head. 这是我的头部。" },
  { key: "eyes", chinese: "眼睛", english: "Eyes", copy: "I see with my eyes. 我用眼睛看世界。" },
  { key: "ears", chinese: "耳朵", english: "Ears", copy: "I hear with my ears. 我用耳朵听声音。" },
  { key: "nose", chinese: "鼻子", english: "Nose", copy: "I smell with my nose. 我用鼻子闻一闻。" },
  { key: "mouth", chinese: "嘴巴", english: "Mouth", copy: "I smile with my mouth. 我用嘴巴笑一笑。" },
  { key: "cheeks", chinese: "脸颊", english: "Cheeks", copy: "These are my cheeks. 这是我的脸颊。" },
  { key: "chin", chinese: "下巴", english: "Chin", copy: "This is my chin. 这是我的下巴。" },
  { key: "hair", chinese: "头发", english: "Hair", copy: "This is my hair. 这是我的头发。" },
  { key: "teeth", chinese: "牙齿", english: "Teeth", copy: "I brush my teeth. 我会刷牙。" },
  { key: "arms", chinese: "手臂", english: "Arms", copy: "These are my arms. 这是我的手臂。" },
  { key: "hands", chinese: "手", english: "Hands", copy: "My hands can touch. 我的小手会触摸。" },
  { key: "fingers", chinese: "手指", english: "Fingers", copy: "These are my fingers. 这是我的手指。" },
  { key: "legs", chinese: "腿", english: "Legs", copy: "These are my legs. 这是我的腿。" },
  { key: "feet", chinese: "脚", english: "Feet", copy: "My feet help me walk. 我用小脚走路。" },
  { key: "toes", chinese: "脚趾", english: "Toes", copy: "These are my toes. 这是我的脚趾。" },
  { key: "tummy", chinese: "肚子", english: "Tummy", copy: "This is my tummy. 这是我的小肚子。" },
  { key: "knees", chinese: "膝盖", english: "Knees", copy: "My knees can bend. 我的小膝盖会弯曲。" }
];
const PAIRED_PRESET_LAYOUT_VERSION = "paired-preset-v2";
const LEGACY_BODY_BOOK_LAYOUT_VERSION = "legacy-v1";
const PAIRED_PRESET_BOOK_PARTS = {
  body: [
    ["head", "头部", "Head", "This is my head. 这是我的头部。"],
    ["eyes", "眼睛", "Eyes", "These are my eyes. 这是我的眼睛。"],
    ["ears", "耳朵", "Ears", "These are my ears. 这是我的耳朵。"],
    ["nose", "鼻子", "Nose", "This is my nose. 这是我的鼻子。"],
    ["mouth", "嘴巴", "Mouth", "This is my mouth. 这是我的嘴巴。"],
    ["hands", "手", "Hands", "These are my hands. 这是我的手。"],
    ["feet", "脚", "Feet", "These are my feet. 这是我的脚。"],
    ["tummy", "肚子", "Tummy", "This is my tummy. 这是我的小肚子。"]
  ],
  transport: [
    ["car", "汽车", "Car"], ["bus", "公交车", "Bus"], ["train", "火车", "Train"], ["airplane", "飞机", "Airplane"],
    ["boat", "小船", "Boat"], ["bicycle", "自行车", "Bicycle"], ["truck", "卡车", "Truck"], ["ambulance", "救护车", "Ambulance"]
  ].map(([key, chinese, english]) => [key, chinese, english, `This is a ${english}. 这是一辆${chinese}。`]),
  animal: [
    ["cat", "小猫", "Cat"], ["dog", "小狗", "Dog"], ["rabbit", "兔子", "Rabbit"], ["horse", "马", "Horse"],
    ["cow", "奶牛", "Cow"], ["duck", "小鸭", "Duck"], ["elephant", "大象", "Elephant"], ["lion", "狮子", "Lion"]
  ].map(([key, chinese, english]) => [key, chinese, english, `Hello, ${english}! 你好，${chinese}！`])
};
const PAIRED_PRESET_BOOK_THEME_IDS = new Set(Object.keys(PAIRED_PRESET_BOOK_PARTS));
const BOOK_THEME_DEFINITIONS = [
  { id: "body", name: "身体认知书", englishName: "My First Body", title: "我的第一本身体认知书", parts: BODY_BOOK_PARTS },
  { id: "career", name: "职业认知书", englishName: "My First Jobs", title: "我的第一本职业认知书", parts: [
    ["doctor", "医生", "Doctor"], ["teacher", "老师", "Teacher"], ["firefighter", "消防员", "Firefighter"], ["chef", "厨师", "Chef"], ["police", "警察", "Police Officer"], ["farmer", "农夫", "Farmer"], ["builder", "建筑师", "Builder"], ["scientist", "科学家", "Scientist"], ["artist", "艺术家", "Artist"], ["nurse", "护士", "Nurse"], ["dentist", "牙医", "Dentist"], ["baker", "面包师", "Baker"], ["gardener", "园丁", "Gardener"], ["veterinarian", "兽医", "Veterinarian"], ["dancer", "舞蹈家", "Dancer"], ["writer", "作家", "Writer"], ["singer", "歌手", "Singer"], ["hairdresser", "理发师", "Hairdresser"]
  ].map(([key, chinese, english]) => ({ key, chinese, english, copy: `I can be a ${english}. 我可以成为${chinese}。` })) },
  { id: "color", name: "颜色认知书", englishName: "My First Colors", title: "我的第一本颜色认知书", parts: [
    ["red", "红色", "Red"], ["orange", "橙色", "Orange"], ["yellow", "黄色", "Yellow"], ["green", "绿色", "Green"], ["blue", "蓝色", "Blue"], ["purple", "紫色", "Purple"], ["pink", "粉色", "Pink"], ["black", "黑色", "Black"]
  ].map(([key, chinese, english]) => ({ key, chinese, english, copy: `This is ${english}. 这是${chinese}。` })) },
  { id: "emotion", name: "情绪认知书", englishName: "My First Feelings", title: "我的第一本情绪认知书", parts: [
    ["happy", "开心", "Happy"], ["sad", "难过", "Sad"], ["angry", "生气", "Angry"], ["surprised", "惊讶", "Surprised"], ["scared", "害怕", "Scared"], ["shy", "害羞", "Shy"], ["excited", "兴奋", "Excited"], ["calm", "平静", "Calm"], ["proud", "自豪", "Proud"], ["sleepy", "困倦", "Sleepy"], ["curious", "好奇", "Curious"], ["upset", "委屈", "Upset"], ["expectant", "期待", "Expectant"], ["bored", "无聊", "Bored"], ["confused", "困惑", "Confused"], ["loving", "友爱", "Loving"]
  ].map(([key, chinese, english]) => ({ key, chinese, english, copy: `I feel ${english}. 我感到${chinese}。` })) },
  { id: "transport", name: "交通工具认知书", englishName: "My First Vehicles", title: "我的第一本交通工具认知书", parts: [
    ["car", "汽车", "Car"], ["bus", "公交车", "Bus"], ["train", "火车", "Train"], ["airplane", "飞机", "Airplane"], ["boat", "小船", "Boat"], ["bicycle", "自行车", "Bicycle"], ["truck", "卡车", "Truck"], ["taxi", "出租车", "Taxi"], ["ambulance", "救护车", "Ambulance"], ["metro", "地铁", "Metro"], ["ship", "轮船", "Ship"], ["helicopter", "直升机", "Helicopter"], ["fire-truck", "消防车", "Fire Truck"], ["school-bus", "校车", "School Bus"], ["tractor", "拖拉机", "Tractor"], ["cable-car", "缆车", "Cable Car"]
  ].map(([key, chinese, english]) => ({ key, chinese, english, copy: `This is a ${english}. 这是一辆${chinese}。` })) },
  { id: "animal", name: "动物认知书", englishName: "My First Animals", title: "我的第一本动物认知书", parts: [
    ["cat", "小猫", "Cat"], ["dog", "小狗", "Dog"], ["rabbit", "兔子", "Rabbit"], ["horse", "马", "Horse"], ["cow", "奶牛", "Cow"], ["duck", "小鸭", "Duck"], ["goldfish", "金鱼", "Goldfish"], ["turtle", "乌龟", "Turtle"], ["monkey", "猴子", "Monkey"], ["bear", "小熊", "Bear"], ["lion", "狮子", "Lion"], ["elephant", "大象", "Elephant"], ["giraffe", "长颈鹿", "Giraffe"], ["penguin", "企鹅", "Penguin"], ["butterfly", "蝴蝶", "Butterfly"], ["sheep", "小羊", "Sheep"]
  ].map(([key, chinese, english]) => ({ key, chinese, english, copy: `Hello, ${english}! 你好，${chinese}！` })) },
  { id: "daily", name: "日常行为认知书", englishName: "My First Daily Routines", title: "我的第一本日常行为认知书", parts: [
    { key: "wake-up", chinese: "起床", english: "Wake Up", copy: "I can wake up. 我会起床。" },
    { key: "wash-face", chinese: "洗脸", english: "Wash Face", copy: "I can wash my face. 我会洗脸。" },
    { key: "brush-teeth", chinese: "刷牙", english: "Brush Teeth", copy: "I can brush my teeth. 我会刷牙。" },
    { key: "get-dressed", chinese: "穿衣", english: "Get Dressed", copy: "I can get dressed. 我会穿衣。" },
    { key: "put-on-shoes", chinese: "穿鞋", english: "Put On Shoes", copy: "I can put on my shoes. 我会穿鞋。" },
    { key: "eat", chinese: "吃饭", english: "Eat", copy: "I can eat. 我会吃饭。" },
    { key: "drink-water", chinese: "喝水", english: "Drink Water", copy: "I can drink water. 我会喝水。" },
    { key: "wash-hands", chinese: "洗手", english: "Wash Hands", copy: "I can wash my hands. 我会洗手。" },
    { key: "play", chinese: "玩耍", english: "Play", copy: "I can play. 我会玩耍。" },
    { key: "read", chinese: "阅读", english: "Read", copy: "I can read. 我会阅读。" },
    { key: "tidy-up", chinese: "收拾玩具", english: "Tidy Up", copy: "I can tidy up. 我会收拾玩具。" },
    { key: "say-hello", chinese: "打招呼", english: "Say Hello", copy: "I can say hello. 我会打招呼。" },
    { key: "bath", chinese: "洗澡", english: "Bath Time", copy: "I can take a bath. 我会洗澡。" },
    { key: "sleep", chinese: "睡觉", english: "Sleep", copy: "I can sleep. 我会睡觉。" },
    { key: "comb-hair", chinese: "梳头", english: "Comb Hair", copy: "I can comb my hair. 我会梳头。" },
    { key: "go-for-a-walk", chinese: "散步", english: "Go for a Walk", copy: "I can go for a walk. 我会散步。" }
  ] }
];
const BODY_BOOK_PROMPT_PROFILES = {
  body: {
    coverScene: "the baby naturally pointing to or touching several body-part cues, with a few restrained arrows and tiny learning markers",
    cardScene: "a close, natural baby pose in which the requested body part is unmistakably visible; use one restrained dotted arrow to that body part",
    accents: "warm cream, sage green, and soft apricot",
    icons: "simple body-part learning symbols"
  },
  career: {
    coverScene: "the baby in one charming, soft-fabric career outfit, with a small matching prop and a few floating career symbols",
    cardScene: "the baby in a child-safe, soft-fabric version of the requested profession's outfit, doing one natural action with one simple matching prop",
    accents: "soft sky blue, coral, sunny yellow, and warm cream",
    icons: "small career tools and symbols"
  },
  color: {
    coverScene: "the baby in a playful but refined rainbow color-block outfit, surrounded by six clearly separated, friendly everyday objects in different natural rainbow colors; each object is a crisp white-outline cutout on a pure white page",
    cardScene: "the baby wearing the requested color as the clear outfit color and naturally interacting with several matching-color learning objects; the requested color must be unmistakable",
    accents: "the requested color only, plus restrained warm-cream paper texture; keep the page background pure white",
    icons: "matching-color everyday objects, fruits, animals, plants, toys, and simple color swatches"
  },
  emotion: {
    coverScene: "a warm, expressive baby portrait with a small, calm ring of simple emotion symbols around the baby",
    cardScene: "a close baby portrait showing the requested emotion clearly and gently through facial expression, clothing, and an active natural pose; no exaggerated or distressing expression",
    accents: "soft peach, butter yellow, pale blue, and warm cream",
    icons: "small, friendly emotion symbols such as stars, clouds, hearts, or smile marks"
  },
  transport: {
    coverScene: "the baby with six clearly separated photographs of real, full-size vehicles floating as clean cutouts on a white page; never use toy, miniature, ride-on, cartoon, illustrated, or CGI vehicles; no road scene or cluttered environment",
    cardScene: "the baby safely playing with one clearly recognizable child-safe toy version of the requested vehicle; never show the baby inside, riding, sitting in, or near any real full-size vehicle",
    accents: "soft primary colors, pale blue, and warm cream",
    icons: "small transport symbols and movement marks"
  },
  animal: {
    coverScene: "the baby surrounded by six friendly, clearly separated photographs of real living animals with natural fur, feathers, or skin texture, presented as clean cutouts with generous white space; never use plush, toy, cartoon, illustrated, or CGI animals",
    cardScene: "the baby wearing a soft, child-safe costume inspired by the requested animal and making one gentle animal-like action beside a large, clearly recognizable real living animal photograph; never use a plush, toy, cartoon, illustrated, or CGI animal",
    accents: "leaf green, sunshine yellow, pale blue, and warm cream",
    icons: "small animal footprints, leaves, and matching nature symbols"
  },
  daily: {
    coverScene: "the baby in a cheerful everyday moment, surrounded by six clearly separated daily-routine objects floating on a white page",
    cardScene: "the baby doing the requested daily routine in its own specific, safe, natural action and suitable clothing; show only a few clearly separated matching objects and no realistic room scene",
    accents: "soft pastel blue, peach, butter yellow, and warm cream",
    icons: "small daily-routine objects and gentle action marks"
  }
};
const DEFAULT_DRAW_CARD_WEIGHT = 100;
const SUBJECT_PERSON = "person";
const SUBJECT_PET = "pet";
const SUBJECT_MIXED = "mixed";
const SUBJECT_OTHER = "other";
const SUBJECT_UNKNOWN = "unknown";
const SUBJECT_BOTH = "both";
const VISIT_SESSION_TIMEOUT_MS = 90 * 1000;
const ADMIN_VISITOR_RECORD_LIMIT = 50;
const PUBLIC_EXPERIENCE_CONFIGS = {
  "draw-card": {
    experienceType: "draw-card",
    label: "抽卡",
    styleGroupName: DRAW_CARD_GROUP_NAME,
    waitingMessage: DRAW_CARD_WAITING_MESSAGE,
    successMessage: DRAW_CARD_SUCCESS_MESSAGE,
    failureMessage: DRAW_CARD_FAILURE_MESSAGE,
    partialMessage: DRAW_CARD_PARTIAL_MESSAGE,
    unavailableMessage: "抽卡暂时不可用，请稍后再试。",
    missingSessionMessage: "本次抽卡记录不存在或已失效。",
    latestMissingMessage: "当前没有可恢复的抽卡进度。",
    readFailureMessage: "读取抽卡状态失败，请稍后再试。",
    restoreFailureMessage: "恢复抽卡进度失败，请稍后再试。",
    runningLimitMessage: "当前已有进行中的抽卡，请等待这一轮完成。",
    promptSuffix: ""
  },
  "fridge-magnet": {
    experienceType: "fridge-magnet",
    label: "冰箱贴",
    styleGroupName: FRIDGE_MAGNET_GROUP_NAME,
    waitingMessage: "美图正在制作，无需保持当前页面开启，可切到后台，稍后回来查看结果。",
    successMessage: "冰箱贴结果已准备好。",
    failureMessage: "这一轮冰箱贴未能顺利完成，请重新开始。",
    partialMessage: "部分冰箱贴已准备好，本轮未扣次数。",
    unavailableMessage: "冰箱贴暂时不可用，请稍后再试。",
    missingSessionMessage: "本次冰箱贴记录不存在或已失效。",
    latestMissingMessage: "当前没有可恢复的冰箱贴进度。",
    readFailureMessage: "读取冰箱贴状态失败，请稍后再试。",
    restoreFailureMessage: "恢复冰箱贴进度失败，请稍后再试。",
    runningLimitMessage: "当前已有进行中的冰箱贴，请等待这一轮完成。",
    promptSuffix: ""
  },
  "body-book": {
    experienceType: "body-book",
    label: "宝宝身体认知书",
    styleGroupName: "",
    waitingMessage: "正在制作宝宝身体认知书。",
    successMessage: "宝宝身体认知书已准备好。",
    failureMessage: "认知书图片生成失败，请重试。",
    partialMessage: "部分认知卡已准备好。",
    unavailableMessage: "宝宝身体认知书暂时不可用，请稍后再试。",
    missingSessionMessage: "这本认知书记录不存在或已失效。",
    latestMissingMessage: "当前没有可恢复的认知书进度。",
    readFailureMessage: "读取认知书状态失败，请稍后再试。",
    restoreFailureMessage: "恢复认知书进度失败，请稍后再试。",
    runningLimitMessage: "当前已有一本正在制作的认知书，请等待完成。",
    promptSuffix: ""
  }
};
const UPLOAD_FILE_LIMIT_BYTES = 40 * 1024 * 1024;

let sharpModulePromise;
const visitorRequestLog = new Map();
const ipRequestLog = new Map();
const orderStore = createOrderStore({ dbPath: orderDbPath });
const commerceStore = createCommerceStore({ dbPath: orderDbPath });
commerceStore.releaseCompletedReferralPayments();
const merchantStore = createMerchantStore({ filePath: merchantDataPath });

const app = express();
const port = Number(process.env.PORT || 3000);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_FILE_LIMIT_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
    const ok = allowed.has(file.mimetype);
    cb(ok ? null : new Error("UNSUPPORTED_IMAGE_TYPE"), ok);
  }
});
const activeImageJobs = new Map();
const drawCardSessionSyncLocks = new Map();
const bodyBookSessionSyncLocks = new Map();
const orderOriginalBundleBuilds = new Map();
const ORDER_ORIGINAL_BUNDLE_VERSION = "zip-v3-back-cover";
const COLOR_BOOK_PRINT_BLEED_RATIO = 0.035;
const COLOR_BOOK_PRINT_BUNDLE_VERSION = "color-bleed-v1";

function nowMs() {
  return Date.now();
}

function elapsedMs(startMs) {
  return Math.max(0, Math.round(nowMs() - Number(startMs || 0)));
}

function normalizeTelemetryNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTelemetryText(value, maxLength = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}…` : text;
}

function toTelemetryProvider(provider) {
  if (!provider || typeof provider !== "object") return null;
  const id = String(provider.id || "").trim();
  const name = String(provider.name || "").trim();
  const model = String(provider.model || "").trim();
  if (!id && !name && !model) return null;
  return { id, name, model };
}

function toTelemetryProviderList(providers) {
  return Array.isArray(providers) ? providers.map((provider) => toTelemetryProvider(provider)).filter(Boolean) : [];
}

function toTelemetryProviderAttempts(attempts) {
  return Array.isArray(attempts)
    ? attempts
        .map((attempt) => {
          const provider = toTelemetryProvider(attempt?.provider || attempt);
          const status = String(attempt?.status || "").trim().toLowerCase();
          if (!provider && !status) return null;
          return {
            provider,
            endpoint: String(attempt?.endpoint || "").trim(),
            status: status || "failed",
            durationMs: normalizeTelemetryNumber(attempt?.durationMs),
            statusCode: normalizeTelemetryNumber(attempt?.statusCode),
            message: normalizeTelemetryText(attempt?.message, 180)
          };
        })
        .filter(Boolean)
    : [];
}

function summarizeDrawCardJobStatuses(items) {
  const summary = {
    total: Array.isArray(items) ? items.length : 0,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0
  };
  (items || []).forEach((item) => {
    const status = String(item?.status || "queued");
    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    }
  });
  return summary;
}

function logDrawCardTelemetry(event, fields = {}) {
  const payload = {
    type: "draw_card_telemetry",
    event: String(event || ""),
    at: new Date().toISOString()
  };

  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined) return;
    payload[key] = value;
  });

  console.log(JSON.stringify(payload));
}

function beginDrawCardRequestTelemetry(req, _res, next) {
  req.drawCardRequestStartedAtMs = nowMs();
  req.drawCardTraceId = String(req.get("x-draw-trace-id") || "").trim() || randomUUID();
  logDrawCardTelemetry("request_arrived", {
    traceId: req.drawCardTraceId,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip || ""
  });
  next();
}

function parseDrawCardClientMetrics(body) {
  const safeBody = body && typeof body === "object" ? body : {};
  const wasCompressedRaw = String(safeBody.clientWasCompressed || "").trim().toLowerCase();
  return {
    prepareReferenceMs: normalizeTelemetryNumber(safeBody.clientPrepareReferenceMs),
    originalBytes: normalizeTelemetryNumber(safeBody.clientOriginalFileBytes),
    uploadedBytes: normalizeTelemetryNumber(safeBody.clientUploadedFileBytes),
    originalWidth: normalizeTelemetryNumber(safeBody.clientOriginalWidth),
    originalHeight: normalizeTelemetryNumber(safeBody.clientOriginalHeight),
    uploadedWidth: normalizeTelemetryNumber(safeBody.clientUploadedWidth),
    uploadedHeight: normalizeTelemetryNumber(safeBody.clientUploadedHeight),
    wasCompressed: ["1", "true", "yes"].includes(wasCompressedRaw)
  };
}

function parseSelectedStyleIds(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index);
  }

  const raw = String(value || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parseSelectedStyleIds(parsed);
    }
  } catch {}

  return raw
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeDrawCardCount(value, fallback = DRAW_CARD_DEFAULT_STYLE_COUNT) {
  const next = Math.round(Number(value));
  const safeFallback = Math.min(Math.max(Math.round(Number(fallback) || DRAW_CARD_DEFAULT_STYLE_COUNT), DRAW_CARD_MIN_STYLE_COUNT), DRAW_CARD_MAX_STYLE_COUNT);
  if (!Number.isFinite(next)) return safeFallback;
  return Math.min(Math.max(next, DRAW_CARD_MIN_STYLE_COUNT), DRAW_CARD_MAX_STYLE_COUNT);
}

function normalizeUserSelectedSubject(value) {
  const raw = String(value || "").trim().toLowerCase();
  const personValues = new Set(["person", "people", "human", "portrait", "人物", "人像", "仅人物"]);
  const petValues = new Set(["pet", "animal", "cat", "dog", "宠物", "动物", "猫", "狗", "仅宠物"]);
  const mixedValues = new Set(["mixed", "both", "person_and_pet", "pet_and_person", "person-pet", "人+宠", "人物宠物", "人和宠物"]);
  const otherValues = new Set(["other", "unknown", "unclear", "scene", "object", "其他", "其它", "不确定"]);

  if (personValues.has(raw)) return SUBJECT_PERSON;
  if (petValues.has(raw)) return SUBJECT_PET;
  if (mixedValues.has(raw)) return SUBJECT_MIXED;
  if (otherValues.has(raw)) return SUBJECT_OTHER;
  return "";
}

function normalizePublicExperienceType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PUBLIC_EXPERIENCE_CONFIGS[normalized] ? normalized : DEFAULT_PUBLIC_EXPERIENCE_TYPE;
}

function getPublicExperienceConfig(value) {
  return PUBLIC_EXPERIENCE_CONFIGS[normalizePublicExperienceType(value)];
}

function buildPublicExperiencePrompt(prompt, config) {
  const basePrompt = String(prompt || "").trim();
  const suffix = String(config?.promptSuffix || "").trim();
  if (!suffix) return basePrompt;
  if (!basePrompt) return suffix;
  return `${basePrompt}\n\n${suffix}`;
}

function clampConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return null;
  return Math.min(Math.max(confidence, 0), 1);
}

function normalizeDrawCardWeight(value) {
  const weight = Math.round(Number(value));
  if (!Number.isFinite(weight)) return DEFAULT_DRAW_CARD_WEIGHT;
  return Math.min(Math.max(weight, 0), 999999);
}

function normalizeDrawCardEnabled(value, fallback = true) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return Boolean(fallback);
}

function getConfiguredSubjectClassifierIds() {
  return getImageProviders()
    .map((provider) => provider.id)
    .filter((id, index, list) => list.indexOf(id) === index);
}

function readConfiguredSubjectClassifier(id) {
  const provider = getImageProviders().find((item) => item.id === id);
  if (!provider) return null;

  return {
    id,
    name: provider.name,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    model: provider.visionModel || DEFAULT_SUBJECT_CLASSIFIER_MODEL
  };
}

function readFallbackOpenAiSubjectClassifier() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!isUsableApiKey(apiKey)) return null;

  return {
    id: "openai",
    name: "OpenAI",
    apiKey,
    baseUrl: String(process.env.OPENAI_RESPONSES_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_SUBJECT_CLASSIFIER_BASE_URL).trim(),
    model: String(process.env.OPENAI_VISION_MODEL || DEFAULT_SUBJECT_CLASSIFIER_MODEL).trim() || DEFAULT_SUBJECT_CLASSIFIER_MODEL
  };
}

function getSubjectClassifierConfigs() {
  const classifiers = getConfiguredSubjectClassifierIds().map(readConfiguredSubjectClassifier).filter(Boolean);
  const openAiFallback = readFallbackOpenAiSubjectClassifier();
  if (openAiFallback && !classifiers.some((item) => item.id === openAiFallback.id)) {
    classifiers.push(openAiFallback);
  }
  return classifiers;
}

function getDefaultSubjectClassifierId(classifiers) {
  const configured = String(process.env.VISION_API_PROVIDER || process.env.IMAGE_API_PROVIDER || "").trim();
  if (configured && classifiers.some((classifier) => classifier.id === configured)) return configured;
  return classifiers[0]?.id || "";
}

function getSubjectClassifierChain(requestedId = "") {
  const classifiers = getSubjectClassifierConfigs();
  if (!classifiers.length) return [];

  const selectedId = String(requestedId || getDefaultSubjectClassifierId(classifiers)).trim();
  const selected = classifiers.find((classifier) => classifier.id === selectedId) || classifiers[0];
  return [selected]
    .concat(classifiers.filter((classifier) => classifier.id !== selected.id))
    .filter((classifier, index, list) => list.findIndex((item) => item.id === classifier.id) === index);
}

function normalizeDetectedSubject(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return SUBJECT_UNKNOWN;

  const personValues = new Set(["person", "people", "human", "portrait", "人物", "人像"]);
  const petValues = new Set(["pet", "animal", "cat", "dog", "宠物", "动物", "猫", "狗"]);
  const mixedValues = new Set(["mixed", "both", "person_and_pet", "pet_and_person", "组合", "混合"]);
  const otherValues = new Set(["other", "其他", "其它"]);
  const unknownValues = new Set(["unknown", "unclear", "不确定", "未知"]);

  if (personValues.has(raw)) return SUBJECT_PERSON;
  if (petValues.has(raw)) return SUBJECT_PET;
  if (mixedValues.has(raw)) return SUBJECT_MIXED;
  if (otherValues.has(raw)) return SUBJECT_OTHER;
  if (unknownValues.has(raw)) return SUBJECT_UNKNOWN;
  return SUBJECT_UNKNOWN;
}

function normalizeStyleSubjectType(value, fallbackStyle = null) {
  const raw = String(value || "").trim().toLowerCase();
  const personValues = new Set([SUBJECT_PERSON, "human", "人物", "人像"]);
  const petValues = new Set([SUBJECT_PET, "animal", "宠物", "动物"]);
  const bothValues = new Set([SUBJECT_BOTH, SUBJECT_MIXED, "all", "通用", "全部"]);

  if (personValues.has(raw)) return SUBJECT_PERSON;
  if (petValues.has(raw)) return SUBJECT_PET;
  if (bothValues.has(raw)) return SUBJECT_BOTH;
  if (fallbackStyle) return inferLegacyStyleSubjectType(fallbackStyle);
  return SUBJECT_BOTH;
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        parts.push(content.text.trim());
        continue;
      }
      if (typeof content?.output_text === "string" && content.output_text.trim()) {
        parts.push(content.output_text.trim());
        continue;
      }
      if (typeof content?.value === "string" && content.value.trim()) {
        parts.push(content.value.trim());
        continue;
      }
      if (typeof content?.text?.value === "string" && content.text.value.trim()) {
        parts.push(content.text.value.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

function parseSubjectClassificationResult(text) {
  const rawText = String(text || "").trim();
  if (!rawText) {
    return { subject: SUBJECT_UNKNOWN, confidence: null, raw: "" };
  }

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : rawText;

  try {
    const parsed = JSON.parse(candidate);
    const confidence = clampConfidence(parsed?.confidence);
    const subject = normalizeDetectedSubject(parsed?.subject);
    if (confidence !== null && confidence < SUBJECT_CLASSIFIER_CONFIDENCE_THRESHOLD) {
      return { subject: SUBJECT_UNKNOWN, confidence, raw: rawText };
    }
    return { subject, confidence, raw: rawText };
  } catch {
    return { subject: SUBJECT_UNKNOWN, confidence: null, raw: rawText };
  }
}

async function classifyUploadedSubject(file, options = {}) {
  const classifiers = getSubjectClassifierChain(options?.providerId);
  if (!classifiers.length || !file?.buffer?.length) {
    return {
      enabled: false,
      subject: SUBJECT_UNKNOWN,
      confidence: null,
      providerId: "",
      provider: "",
      model: "",
      reason: classifiers.length ? "missing_file" : "missing_config"
    };
  }

  const traceId = String(options?.traceId || "").trim();
  const base64Image = Buffer.from(file.buffer).toString("base64");

  for (const classifier of classifiers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUBJECT_CLASSIFIER_TIMEOUT_MS);
    const startedAtMs = nowMs();

    try {
      const response = await fetch(`${classifier.baseUrl.replace(/\/+$/, "")}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${classifier.apiKey}`
        },
        body: JSON.stringify({
          model: classifier.model,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: [
                    "判断这张上传图片的主体类别，只返回 JSON。",
                    '可选值: "person", "pet", "mixed", "unknown"。',
                    '返回格式: {"subject":"pet","confidence":0.98}。',
                    "规则：",
                    "1. 主体是人物时返回 person。",
                    "2. 主体是猫狗等宠物时返回 pet。",
                    "3. 人和宠物都明显时返回 mixed。",
                    "4. 无法可靠判断时返回 unknown。",
                    "5. confidence 取 0 到 1 之间的小数。"
                  ].join("\n")
                },
                {
                  type: "input_image",
                  image_url: `data:${file.mimetype || "image/jpeg"};base64,${base64Image}`
                }
              ]
            }
          ]
        }),
        signal: controller.signal
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          String(payload?.error?.message || payload?.message || "").trim() || `HTTP ${response.status}`;
        throw new Error(message);
      }

      const parsed = parseSubjectClassificationResult(extractResponseText(payload));
      const result = {
        enabled: true,
        subject: parsed.subject,
        confidence: parsed.confidence,
        providerId: classifier.id,
        provider: classifier.name,
        model: classifier.model,
        durationMs: elapsedMs(startedAtMs),
        reason: "classified"
      };

      logDrawCardTelemetry("subject_classification_succeeded", {
        traceId,
        providerId: result.providerId,
        subject: result.subject,
        confidence: result.confidence,
        provider: result.provider,
        model: result.model,
        classificationMs: result.durationMs
      });

      return result;
    } catch (error) {
      logDrawCardTelemetry("subject_classification_failed", {
        traceId,
        providerId: classifier.id,
        provider: classifier.name,
        model: classifier.model,
        classificationMs: elapsedMs(startedAtMs),
        message: error?.name === "AbortError" ? "timeout" : String(error?.message || "unknown_error")
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    enabled: true,
    subject: SUBJECT_UNKNOWN,
    confidence: null,
    providerId: classifiers[0]?.id || "",
    provider: classifiers[0]?.name || "",
    model: classifiers[0]?.model || "",
    reason: "all_failed"
  };
}

function inferLegacyStyleSubjectType(style) {
  const text = `${normalizeTags(style?.tags).join(" ")} ${String(style?.prompt || "")}`.toLowerCase();
  const personKeywords = ["人物", "人像", "真人", "五官", "穿搭", "person", "human", "people"];
  const petKeywords = ["宠物", "猫", "狗", "毛发", "pet", "animal", "cat", "dog"];
  const hasPerson = personKeywords.some((keyword) => text.includes(keyword));
  const hasPet = petKeywords.some((keyword) => text.includes(keyword));

  if (hasPerson && hasPet) return SUBJECT_BOTH;
  if (hasPerson) return SUBJECT_PERSON;
  if (hasPet) return SUBJECT_PET;
  return SUBJECT_BOTH;
}

function supportsDetectedSubject(style, subject) {
  const styleSubject = normalizeStyleSubjectType(style?.subjectType, style);
  if (subject === SUBJECT_PERSON) return styleSubject === SUBJECT_PERSON || styleSubject === SUBJECT_BOTH;
  if (subject === SUBJECT_PET) return styleSubject === SUBJECT_PET || styleSubject === SUBJECT_BOTH;
  if (subject === SUBJECT_MIXED) return styleSubject === SUBJECT_BOTH;
  if (subject === SUBJECT_OTHER) return styleSubject === SUBJECT_BOTH;
  return true;
}

function selectStylesForDetectedSubject(styles, subject) {
  if (!Array.isArray(styles) || !styles.length || !subject || subject === SUBJECT_UNKNOWN) {
    return Array.isArray(styles) ? styles.slice() : [];
  }

  const matched = styles.filter((style) => supportsDetectedSubject(style, subject));
  return matched.length ? matched : styles.slice();
}

function selectStylesForUserSubject(styles, subject) {
  if (!Array.isArray(styles) || !styles.length) return [];
  const safeSubject = normalizeUserSelectedSubject(subject);
  if (!safeSubject) return [];
  return styles.filter((style) => supportsDetectedSubject(style, safeSubject));
}

function filterDrawCardEligibleStyles(styles) {
  return Array.isArray(styles)
    ? styles.filter((style) => normalizeDrawCardEnabled(style?.drawCardEnabled, true))
    : [];
}

function sampleWeightedStyles(styles, count) {
  const limit = Math.max(0, Number(count || 0));
  if (!limit) return [];
  if (!Array.isArray(styles) || styles.length <= limit) return Array.isArray(styles) ? styles.slice() : [];

  const remaining = styles.slice();
  const selected = [];

  while (remaining.length && selected.length < limit) {
    const totalWeight = remaining.reduce((sum, style) => sum + Math.max(0, normalizeDrawCardWeight(style?.drawCardWeight)), 0);
    let chosenIndex = 0;

    if (totalWeight <= 0) {
      chosenIndex = Math.floor(Math.random() * remaining.length);
    } else {
      let threshold = Math.random() * totalWeight;
      chosenIndex = remaining.findIndex((style) => {
        threshold -= Math.max(0, normalizeDrawCardWeight(style?.drawCardWeight));
        return threshold < 0;
      });
      if (chosenIndex < 0) chosenIndex = remaining.length - 1;
    }

    selected.push(remaining[chosenIndex]);
    remaining.splice(chosenIndex, 1);
  }

  return selected;
}

const jsonBodyParser = express.json({ limit: "1mb" });
app.use((req, res, next) => {
  if (req.path === "/api/payments/wechat/notify") return next();
  return jsonBodyParser(req, res, next);
});
app.use(visitorSessionMiddleware);
app.use(webAccountSessionMiddleware);
app.use(userSessionMiddleware);
app.use(adminSessionMiddleware);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "prompt-gallery" });
});

app.get("/api/account", (req, res) => {
  res.json({
    authenticated: Boolean(req.userSession),
    account: toPublicCommerceAccount(req.webAccount)
  });
});

app.get("/api/public/account-avatars/:accountId", async (req, res, next) => {
  try {
    const account = commerceStore.readAccount(String(req.params.accountId || "").trim());
    const avatarUrl = String(account?.wechatAvatarUrl || "").trim();
    if (!account || !isTrustedWechatAvatarUrl(avatarUrl)) {
      throw createHttpError(404, "微信头像不存在。");
    }

    const avatar = await fetchTrustedWechatAvatar(avatarUrl);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(avatar.contentType).send(avatar.bytes);
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireWebAccount, (req, res) => {
  res.json({ authenticated: Boolean(req.userSession), account: toPublicCommerceAccount(req.webAccount) });
});

app.get("/api/auth/wechat/authorize", (req, res, next) => {
  try {
    if (!isWechatBrowser(req)) throw createHttpError(400, "请在微信内置浏览器中使用微信登录。", "请在微信内打开后再使用微信登录。");
    const authorizationUrl = createWebWechatAuthorizationUrl(req, req.query?.returnTo);
    if (!authorizationUrl) {
      throw createHttpError(503, "微信网页登录未完成配置。", "微信登录暂未配置完成，请使用邮箱登录。");
    }
    const state = new URL(authorizationUrl).searchParams.get("state") || "";
    setWechatOAuthStateCookie(req, res, state);
    res.redirect(302, authorizationUrl);
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/wechat/callback", async (req, res, next) => {
  try {
    const receivedState = String(req.query?.state || "");
    const expectedState = String(parseCookies(req)[WEB_WECHAT_OAUTH_STATE_COOKIE_NAME] || "");
    clearWechatOAuthStateCookie(req, res);
    if (!expectedState || !safeCompareString(expectedState, receivedState)) {
      throw createHttpError(400, "微信授权状态无效，请重新发起登录。", "微信登录已失效，请重新发起。");
    }
    const state = verifyWebWechatOAuthState(receivedState);
    const code = String(req.query?.code || "").trim();
    if (!code) throw createHttpError(400, "微信授权未返回 code。", "微信登录未完成，请重试。");
    const profile = await fetchWechatWebUserProfile(code);
    const guestAccountId = req.webAccount && !req.webAccount.isRegistered ? req.webAccount.id : "";
    const account = commerceStore.createOrGetWebAccount({
      openId: profile.openId,
      visitorId: req.visitorId,
      guestAccountId,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      signupCredits: WEB_SIGNUP_CREDITS,
      signupBeans: WEB_SIGNUP_BEANS
    });
    if (account.accountStatus === "disabled") throw createHttpError(403, "该账户已被禁用，请联系管理员。");
    commerceStore.markReferralRegistered(account.id);
    const session = commerceStore.createUserSession(account.id, { ttlMs: USER_SESSION_TTL_MS });
    clearWebAccountCookie(req, res);
    setUserSessionCookie(req, res, session.id);
    res.redirect(302, state.returnTo);
  } catch (error) {
    next(error);
  }
});

app.post("/api/referrals/link", requireWebAccount, (req, res, next) => {
  try {
    assertRegisteredAccount(req);
    const referral = commerceStore.getOrCreateReferralLink(req.webAccount.id);
    const inviteUrl = new URL(req.body?.target === "draw-card" ? "/" : "/book", getRequestOrigin(req));
    inviteUrl.searchParams.set("invite", referral.token);
    res.json({ inviteUrl: inviteUrl.toString() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/referrals/me", requireWebAccount, (req, res, next) => {
  try {
    assertRegisteredAccount(req);
    const referral = commerceStore.getOrCreateReferralLink(req.webAccount.id);
    const inviteUrl = new URL("/book", getRequestOrigin(req));
    inviteUrl.searchParams.set("invite", referral.token);
    res.json({
      inviteUrl: inviteUrl.toString(),
      ...commerceStore.getReferralSummary(req.webAccount.id)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/referrals/capture", requireWebAccount, (req, res, next) => {
  try {
    const result = commerceStore.captureReferral({
      token: String(req.body?.token || ""),
      inviteeAccountId: req.webAccount.id
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/email-code", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const purpose = String(req.body?.purpose || "register").trim();
    if (!email) throw createHttpError(400, "请输入正确的邮箱地址。");
    if (!new Set(["register", "reset_password"]).has(purpose)) throw createHttpError(400, "验证码用途无效。");
    const existing = commerceStore.readAccountByEmail(email);
    if (purpose === "register" && existing?.isRegistered) throw createHttpError(409, "该邮箱已注册，请直接登录。");
    if (purpose === "reset_password" && !existing?.isRegistered) throw createHttpError(404, "该邮箱尚未注册。");
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString();
    commerceStore.createEmailVerification({
      email,
      purpose,
      codeHash: hashEmailVerificationCode({ email, purpose, code }),
      expiresAt
    });
    await sendEmailVerificationCode({ email, code, purpose });
    res.status(201).json({ ok: true, expiresAt, resendAfterSeconds: 60, ...(isEmailCodeLogOnly() ? { developmentCode: code } : {}) });
  } catch (error) {
    next(await toLoggedAuthHttpError("email-code", error));
  }
});

app.post("/api/auth/register", requireWebAccount, async (req, res, next) => {
  try {
    if (req.webAccount.isRegistered) throw createHttpError(409, "当前账户已完成注册。");
    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    const code = String(req.body?.code || "").trim();
    if (!email || !username || !isValidPassword(password) || !/^\d{6}$/.test(code)) throw createHttpError(400, "请填写完整且有效的注册信息。");
    commerceStore.consumeEmailVerification({
      email,
      purpose: "register",
      matchesCodeHash: (stored) => safeCompareString(stored, hashEmailVerificationCode({ email, purpose: "register", code }))
    });
    const account = commerceStore.upgradeGuestAccount({ accountId: req.webAccount.id, email, username, passwordHash: hashPassword(password) });
    commerceStore.markReferralRegistered(account.id);
    await migrateGuestAssetsToRegisteredAccount({ accountId: account.id, visitorId: req.visitorId });
    const session = commerceStore.createUserSession(account.id, { ttlMs: USER_SESSION_TTL_MS });
    req.webAccount = account;
    req.userSession = { ...session, account };
    clearWebAccountCookie(req, res);
    setUserSessionCookie(req, res, session.id);
    res.status(201).json({ authenticated: true, account: toPublicCommerceAccount(account) });
  } catch (error) {
    next(await toLoggedAuthHttpError("register", error));
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const guestAccount = req.webAccount?.isRegistered ? null : req.webAccount;
    const account = commerceStore.readAccountByEmail(email);
    if (!account?.isRegistered || !verifyPassword(password, account.passwordHash)) throw createHttpError(401, "邮箱或密码不正确。");
    if (account.accountStatus === "disabled") throw createHttpError(403, "该账户已被禁用，请联系管理员。");
    commerceStore.linkVisitor(account.id, req.visitorId);
    const loggedInAccount = commerceStore.recordAccountLogin(account.id);
    // A body-book project is the user's ongoing work, not optional clip content.
    // Keep it with the account whenever this browser guest logs into an existing user.
    const linkedVisitorIds = [...new Set([req.visitorId, ...commerceStore.listVisitorIds(loggedInAccount.id)])];
    for (const visitorId of linkedVisitorIds) {
      await mergeGuestAssetsIntoAccount({
        account: loggedInAccount,
        visitorId,
        mergeClip: false,
        mergeBodyBooks: true
      });
    }
    const session = commerceStore.createUserSession(account.id, { ttlMs: USER_SESSION_TTL_MS });
    req.webAccount = loggedInAccount;
    req.userSession = { ...session, account: loggedInAccount };
    clearWebAccountCookie(req, res);
    setUserSessionCookie(req, res, session.id);
    const mergeableAssets = await getMergeableGuestAssets({ guestAccount, visitorId: req.visitorId });
    res.json({ authenticated: true, account: toPublicCommerceAccount(loggedInAccount), mergeableAssets });
  } catch (error) {
    next(await toLoggedAuthHttpError("login", error));
  }
});

app.post("/api/auth/miniprogram/login", async (req, res, next) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) throw createHttpError(400, "缺少小程序登录凭证，请重试。");
    const identity = await fetchWechatMiniProgramIdentity(code);
    const nickname = String(req.body?.nickname || "").trim();
    const requestedAvatarUrl = String(req.body?.avatarUrl || "").trim();
    const avatarUrl = isTrustedWechatAvatarUrl(requestedAvatarUrl) ? requestedAvatarUrl : "";
    const existingAccount = commerceStore.readAccountByOpenId(identity.openId);
    const account = commerceStore.createOrGetWebAccount({
      openId: identity.openId,
      visitorId: req.visitorId,
      guestAccountId: "",
      nickname,
      avatarUrl,
      signupCredits: WEB_SIGNUP_CREDITS,
      signupBeans: WEB_SIGNUP_BEANS
    });
    if (account.accountStatus === "disabled") throw createHttpError(403, "该账户已被禁用，请联系管理员。");
    const inviteToken = String(req.body?.invite || "").trim();
    if (!existingAccount && inviteToken) {
      commerceStore.captureReferral({
        token: inviteToken,
        inviteeAccountId: account.id,
        allowRegistered: true
      });
    }
    commerceStore.markReferralRegistered(account.id);
    const session = commerceStore.createUserSession(account.id, { ttlMs: USER_SESSION_TTL_MS });
    req.webAccount = account;
    req.userSession = { ...session, account };
    clearWebAccountCookie(req, res);
    setUserSessionCookie(req, res, session.id);
    res.json({ authenticated: true, account: toPublicCommerceAccount(account) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/miniprogram/profile", requireWebAccount, upload.single("avatar"), async (req, res, next) => {
  try {
    assertRegisteredAccount(req);
    const nickname = String(req.body?.nickname || "").trim();
    const avatar = req.file;
    const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!nickname) throw createHttpError(400, "请填写昵称。");
    const useDefaultAvatar = String(req.body?.useDefaultAvatar || "").toLowerCase() === "true";
    const keepExistingAvatar = String(req.body?.keepExistingAvatar || "").toLowerCase() === "true";
    if (!avatar && !useDefaultAvatar && !keepExistingAvatar) {
      throw createHttpError(400, "请选择头像或使用默认头像。");
    }
    if (avatar && !allowedAvatarTypes.has(String(avatar.mimetype || ""))) {
      throw createHttpError(400, "请选择 JPG、PNG 或 WebP 格式的头像。");
    }
    if (avatar && avatar.size > 3 * 1024 * 1024) throw createHttpError(400, "头像请控制在 3MB 以内。");

    let avatarUrl = keepExistingAvatar ? String(req.webAccount.wechatAvatarUrl || "") : "/account-avatars/default-avatar.svg";
    if (!avatarUrl) avatarUrl = "/account-avatars/default-avatar.svg";
    if (avatar) {
      const filename = `${randomUUID()}.${extensionForMime(avatar.mimetype)}`;
      await mkdir(accountAvatarPublicRoot, { recursive: true });
      await writeFile(path.join(accountAvatarPublicRoot, filename), avatar.buffer);
      avatarUrl = `/account-avatars/${filename}`;
    }
    const account = commerceStore.updateWechatProfile(req.webAccount.id, {
      nickname,
      avatarUrl
    });
    req.webAccount = account;
    res.json({ account: toPublicCommerceAccount(account) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/guest-assets/merge", requireWebAccount, async (req, res, next) => {
  try {
    if (!req.userSession || !req.webAccount?.isRegistered) throw createHttpError(401, "请先登录注册账户。", "请先登录后再合并访客资产。");
    const result = await mergeGuestAssetsIntoAccount({
      account: req.webAccount,
      visitorId: req.visitorId,
      mergeClip: req.body?.mergeClip === true,
      mergeBodyBooks: req.body?.mergeBodyBooks === true
    });
    res.json({ ok: true, ...result, account: toPublicCommerceAccount(req.webAccount) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (req, res) => {
  const sessionId = parseCookies(req)[USER_SESSION_COOKIE_NAME];
  if (sessionId) commerceStore.deleteUserSession(sessionId);
  clearUserSessionCookie(req, res);
  clearWebAccountCookie(req, res);
  res.status(204).end();
});

app.post("/api/auth/password-reset", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const code = String(req.body?.code || "").trim();
    if (!email || !isValidPassword(password) || !/^\d{6}$/.test(code)) throw createHttpError(400, "请填写完整且有效的信息。");
    const account = commerceStore.readAccountByEmail(email);
    if (!account?.isRegistered) throw createHttpError(404, "该邮箱尚未注册。");
    commerceStore.consumeEmailVerification({
      email,
      purpose: "reset_password",
      matchesCodeHash: (stored) => safeCompareString(stored, hashEmailVerificationCode({ email, purpose: "reset_password", code }))
    });
    commerceStore.updateAccountPassword(account.id, hashPassword(password));
    res.json({ ok: true });
  } catch (error) {
    next(await toLoggedAuthHttpError("password-reset", error));
  }
});

app.get("/api/payments/wechat/oauth-callback", async (req, res, next) => {
  try {
    const state = verifyOrderPaymentOAuthState(req.query?.state);
    const code = String(req.query?.code || "").trim();
    if (!code) throw createHttpError(400, "微信授权未返回 code。", "微信授权未完成，请返回后重试。");
    if (state.intentId) {
      const intent = commerceStore.readPaymentIntent(state.intentId);
      if (!intent || !["bean_purchase", "coin_purchase"].includes(intent.kind) || intent.accountId !== state.accountId) {
        throw createHttpError(404, "购买单不存在或已失效。", "购买单已失效，请返回后重试。");
      }
      const returnPath = intent.kind === "coin_purchase"
        ? `/?coinPurchaseId=${encodeURIComponent(intent.id)}&coinPayCode=${encodeURIComponent(code)}`
        : `/book?beanPurchaseId=${encodeURIComponent(intent.id)}&beanPayCode=${encodeURIComponent(code)}`;
      res.redirect(302, returnPath);
      return;
    }
    const order = orderStore.readOrder(state.orderId);
    if (!order || order.accountId !== state.accountId) throw createHttpError(404, "订单不存在或已失效。", "订单已失效，请返回订单页重试。");
    const prefix = order.experienceType === "body-book" ? "/book/orders" : "/fridge/orders";
    const returnPath = `${prefix}/${encodeURIComponent(order.id)}`;
    res.redirect(302, `${returnPath}?payCode=${encodeURIComponent(code)}`);
  } catch (error) {
    next(error);
  }
});

app.get("/api/visitor-state", async (req, res) => {
  try {
    res.json(toPublicWebAccountState(req, req.webAccount));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取访客状态失败，请稍后再试。" });
  }
});

app.get("/api/public/draw-card-styles", async (_req, res) => {
  try {
    const styles = filterDrawCardEligibleStyles(await readStyles());
    res.json({
      styles: styles.map(toPublicDrawCardStyle)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取抽卡风格失败，请稍后再试。" });
  }
});

app.post("/api/public/merchant-source/claim", async (req, res) => {
  try {
    const result = await claimMerchantSourceForVisitor(req, req.body?.mid || req.body?.merchantId, req.body?.sig || req.body?.signature);
    const activeSource = getActiveVisitorMerchantSource(result.visitor);
    res.json({
      sourceMerchantId: activeSource?.sourceMerchantId || "",
      sourceMerchantName: activeSource?.sourceMerchantName || "",
      claimedNow: result.claimedNow === true,
      expiresAt: activeSource?.sourceExpiresAt || null,
      locked: result.locked === true
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 400).json({ message: error.publicMessage || "锁定商户来源失败。" });
  }
});

app.post("/api/visit-sessions/report", async (req, res) => {
  try {
    const eventType = String(req.body?.eventType || "").trim().toLowerCase();
    if (!["enter", "heartbeat", "leave"].includes(eventType)) {
      return res.status(400).json({ message: "访问事件类型无效。" });
    }

    if (eventType === "enter") {
      await closeTimedOutVisitSessions();
      const visitor = await getVisitorState(req);
      const now = new Date().toISOString();
      const previousSessionId = visitor.activeVisitSessionId;
      if (previousSessionId && isSafeVisitSessionId(previousSessionId)) {
        const previousSession = await readVisitSession(previousSessionId);
        if (previousSession && previousSession.status === "active" && previousSession.visitorId === visitor.visitorId) {
          await finalizeVisitSession(previousSession, {
            status: "timed_out",
            endedAt: previousSession.lastHeartbeatAt || previousSession.startedAt || now,
            updatedAt: now
          });
        }
      }

      const activeSource = getActiveVisitorMerchantSource(visitor);
      const session = await saveVisitSession({
        sessionId: randomUUID(),
        visitorId: visitor.visitorId,
        experienceType: req.body?.experienceType,
        route: req.body?.route,
        browser: describeRequestBrowser(req),
        sourceMerchantId: activeSource?.sourceMerchantId || "",
        sourceMerchantName: activeSource?.sourceMerchantName || "",
        startedAt: now,
        lastHeartbeatAt: now,
        endedAt: null,
        durationSeconds: null,
        status: "active",
        createdAt: now,
        updatedAt: now
      });

      await saveVisitorState({
        ...visitor,
        lastActiveAt: now,
        activeVisitSessionId: session.sessionId,
        updatedAt: now
      });

      return res.json({ session: toPublicVisitSession(session) });
    }

    const currentSessionId = String(req.body?.currentSessionId || "").trim();
    if (!isSafeVisitSessionId(currentSessionId)) {
      return res.status(400).json({ message: "访问会话不存在。" });
    }

    const visitor = await getVisitorState(req);
    const currentSession = await readVisitSession(currentSessionId);
    if (!currentSession || currentSession.visitorId !== visitor.visitorId) {
      if (eventType === "leave") return res.json({ session: null });
      return res.status(404).json({ message: "访问会话不存在。" });
    }

    if (eventType === "heartbeat") {
      if (currentSession.status !== "active") {
        return res.json({ session: toPublicVisitSession(currentSession) });
      }
      const now = new Date().toISOString();
      const nextSession = await saveVisitSession({
        ...currentSession,
        lastHeartbeatAt: now,
        updatedAt: now
      });
      await saveVisitorState({
        ...visitor,
        lastActiveAt: now,
        activeVisitSessionId: nextSession.sessionId,
        updatedAt: now
      });
      return res.json({ session: toPublicVisitSession(nextSession) });
    }

    if (currentSession.status !== "active") {
      return res.json({ session: toPublicVisitSession(currentSession) });
    }

    const now = new Date().toISOString();
    const endedSession = await finalizeVisitSession(currentSession, {
      status: "ended",
      endedAt: now,
      updatedAt: now
    });
    return res.json({ session: toPublicVisitSession(endedSession) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "记录访问状态失败，请稍后再试。" });
  }
});

app.get("/q/:merchantId/:signature", async (req, res) => {
  const merchantId = normalizeMerchantId(req.params.merchantId);
  const signature = String(req.params.signature || "").trim();
  if (!merchantId || !signature) {
    return res.redirect(302, "/fridge");
  }
  const target = new URL("/fridge", "http://localhost");
  target.searchParams.set("mid", merchantId);
  target.searchParams.set("sig", signature);
  return res.redirect(302, `${target.pathname}${target.search}`);
});

app.get("/api/orders/config", async (_req, res) => {
  try {
    const settings = await readAppSettings();
    res.json(getOrderPricingSnapshot(settings));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取下单配置失败。" });
  }
});

async function redeemCodeHandler(req, res) {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) {
      return res.status(400).json({ message: "请输入兑换码。" });
    }

    const result = await redeemInviteCode(req, code);
    const coinResult = commerceStore.grantCredits({
      accountId: req.webAccount.id,
      amount: result.coinBonus,
      referenceType: "redemption_code",
      referenceId: code.toUpperCase(),
      reason: "redemption_bonus"
    });
    const beanResult = commerceStore.grantBeans({
      accountId: req.webAccount.id,
      amount: result.beanBonus,
      referenceType: "redemption_code",
      referenceId: code.toUpperCase(),
      reason: "redemption_bonus"
    });
    const entitlements = commerceStore.grantRedemptionEntitlements({
      accountId: req.webAccount.id,
      codeId: result.id,
      fridgeMagnetItemCount: result.fridgeMagnetItemCount,
      bodyBookPrintCount: result.bodyBookPrintCount
    });
    res.json({
      ...toPublicWebAccountState(req, beanResult.account || coinResult.account),
      redemptionCoins: result.coinBonus,
      redemptionBeans: result.beanBonus,
      redemptionEntitlements: entitlements
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 400).json({ message: error.publicMessage || "兑换码兑换失败，请稍后再试。" });
  }
}

app.post("/api/redemption-codes/redeem", requireWebAccount, redeemCodeHandler);
// Kept temporarily for clients that have not yet updated to the renamed API.
app.post("/api/invite-codes/redeem", requireWebAccount, redeemCodeHandler);

app.post("/api/orders", requireWebAccount, async (req, res, next) => {
  try {
    assertRegisteredAccount(req);
    enforcePublicRateLimits(req);
    orderStore.expireUnpaidOrders();

    const settings = await readAppSettings();
    const pricing = getOrderPricingSnapshot(settings);

    const requestedExperienceType = String(req.body?.experienceType || "fridge-magnet").trim().toLowerCase();
    if (requestedExperienceType === "body-book") {
      const created = await createBodyBookPhysicalOrder({ req, pricing });
      return res.status(201).json(created);
    }

    if (!pricing.enabled) throw createHttpError(403, "冰箱贴下单暂未开放。");

    const experienceType = normalizePublicExperienceType(requestedExperienceType);
    if (!new Set(["draw-card", "fridge-magnet"]).has(experienceType)) {
      throw createHttpError(400, "当前仅支持卡夹图片定制。");
    }

    const requestedItems = normalizeRequestedOrderItems(req.body || {});
    const jobIds = requestedItems.map((item) => item.jobId);
    if (!jobIds.length) throw createHttpError(400, "请先选择要定制的卡夹图片。");

    const address = normalizeOrderAddress(req.body || {});
    assertValidOrderAddress(address);

    const jobs = await Promise.all(jobIds.map((jobId) => readImageJob(jobId)));
    const likedJobs = jobs.filter(Boolean).filter((job) =>
      job.visibility === "public" &&
      accountOwnsPublicRecord(req.webAccount, job) &&
      job.isLiked &&
      normalizePublicExperienceType(job.experienceType) === experienceType
    );
    if (likedJobs.length !== jobIds.length) throw createHttpError(403, "只能下单当前卡夹中的图片。");

    const likedJobById = new Map(likedJobs.map((job) => [String(job.jobId || ""), job]));
    const totalRequestedItemCount = requestedItems.reduce((sum, item) => sum + item.quantity, 0);
    const amount = calculateOrderAmounts(totalRequestedItemCount, pricing);
    const redemptionEntitlements = commerceStore.getRedemptionEntitlementSummary(req.webAccount.id);
    const usesFridgeRedemption = redemptionEntitlements.fridgeMagnetItemCount >= amount.itemCount;
    const merchantSource = await resolveOrderMerchantSource(req);
    const now = new Date();
    const createdAt = now.toISOString();
    const paymentMode = normalizeOrderPaymentMode(pricing.paymentMode);
    const expiresAt = new Date(now.getTime() + getOrderExpireMs(pricing)).toISOString();
    const orderId = randomUUID();
    const storedOrderItems = await buildStoredOrderItems({
      orderId,
      requestedItems,
      likedJobById
    });
    const discountReservation = usesFridgeRedemption ? null : commerceStore.reserveFridgeCoinDiscount({
      accountId: req.webAccount.id,
      orderId,
      itemCount: amount.itemCount,
      subtotalCents: amount.subtotalCents,
      expiresAt
    });
    const coinDiscountCents = discountReservation?.discountCents || 0;
    const payableCents = usesFridgeRedemption ? 0 : Math.max(0, amount.totalCents - coinDiscountCents);
    if (usesFridgeRedemption) {
      try {
        commerceStore.consumeRedemptionEntitlement({
          accountId: req.webAccount.id,
          entitlementType: "fridge_magnet_item",
          quantity: amount.itemCount,
          referenceId: orderId
        });
      } catch (error) {
        throw createHttpError(409, error.message || "实体冰箱贴兑换权益不足。", "实体冰箱贴兑换权益不足，请先兑换或联系客服。");
      }
    }
    let created;
    try {
      created = orderStore.createOrder({
      order: {
        id: orderId,
        orderNo: generateOrderNo(),
        visitorId: req.visitorId,
        accountId: req.webAccount.id,
        publicToken: randomUUID(),
        experienceType,
        paymentStatus: usesFridgeRedemption ? "paid" : "unpaid",
        fulfillmentStatus: "new",
        itemCount: amount.itemCount,
        unitPriceCents: amount.unitPriceCents,
        shippingFeeCents: amount.shippingFeeCents,
        subtotalCents: amount.subtotalCents,
        totalCents: amount.totalCents,
        coinDiscountCents,
        payableCents,
        remark: address.remark,
        receiverName: address.receiverName,
        receiverPhone: address.receiverPhone,
        province: address.province,
        city: address.city,
        district: address.district,
        addressDetail: address.addressDetail,
        sourceMerchantId: merchantSource.sourceMerchantId,
        sourceMerchantName: merchantSource.sourceMerchantName,
        commissionRateBps: merchantSource.commissionRateBps,
        sourceClaimedAt: merchantSource.sourceClaimedAt,
        wechatOpenId: "",
        wechatTransactionId: usesFridgeRedemption ? `REDEMPTION-${orderId}` : "",
        outTradeNo: generateWechatOutTradeNo("FM"),
        lastPaymentChannel: usesFridgeRedemption ? "redemption_code" : (paymentMode === "manual" ? "manual_collection" : ""),
        lastPaymentError: "",
        expiresAt,
        paidAt: usesFridgeRedemption ? createdAt : null,
        createdAt,
        updatedAt: createdAt
      },
      items: storedOrderItems,
      initialPaymentEvent: {
        eventType: "order_created",
        eventId: `${orderId}:order_created`,
        success: true,
        payload: {
          itemCount: amount.itemCount,
          totalCents: amount.totalCents,
          coinDiscountCents,
          payableCents,
          paymentMode,
          sourceMerchantId: merchantSource.sourceMerchantId,
          commissionRateBps: merchantSource.commissionRateBps,
          usesFridgeRedemption
        }
      }
    });
    } catch (error) {
      if (usesFridgeRedemption) commerceStore.restoreRedemptionEntitlement({ accountId: req.webAccount.id, entitlementType: "fridge_magnet_item", referenceId: orderId });
      else commerceStore.releaseFridgeCoinDiscountReservation(orderId);
      throw error;
    }

    if (usesFridgeRedemption) {
      const paidOrder = orderStore.updateOrderAndAppendEvent(created.id, {}, {
        eventType: "redemption_entitlement_consumed",
        eventId: `redemption:${created.id}`,
        success: true,
        payload: { entitlementType: "fridge_magnet_item", quantity: amount.itemCount }
      });
      queueOrderOriginalImageBundle(paidOrder);
      return res.status(201).json({
        order: toPublicOrder(paidOrder, { includeToken: true }),
        payment: { status: "already_paid", mode: "redemption_code", expiresAt: created.expiresAt }
      });
    }

    const paymentIntent = commerceStore.createPaymentIntent({
      accountId: req.webAccount.id,
      outTradeNo: created.outTradeNo,
      kind: "physical_order",
      amountCents: created.payableCents,
      targetOrderId: created.id,
      expiresAt: created.expiresAt,
      metadata: { orderNo: created.orderNo, itemCount: created.itemCount, coinDiscountCents, payableCents }
    });
    if (created.payableCents === 0) {
      const paidAt = new Date().toISOString();
      commerceStore.settlePayment({
        outTradeNo: created.outTradeNo,
        transactionId: `COIN-DISCOUNT-${created.outTradeNo}`,
        paidAt,
        payload: { mode: "coin_discount", orderId: created.id, orderNo: created.orderNo },
        headers: {}
      });
      const paidOrder = orderStore.updateOrderAndAppendEvent(created.id, {
        paymentStatus: "paid",
        fulfillmentStatus: "new",
        lastPaymentChannel: "coin_discount",
        lastPaymentError: "",
        wechatTransactionId: `COIN-DISCOUNT-${created.outTradeNo}`,
        paidAt
      }, {
        eventType: "coin_discount_settled",
        eventId: `${created.id}:coin_discount_settled`,
        success: true,
        payload: { coinDiscountCents, payableCents: 0 }
      });
      queueOrderOriginalImageBundle(paidOrder);
      return res.status(201).json({
        order: toPublicOrder(paidOrder, { includeToken: true }),
        payment: { status: "already_paid", mode: "coin_discount", expiresAt: created.expiresAt }
      });
    }
    res.status(201).json({
      order: toPublicOrder(created, { includeToken: true }),
      payment: prepareInitialOrderPayment(created, pricing, paymentIntent)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders/:orderId/pay", requireWebAccount, async (req, res, next) => {
  try {
    assertRegisteredAccount(req);
    orderStore.expireUnpaidOrders();
    const order = orderStore.readOrderWithRelations(req.params.orderId);
    assertWebAccountOwnsOrder(req, order);
    if (order.paymentStatus === "paid") {
      return res.json({ order: toPublicOrder(order), payment: { status: "already_paid", returnUrl: buildOrderReturnUrl(req, order) } });
    }
    if (order.paymentStatus === "expired") throw createHttpError(409, "订单已过期，请重新下单。");
    if (order.paymentStatus !== "unpaid") throw createHttpError(409, "当前订单无法继续支付。");
    const settings = await readAppSettings();
    const pricing = getOrderPricingSnapshot(settings);
    const intent = commerceStore.readPaymentIntentByOutTradeNo(order.outTradeNo);
    if (!intent || intent.accountId !== order.accountId || intent.amountCents !== getOrderPayableCents(order)) {
      throw createHttpError(409, "订单支付单不存在或金额不匹配，请重新下单。");
    }
    const payment = await prepareOrderPayment({
      req,
      order,
      intent,
      pricing,
      oauthCode: String(req.body?.code || "").trim()
    });
    const updatedOrder = orderStore.readOrderWithRelations(order.id) || order;
    res.json({ order: toPublicOrder(updatedOrder), payment });
  } catch (error) {
    next(error);
  }
});

app.get("/api/orders/:orderId", requireWebAccount, async (req, res, next) => {
  try {
    orderStore.expireUnpaidOrders();
    const settings = await readAppSettings();
    const order = orderStore.readOrderWithRelations(req.params.orderId);
    assertWebAccountOwnsOrder(req, order);
    res.json({
      order: toPublicOrder(order),
      config: getOrderPricingSnapshot(settings)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/my/orders", requireWebAccount, async (req, res, next) => {
  try {
    orderStore.expireUnpaidOrders();
    const settings = await readAppSettings();
    const requestedScope = String(req.query?.scope || "").trim().toLowerCase();
    const experienceScope = new Set(["body-book", "fridge"]).has(requestedScope) ? requestedScope : "";
    const payload = orderStore.listOrders({
      accountId: req.webAccount.id,
      experienceScope,
      excludeUserDeleted: true,
      limit: 50
    });
    res.json({
      orders: (await Promise.all(payload.items.map(enrichBodyBookOrderThemeName))).map((order) => toPublicOrder(order)),
      config: getOrderPricingSnapshot(settings)
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/orders/:orderId", requireWebAccount, async (req, res, next) => {
  try {
    orderStore.expireUnpaidOrders();
    const order = orderStore.readOrderWithRelations(req.params.orderId);
    assertWebAccountOwnsOrder(req, order);
    if (order.paymentStatus === "paid") throw createHttpError(409, "已付款订单不支持取消。");
    const isUnpaidOrder = order.paymentStatus === "unpaid" || order.paymentStatus === "expired" || order.fulfillmentStatus === "cancelled";
    if (!isUnpaidOrder) throw createHttpError(409, "当前订单已进入处理流程，暂不支持删除。");

    if (order.paymentStatus === "unpaid") {
      if (order.experienceType === "body-book") commerceStore.releaseBodyBookDiscountReservation(order.id);
      else commerceStore.releaseFridgeCoinDiscountReservation(order.id);
      commerceStore.cancelPaymentIntentByOutTradeNo(order.outTradeNo);
    }
    const deleted = orderStore.updateOrder(order.id, {
      paymentStatus: order.paymentStatus === "unpaid" ? "expired" : order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus === "new" ? "cancelled" : order.fulfillmentStatus,
      cancelledAt: order.cancelledAt || new Date().toISOString(),
      lastPaymentError: order.lastPaymentError || "订单已删除",
      userDeletedAt: order.userDeletedAt || new Date().toISOString()
    });
    res.json({ order: toPublicOrder(deleted, { includeToken: true }) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/bean-purchases", requireWebAccount, async (req, res, next) => {
  try {
    assertRegisteredAccount(req);
    enforcePublicRateLimits(req);
    const beanCount = normalizeBeanPurchaseCount(req.body?.beanCount);
    const settings = await readAppSettings();
    const pricing = getOrderPricingSnapshot(settings);
    const now = new Date();
    const intent = commerceStore.createPaymentIntent({
      accountId: req.webAccount.id,
      outTradeNo: generateWechatOutTradeNo("BP"),
      kind: "bean_purchase",
      amountCents: beanCount * 100,
      creditAmount: beanCount,
      expiresAt: new Date(now.getTime() + getOrderExpireMs(pricing)).toISOString(),
      metadata: {
        purchaseNo: generateOrderNo(),
        beanCount,
        unitPriceCents: 100
      }
    });
    res.status(201).json({
      purchase: toPublicBeanPurchase(intent),
      payment: prepareInitialBeanPurchasePayment(intent, pricing)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bean-purchases", requireWebAccount, (req, res, next) => {
  try {
    const purchases = commerceStore.listPaymentIntents(req.webAccount.id, 100)
      .filter((intent) => intent.kind === "bean_purchase")
      .map(toPublicBeanPurchase);
    res.json({ purchases });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bean-purchases/:purchaseId", requireWebAccount, (req, res, next) => {
  try {
    const intent = commerceStore.readPaymentIntent(req.params.purchaseId);
    if (!intent || intent.kind !== "bean_purchase" || intent.accountId !== req.webAccount.id) {
      throw createHttpError(404, "豆豆购买单不存在。");
    }
    res.json({ purchase: toPublicBeanPurchase(intent) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/bean-purchases/:purchaseId/pay", requireWebAccount, async (req, res, next) => {
  try {
    assertRegisteredAccount(req);
    const intent = commerceStore.readPaymentIntent(req.params.purchaseId);
    if (!intent || intent.kind !== "bean_purchase" || intent.accountId !== req.webAccount.id) {
      throw createHttpError(404, "豆豆购买单不存在。");
    }
    if (intent.status === "paid") {
      return res.json({ purchase: toPublicBeanPurchase(intent), payment: { status: "already_paid", mode: "completed" } });
    }
    if (intent.status === "cancelled") throw createHttpError(409, "该购买单已取消，请重新购买。");
    if (intent.expiresAt && Date.parse(intent.expiresAt) <= Date.now()) {
      commerceStore.cancelPaymentIntentByOutTradeNo(intent.outTradeNo);
      throw createHttpError(409, "该购买单已过期，请重新购买。");
    }
    const settings = await readAppSettings();
    const pricing = getOrderPricingSnapshot(settings);
    const payment = await prepareBeanPurchasePayment({
      req,
      intent,
      pricing,
      oauthCode: String(req.body?.code || "").trim()
    });
    const latest = commerceStore.readPaymentIntent(intent.id) || intent;
    res.json({ purchase: toPublicBeanPurchase(latest), payment });
  } catch (error) {
    next(error);
  }
});

app.post("/api/coin-purchases", requireWebAccount, async (req, res, next) => {
  try {
    assertRegisteredAccount(req);
    enforcePublicRateLimits(req);
    const coinCount = normalizeCoinPurchaseCount(req.body?.coinCount);
    const settings = await readAppSettings();
    const pricing = getOrderPricingSnapshot(settings);
    const now = new Date();
    const intent = commerceStore.createPaymentIntent({
      accountId: req.webAccount.id,
      outTradeNo: generateWechatOutTradeNo("CP"),
      kind: "coin_purchase",
      amountCents: coinCount * 100,
      creditAmount: coinCount,
      expiresAt: new Date(now.getTime() + getOrderExpireMs(pricing)).toISOString(),
      metadata: { purchaseNo: generateOrderNo(), coinCount, unitPriceCents: 100 }
    });
    res.status(201).json({
      purchase: toPublicCoinPurchase(intent),
      payment: prepareInitialCoinPurchasePayment(intent, pricing)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/coin-purchases", requireWebAccount, (req, res, next) => {
  try {
    const purchases = commerceStore.listPaymentIntents(req.webAccount.id, 100, { excludeUserDeleted: true })
      .filter((intent) => intent.kind === "coin_purchase")
      .map(toPublicCoinPurchase);
    res.json({ purchases });
  } catch (error) {
    next(error);
  }
});

app.get("/api/coin-purchases/:purchaseId", requireWebAccount, (req, res, next) => {
  try {
    const intent = commerceStore.readPaymentIntent(req.params.purchaseId);
    if (!intent || intent.userDeletedAt || intent.kind !== "coin_purchase" || intent.accountId !== req.webAccount.id) {
      throw createHttpError(404, "币购买单不存在。");
    }
    res.json({ purchase: toPublicCoinPurchase(intent) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/coin-purchases/:purchaseId", requireWebAccount, (req, res, next) => {
  try {
    const intent = commerceStore.readPaymentIntent(req.params.purchaseId);
    if (!intent || intent.userDeletedAt || intent.kind !== "coin_purchase" || intent.accountId !== req.webAccount.id) {
      throw createHttpError(404, "币购买单不存在。");
    }
    if (intent.status === "paid") throw createHttpError(409, "已支付的购买币记录不支持删除。");
    commerceStore.cancelPaymentIntentByOutTradeNo(intent.outTradeNo);
    const deleted = commerceStore.hidePaymentIntentForUser(intent.id);
    res.json({ purchase: toPublicCoinPurchase(deleted) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/coin-purchases/:purchaseId/pay", requireWebAccount, async (req, res, next) => {
  try {
    assertRegisteredAccount(req);
    const intent = commerceStore.readPaymentIntent(req.params.purchaseId);
    if (!intent || intent.userDeletedAt || intent.kind !== "coin_purchase" || intent.accountId !== req.webAccount.id) {
      throw createHttpError(404, "币购买单不存在。");
    }
    if (intent.status === "paid") {
      return res.json({ purchase: toPublicCoinPurchase(intent), payment: { status: "already_paid", mode: "completed" } });
    }
    if (intent.status === "cancelled") throw createHttpError(409, "该购买单已取消，请重新购买。");
    if (intent.expiresAt && Date.parse(intent.expiresAt) <= Date.now()) {
      commerceStore.cancelPaymentIntentByOutTradeNo(intent.outTradeNo);
      throw createHttpError(409, "该购买单已过期，请重新购买。");
    }
    const settings = await readAppSettings();
    const pricing = getOrderPricingSnapshot(settings);
    const payment = await prepareCoinPurchasePayment({
      req,
      intent,
      pricing,
      oauthCode: String(req.body?.code || "").trim()
    });
    const latest = commerceStore.readPaymentIntent(intent.id) || intent;
    res.json({ purchase: toPublicCoinPurchase(latest), payment });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments/wechat/notify", express.text({ type: "*/*" }), async (req, res) => {
  try {
    const bodyText = String(req.body || "");
    verifyWechatNotifySignature(req, bodyText);
    const config = assertWechatPaymentConfigured();
    const payload = bodyText ? JSON.parse(bodyText) : {};
    const resource = payload.resource || {};
    const associatedData = String(resource.associated_data || "");
    const nonce = String(resource.nonce || "");
    const ciphertext = String(resource.ciphertext || "");
    if (!ciphertext || !nonce) throw createHttpError(400, "微信支付回调缺少加密数据。");

    const { createDecipheriv } = await import("node:crypto");
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(config.apiV3Key, "utf-8"), Buffer.from(nonce, "utf-8"));
    decipher.setAAD(Buffer.from(associatedData, "utf-8"));
    const encryptedBuffer = Buffer.from(ciphertext, "base64");
    const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
    const encrypted = encryptedBuffer.subarray(0, encryptedBuffer.length - 16);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
    const notifyData = JSON.parse(decrypted);

    if (String(notifyData.trade_state || "") !== "SUCCESS") {
      throw createHttpError(400, "微信支付通知交易状态不是成功。");
    }
    const acceptedAppIds = new Set([config.appId, getWechatMiniProgramPaymentConfig().appId].filter(Boolean));
    if (String(notifyData.mchid || "") !== config.mchId || !acceptedAppIds.has(String(notifyData.appid || ""))) {
      throw createHttpError(400, "微信支付通知商户信息不匹配。");
    }
    const outTradeNo = String(notifyData.out_trade_no || "");
    const intent = commerceStore.readPaymentIntentByOutTradeNo(outTradeNo);
    if (!intent) return res.status(404).json({ code: "ORDER_NOT_FOUND", message: "支付单不存在" });
    if (intent.status === "cancelled") {
      throw createHttpError(409, "支付单已取消，需要人工核对退款。");
    }
    if (Number(notifyData.amount?.total || -1) !== intent.amountCents || String(notifyData.amount?.currency || "CNY") !== "CNY") {
      throw createHttpError(400, "微信支付通知金额不匹配。");
    }
    const transactionId = String(notifyData.transaction_id || "");
    if (!transactionId) throw createHttpError(400, "微信支付通知缺少交易单号。");
    if (intent.status === "paid" && intent.transactionId && intent.transactionId !== transactionId) {
      throw createHttpError(409, "支付单已由其他微信交易完成。");
    }
    const headers = {
      serial: String(req.get("Wechatpay-Serial") || ""),
      nonce: String(req.get("Wechatpay-Nonce") || ""),
      signature: String(req.get("Wechatpay-Signature") || ""),
      timestamp: String(req.get("Wechatpay-Timestamp") || "")
    };
    if (["physical_order", "body_book_order"].includes(intent.kind)) {
      const order = orderStore.readOrderWithRelations(intent.targetOrderId);
      if (!order || order.accountId !== intent.accountId || getOrderPayableCents(order) !== intent.amountCents) {
        throw createHttpError(400, "实物订单与支付单不匹配。");
      }
      if (order.paymentStatus === "expired" || order.fulfillmentStatus === "cancelled") {
        throw createHttpError(409, "订单已失效，无法确认支付。");
      }
    }
    commerceStore.settlePayment({
      outTradeNo,
      transactionId,
      paidAt: String(notifyData.success_time || new Date().toISOString()),
      payload: notifyData,
      headers
    });
    if (["physical_order", "body_book_order"].includes(intent.kind)) {
      const order = orderStore.readOrderWithRelations(intent.targetOrderId);
      if (!order || order.accountId !== intent.accountId || getOrderPayableCents(order) !== intent.amountCents) {
        throw createHttpError(400, "实物订单与支付单不匹配。");
      }
      let paidOrder = order;
      if (order.paymentStatus !== "paid") {
        paidOrder = orderStore.updateOrderAndAppendEvent(order.id, {
          paymentStatus: "paid",
          lastPaymentError: "",
          wechatTransactionId: transactionId,
          paidAt: String(notifyData.success_time || new Date().toISOString())
        }, {
          eventType: "payment_notify",
          eventId: String(payload.id || transactionId),
          success: true,
          payload: notifyData,
          headers
        });
      }
      queueOrderOriginalImageBundle(paidOrder);
    }

    res.json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ code: "FAIL", message: error.publicMessage || "回调处理失败" });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    await verifyAdminCredentials(username, password);
    const session = await createAdminSession();
    setAdminCookie(req, res, session.sessionId);
    res.json({ ok: true, session: toPublicAdminSession(session) });
  } catch (error) {
    res.status(error.status || 401).json({ message: error.publicMessage || "登录失败。" });
  }
});

app.post("/api/admin/logout", async (req, res) => {
  try {
    if (req.adminSession?.sessionId) {
      await deleteAdminSession(req.adminSession.sessionId);
    }
    clearAdminCookie(req, res);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "退出登录失败。" });
  }
});

app.get("/api/admin/session", requireAdmin, async (req, res) => {
  res.json({ ok: true, session: toPublicAdminSession(req.adminSession) });
});

app.get("/api/admin/commerce/payments", requireAdmin, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query?.limit || 200), 1), 500);
  res.json({ payments: commerceStore.listAllPaymentIntents(limit).map(toPublicAdminPaymentIntent) });
});

app.get("/api/admin/commerce/credits", requireAdmin, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query?.limit || 200), 1), 500);
  res.json({ ledger: commerceStore.listAllCreditLedger(limit) });
});

app.get("/api/admin/commerce/beans", requireAdmin, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query?.limit || 200), 1), 500);
  res.json({ ledger: commerceStore.listAllBeanLedger(limit) });
});

app.get("/api/styles", requireAdmin, async (_req, res) => {
  res.json(await readStyles());
});

app.get("/api/style-groups", requireAdmin, async (_req, res) => {
  res.json(await readStyleGroups());
});

app.get("/api/image-providers", requireAdmin, async (_req, res) => {
  try {
    const providers = getImageProviders();
    const settings = await readAppSettings();
    res.json({
      defaultProvider: getDefaultProviderId(providers, settings),
      providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        model: provider.model
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取图片供应商失败。" });
  }
});

app.get("/api/admin/api-providers", requireAdmin, async (_req, res) => {
  try {
    res.json(await buildAdminApiProviderResponse());
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取 API 供应商配置失败。" });
  }
});

app.patch("/api/admin/api-providers/settings", requireAdmin, async (req, res) => {
  try {
    res.json(await saveAdminApiProviderSettings(req.body || {}));
  } catch (error) {
    console.error(error);
    res.status(error.status || 400).json({ message: error.publicMessage || "保存 API 全局配置失败。" });
  }
});

app.post("/api/admin/api-providers", requireAdmin, async (req, res) => {
  try {
    const provider = normalizeAdminApiProviderPayload(req.body);
    const existing = getAdminApiProviderConfigs().find((item) => item.id === provider.id) || null;
    const payload = await saveAdminApiProviderToEnv(provider, { appendToPriority: !existing });
    res.status(existing ? 200 : 201).json(payload);
  } catch (error) {
    console.error(error);
    res.status(error.status || 400).json({ message: error.publicMessage || "保存 API 供应商失败。" });
  }
});

app.put("/api/admin/api-providers/:providerId", requireAdmin, async (req, res) => {
  try {
    const providerId = normalizeApiProviderId(req.params.providerId);
    if (!providerId) {
      return res.status(400).json({ message: "供应商 ID 不能为空。" });
    }

    const provider = normalizeAdminApiProviderPayload(req.body, { providerId });
    res.json(await saveAdminApiProviderToEnv(provider, { appendToPriority: false }));
  } catch (error) {
    console.error(error);
    res.status(error.status || 400).json({ message: error.publicMessage || "更新 API 供应商失败。" });
  }
});

app.delete("/api/admin/api-providers/:providerId", requireAdmin, async (req, res) => {
  try {
    const providerId = normalizeApiProviderId(req.params.providerId);
    if (!providerId) {
      return res.status(400).json({ message: "供应商 ID 不能为空。" });
    }

    const storedProviders = await readStoredApiProviders();
    const storedIndex = storedProviders.findIndex((item) => item.id === providerId);
    const envProvider = getAdminApiProviderConfigs().find((item) => item.id === providerId) || null;

    if (!envProvider && storedIndex === -1) {
      return res.status(404).json({ message: "供应商不存在。" });
    }

    res.json(await deleteAdminApiProviderFromEnv(providerId));
  } catch (error) {
    console.error(error);
    res.status(error.status || 400).json({ message: error.publicMessage || "删除 API 供应商失败。" });
  }
});

app.post("/api/draw-card/sessions", requireWebAccount, beginDrawCardRequestTelemetry, upload.single("image"), async (req, res) => {
  return handleCreatePublicExperienceSession(req, res, "draw-card");
});

app.get("/api/draw-card/sessions/latest", requireWebAccount, async (req, res) => {
  return handleGetLatestPublicExperienceSession(req, res, "draw-card");
});

app.get("/api/draw-card/sessions/:sessionId/reference", requireWebAccount, async (req, res) => {
  return handleGetPublicExperienceSessionReference(req, res, "draw-card");
});

app.get("/api/draw-card/sessions/:sessionId", requireWebAccount, async (req, res) => {
  return handleGetPublicExperienceSession(req, res, "draw-card");
});

app.post("/api/fridge-magnet/sessions", requireWebAccount, beginDrawCardRequestTelemetry, upload.single("image"), async (req, res) => {
  return handleCreatePublicExperienceSession(req, res, "fridge-magnet");
});

app.get("/api/fridge-magnet/sessions/latest", requireWebAccount, async (req, res) => {
  return handleGetLatestPublicExperienceSession(req, res, "fridge-magnet");
});

app.get("/api/fridge-magnet/sessions/:sessionId", requireWebAccount, async (req, res) => {
  return handleGetPublicExperienceSession(req, res, "fridge-magnet");
});

app.get("/api/body-book/themes", requireWebAccount, (_req, res) => {
  // Do not pass the formatter directly to Array.map: its index argument would
  // otherwise be treated as a persisted layout version and expose legacy pages.
  res.json({ themes: BOOK_THEME_DEFINITIONS.map((theme) => toPublicBookTheme(theme)), billingEnabled: BODY_BOOK_BILLING_ENABLED });
});

app.get("/api/body-book/projects", requireWebAccount, async (req, res) => {
  try {
    const themeId = String(req.query?.themeId || "").trim().toLowerCase();
    const ownedSessions = (await listBodyBookSessions()).filter((session) => session.ownerAccountId === req.webAccount.id);
    const projects = (await Promise.all(ownedSessions.map(synchronizeBodyBookSession)))
      .filter((session) => session.savedAt && (!themeId || session.themeId === themeId))
      .sort((left, right) => String(right.updatedAt || right.savedAt || "").localeCompare(String(left.updatedAt || left.savedAt || "")));
    res.json({ projects: projects.map(toPublicBodyBookLibraryItem) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取我的认知书失败，请稍后再试。" });
  }
});

app.post("/api/body-book/projects", requireWebAccount, upload.any(), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    const referenceFiles = files.filter((file) => file.fieldname === "images" || file.fieldname === "image").slice(0, BODY_BOOK_MAX_REFERENCE_COUNT);
    if (!referenceFiles.length) throw createHttpError(400, "请先上传至少一张宝宝照片。");
    if (files.some((file) => file.mimetype === "image/svg+xml")) throw createHttpError(400, "请上传 JPG、PNG 或 WebP 图片。");
    const theme = getBookTheme(req.body?.themeId);
    if (!theme) throw createHttpError(400, "请选择认知书主题。");
    const layoutVersion = getNewBodyBookLayoutVersion(theme);
    const contentKeys = parseBodyBookPageKeys(req.body?.contentKeys, theme, layoutVersion);
    const generationKeys = parseBodyBookPageKeys(req.body?.generationKeys, theme, layoutVersion).filter((key) => contentKeys.includes(key));
    const pagePrompts = parseBodyBookPagePrompts(req.body?.pagePrompts, theme, layoutVersion);
    if (!contentKeys.length) throw createHttpError(400, "请至少选择一个认知书内容。");
    if (!generationKeys.length) throw createHttpError(400, "请选择至少一页进行生成。");
    const generatedPageCount = generationKeys.filter((key) => !getBodyBookPageDefinition(theme, key, layoutVersion)?.isBuiltIn).length;
    const currentAccount = commerceStore.readAccount(req.webAccount.id) || req.webAccount;
    if (BODY_BOOK_BILLING_ENABLED && Number(currentAccount.beanBalance || 0) < generatedPageCount) {
      throw createHttpError(409, `生成 ${generatedPageCount} 张图片需要 ${generatedPageCount} 个豆豆，当前豆豆不足。`);
    }
    const visitor = await getVisitorState(req);
    enforcePublicRateLimits(req);
    const pageReferenceFiles = new Map();
    files.filter((file) => file.fieldname.startsWith("pageReference-")).forEach((file) => {
      const key = file.fieldname.slice("pageReference-".length).toLowerCase();
      const current = pageReferenceFiles.get(key) || [];
      if (current.length < BODY_BOOK_MAX_REFERENCE_COUNT) current.push(file);
      pageReferenceFiles.set(key, current);
    });
    const project = await createBodyBookProject({ files: referenceFiles, pageReferenceFiles, pagePrompts, visitor, accountId: req.webAccount.id, theme, layoutVersion, contentKeys, generationKeys });
    res.status(202).json(toPublicBodyBookSession(project));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "创建认知书工程失败，请稍后再试。" });
  }
});

app.get("/api/body-book/projects/:sessionId", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    res.json(toPublicBodyBookSession(await synchronizeBodyBookSession(session)));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取认知书工程失败，请稍后再试。" });
  }
});

app.get("/api/body-book/projects/:sessionId/pages/:pageKey/download-original", requireWebAccount, async (req, res, next) => {
  try {
    if (!req.userSession || !req.webAccount?.isRegistered) {
      throw createHttpError(401, "请先注册并登录后再下载认知书原图。", "请先注册并登录后再下载认知书原图。");
    }
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    const page = session.pages.find((item) => item.key === String(req.params.pageKey || "").toLowerCase());
    if (!page || page.status !== "succeeded" || !page.result?.imageUrl) {
      throw createHttpError(404, "该认知书原图不存在。");
    }
    const file = await resolveBodyBookPageImageFile(page);
    if (!file) throw createHttpError(404, "该认知书原图不存在。");
    await sendBodyBookOriginalImage(res, page, file, { inline: String(req.query?.inline || "") === "1" });
  } catch (error) {
    next(error);
  }
});

app.put("/api/body-book/projects/:sessionId/pages", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    const current = await synchronizeBodyBookSession(session);
    const next = await updateBodyBookProjectPages(current, parseBodyBookPageKeys(req.body?.contentKeys, getBookTheme(current.themeId), current.layoutVersion));
    res.json(toPublicBodyBookSession(next));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "更新认知书内容失败，请稍后再试。" });
  }
});

app.post("/api/body-book/projects/:sessionId/reference", requireWebAccount, upload.single("image"), async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    if (!req.file || req.file.mimetype === "image/svg+xml") throw createHttpError(400, "请上传 JPG、PNG 或 WebP 图片。");
    const next = await replaceBodyBookProjectReference(session, req.file, req.body?.referenceIndex);
    res.json(toPublicBodyBookSession(next));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "替换参考图失败，请稍后再试。" });
  }
});

app.delete("/api/body-book/projects/:sessionId/reference/:referenceIndex", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    const next = await deleteBodyBookProjectReference(session, req.params.referenceIndex);
    res.json(toPublicBodyBookSession(next));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "删除参考图失败，请稍后再试。" });
  }
});

app.post("/api/body-book/projects/:sessionId/pages/:pageKey/reference", requireWebAccount, upload.single("image"), async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    if (!req.file || req.file.mimetype === "image/svg+xml") throw createHttpError(400, "请上传 JPG、PNG 或 WebP 图片。");
    const next = await replaceBodyBookPageReference(session, req.params.pageKey, req.file, req.body?.referenceIndex);
    res.json(toPublicBodyBookSession(next));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "替换页面参考图失败，请稍后再试。" });
  }
});

app.delete("/api/body-book/projects/:sessionId/pages/:pageKey/reference/:referenceIndex", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    const next = await deleteBodyBookPageReference(session, req.params.pageKey, req.params.referenceIndex);
    res.json(toPublicBodyBookSession(next));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "删除页面参考图失败，请稍后再试。" });
  }
});

app.post("/api/body-book/projects/:sessionId/generate", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    const current = await synchronizeBodyBookSession(session);
    if (!current.references.length) throw createHttpError(409, "请先上传至少 1 张宝宝照片。");
    const requestedKeys = parseBodyBookPageKeys(req.body?.pageKeys, getBookTheme(current.themeId), current.layoutVersion);
    const eligibleKeys = current.pages
      .filter((page) => requestedKeys.includes(page.key) && !page.isBuiltIn && !["queued", "running"].includes(page.status))
      .map((page) => page.key);
    if (!eligibleKeys.length) throw createHttpError(409, "所选页面正在生成，暂时不能重复提交。");
    const currentAccount = commerceStore.readAccount(req.webAccount.id) || req.webAccount;
    if (BODY_BOOK_BILLING_ENABLED && Number(currentAccount.beanBalance || 0) < eligibleKeys.length) {
      throw createHttpError(409, `生成 ${eligibleKeys.length} 张图片需要 ${eligibleKeys.length} 个豆豆，当前豆豆不足。`);
    }
    const next = await generateBodyBookPages(current, eligibleKeys, parseBodyBookPagePrompts(req.body?.pagePrompts, getBookTheme(current.themeId), current.layoutVersion));
    res.status(202).json(toPublicBodyBookSession(next));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "提交图片生成失败，请稍后再试。" });
  }
});

app.get("/api/body-book/projects/:sessionId/reference", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    const reference = await readBodyBookReference(session);
    res.type(reference.mimetype).send(reference.buffer);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取参考图失败，请稍后再试。" });
  }
});

app.get("/api/body-book/projects/:sessionId/reference/:referenceIndex/thumbnail", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    const references = normalizeBodyBookReferences(session.references, session.reference);
    const reference = references[Number(req.params.referenceIndex)];
    if (!reference) throw createHttpError(404, "找不到该参考图。");
    await sendBodyBookReferenceThumbnail(res, await readBodyBookReference(session, reference));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取参考图缩略图失败，请稍后再试。" });
  }
});

app.get("/api/body-book/projects/:sessionId/reference/:referenceIndex", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    const references = normalizeBodyBookReferences(session.references, session.reference);
    const reference = references[Number(req.params.referenceIndex)];
    if (!reference) throw createHttpError(404, "找不到该参考图。");
    const file = await readBodyBookReference(session, reference);
    res.type(file.mimetype).send(file.buffer);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取参考图失败，请稍后再试。" });
  }
});

app.get("/api/body-book/projects/:sessionId/pages/:pageKey/reference", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    const page = session.pages.find((item) => item.key === String(req.params.pageKey || "").toLowerCase());
    if (!page) throw createHttpError(404, "找不到该认知书页面。");
    const reference = await readBodyBookReference(session, page.reference || session.reference);
    res.type(reference.mimetype).send(reference.buffer);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取参考图失败，请稍后再试。" });
  }
});

app.get("/api/body-book/projects/:sessionId/pages/:pageKey/reference/:referenceIndex/thumbnail", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    const page = session.pages.find((item) => item.key === String(req.params.pageKey || "").toLowerCase());
    if (!page) throw createHttpError(404, "找不到该认知书页面。");
    const references = normalizeBodyBookReferences(page.references, page.reference);
    const reference = references[Number(req.params.referenceIndex)];
    if (!reference) throw createHttpError(404, "找不到该参考图。");
    await sendBodyBookReferenceThumbnail(res, await readBodyBookReference(session, reference));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取页面参考图缩略图失败，请稍后再试。" });
  }
});

app.get("/api/body-book/projects/:sessionId/pages/:pageKey/reference/:referenceIndex", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    const page = session.pages.find((item) => item.key === String(req.params.pageKey || "").toLowerCase());
    if (!page) throw createHttpError(404, "找不到该认知书页面。");
    const references = normalizeBodyBookReferences(page.references, page.reference);
    const reference = references[Number(req.params.referenceIndex)];
    if (!reference) throw createHttpError(404, "找不到该参考图。");
    const file = await readBodyBookReference(session, reference);
    res.type(file.mimetype).send(file.buffer);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取页面参考图失败，请稍后再试。" });
  }
});

app.delete("/api/body-book/projects/:sessionId", requireWebAccount, async (req, res) => {
  try {
    const session = await readBodyBookSession(req.params.sessionId);
    if (!session || !session.savedAt) throw createHttpError(404, "这本认知书工程不存在或已删除。");
    assertWebAccountOwnsBodyBookSession(req, session);
    await deleteBodyBookSession(session);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "删除认知书工程失败，请稍后再试。" });
  }
});

async function handleCreatePublicExperienceSession(req, res, experienceType) {
  const config = getPublicExperienceConfig(experienceType);
  try {
    const visitor = await getVisitorState(req);
    if (!req.file) {
      return res.status(400).json({ message: "请先上传一张图片。" });
    }
    if (req.file.mimetype === "image/svg+xml") {
      return res.status(400).json({ message: "请上传 JPG、PNG 或 WebP 图片。" });
    }

    const clientMetrics = parseDrawCardClientMetrics(req.body);
    const selectedStyleIds = config.experienceType === "draw-card" ? parseSelectedStyleIds(req.body?.selectedStyleIds) : [];
    const requestedDrawCount = config.experienceType === "draw-card" ? normalizeDrawCardCount(req.body?.drawCount) : 1;
    const requestedSubjectType = config.experienceType === "draw-card" ? normalizeUserSelectedSubject(req.body?.subjectType) : "";
    if (config.experienceType === "draw-card" && selectedStyleIds.length === 0 && !requestedSubjectType) {
      return res.status(400).json({ message: "请选择照片主体类型。" });
    }
    logDrawCardTelemetry("request_parsed", {
      traceId: req.drawCardTraceId,
      visitorId: visitor.visitorId,
      uploadParseMs: elapsedMs(req.drawCardRequestStartedAtMs),
      uploadedMimeType: req.file.mimetype,
      uploadedBytes: Number(req.file.size || req.file.buffer?.length || 0),
      clientPrepareReferenceMs: clientMetrics.prepareReferenceMs,
      clientOriginalFileBytes: clientMetrics.originalBytes,
      clientUploadedFileBytes: clientMetrics.uploadedBytes,
      clientOriginalWidth: clientMetrics.originalWidth,
      clientOriginalHeight: clientMetrics.originalHeight,
      clientUploadedWidth: clientMetrics.uploadedWidth,
      clientUploadedHeight: clientMetrics.uploadedHeight,
      clientWasCompressed: clientMetrics.wasCompressed,
      requestedStyleCount: selectedStyleIds.length,
      requestedDrawCount,
      requestedSubjectType
    });

    const estimatedCost = await estimateDrawCardQuotaCost({
      experienceType: config.experienceType,
      selectedStyleIds,
      requestedDrawCount
    });
    enforcePublicRateLimits(req);
    if (Number(req.webAccount.creditBalance || 0) < estimatedCost) {
      throw createHttpError(409, `本次最多需要 ${estimatedCost} 枚币，当前剩余 ${Number(req.webAccount.coinBalance || req.webAccount.creditBalance || 0)} 枚币。`, "币不足，可定制冰箱贴获得更多币。");
    }
    await enforceVisitorRunningJobLimit(visitor.visitorId, config);

    const session = await createDrawCardSession(req.file, visitor, {
      experienceType: config.experienceType,
      traceId: req.drawCardTraceId,
      requestStartedAtMs: req.drawCardRequestStartedAtMs,
      clientMetrics,
      selectedStyleIds,
      requestedDrawCount,
      requestedSubjectType,
      accountId: req.webAccount.id
    });
    res.status(202).json(toPublicDrawCardSession(session));
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "请上传 JPG、PNG 或 WebP 图片。" });
    }
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || config.unavailableMessage });
  }
}

async function handleGetPublicExperienceSession(req, res, experienceType) {
  const config = getPublicExperienceConfig(experienceType);
  try {
    const session = await readDrawCardSession(req.params.sessionId);
    if (!session || normalizePublicExperienceType(session.experienceType) !== config.experienceType) {
      return res.status(404).json({ message: config.missingSessionMessage });
    }
    assertVisitorOwnsSession(req, session, config);

    const syncedSession = await synchronizeDrawCardSession(session);
    res.json(toPublicDrawCardSession(syncedSession));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || config.readFailureMessage });
  }
}

async function handleGetLatestPublicExperienceSession(req, res, experienceType) {
  const config = getPublicExperienceConfig(experienceType);
  try {
    const session = await readLatestAccountDrawCardSession(req.webAccount, req.visitorId, config.experienceType);
    if (!session) {
      return res.json({});
    }

    const syncedSession = await synchronizeDrawCardSession(session);
    res.json(toPublicDrawCardSession(syncedSession));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || config.restoreFailureMessage });
  }
}

app.post("/api/sync-miniprogram", requireAdmin, async (_req, res) => {
  const styles = await readStyles();
  await syncMiniProgram(styles);
  res.json({ ok: true, count: styles.length });
});

app.post("/api/generate-image", requireAdmin, upload.array("reference", 10), async (req, res) => {
  try {
    const body = req.body || {};
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ message: "请先填写提示词。" });

    const providers = getImageProviders();
    const settings = await readAppSettings();
    const provider = resolveImageProvider(body.provider, providers, settings);
    const providerChain = getProviderFallbackChain(body.provider, providers, settings);
    if (!provider) {
      return res.status(400).json({ message: "请先在 .env 中配置至少一个可用的图片接口供应商。" });
    }

    const referenceIds = parseReferenceIds(body.referenceIds);
    const referenceFiles = await collectReferenceFiles(req.files || [], referenceIds);
    if (referenceFiles.length > 10) {
      return res.status(400).json({ message: "At most 10 reference images are allowed." });
    }
    if (referenceFiles.some((file) => file.mimetype === "image/svg+xml")) {
      return res.status(400).json({ message: "参考图仅支持 JPG、PNG 或 WebP 图片。" });
    }

    const outputFormat = normalizeOption(body.output_format, ["png", "jpeg", "webp"], "png");
    const execution = await executeImageJobWithFailover({
      body,
      files: referenceFiles,
      outputFormat,
      prompt,
      provider,
      providers: providerChain
    });

    res.json({
      ...execution.result,
      provider: execution.provider
    });
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "参考图仅支持 JPG、PNG 或 WebP 图片。" });
    }
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "生图失败，请稍后再试。" });
  }
});

app.post("/api/image-references", requireAdmin, upload.single("reference"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Please choose a reference image." });
    if (req.file.mimetype === "image/svg+xml") {
      return res.status(400).json({ message: "Reference images only support JPG, PNG, or WebP." });
    }

    const reference = await createTemporaryReference(req.file);
    res.status(201).json({ reference });
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "Reference images only support JPG, PNG, or WebP." });
    }
    console.error(error);
    res.status(500).json({ message: "Failed to upload reference image." });
  }
});

app.post("/api/image-jobs", requireAdmin, upload.array("reference", 10), async (req, res) => {
  try {
    const body = req.body || {};
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ message: "请先填写提示词。" });

    const providers = getImageProviders();
    const settings = await readAppSettings();
    const provider = resolveImageProvider(body.provider, providers, settings);
    const providerChain = getProviderFallbackChain(body.provider, providers, settings);
    if (!provider) {
      return res.status(400).json({ message: "请先在 .env 中配置至少一个可用的图片接口供应商。" });
    }

    const referenceIds = parseReferenceIds(body.referenceIds);
    const referenceFiles = await collectReferenceFiles(req.files || [], referenceIds);
    if (referenceFiles.some((file) => file.mimetype === "image/svg+xml")) {
      return res.status(400).json({ message: "参考图仅支持 JPG、PNG 或 WebP 图片。" });
    }

    if (referenceFiles.length > 10) {
      return res.status(400).json({ message: "At most 10 reference images are allowed." });
    }

    const jobId = randomUUID();
    const originalReferences = await persistImageJobReferences(jobId, referenceFiles);
    await deleteTemporaryReferences(referenceIds);
    const now = new Date().toISOString();
    const job = {
      jobId,
      status: "queued",
      message: "任务已提交，等待生成。",
      result: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      prompt,
      size: normalizeSize(body.size),
      referenceCount: referenceFiles.length,
      originalReferences,
      styleId: String(body.styleId || ""),
      styleName: String(body.styleName || ""),
      styleGroupId: String(body.styleGroupId || ""),
      styleGroupName: String(body.styleGroupName || ""),
      provider: {
        id: provider.id,
        name: provider.name,
        model: provider.model
      },
      mode: referenceFiles.length ? "edit" : "generation",
      ownerVisitorId: "",
      visibility: "admin",
      telemetry: {
        requestedProviderIdRaw: String(body.provider || "").trim(),
        requestedProvider: toTelemetryProvider(provider),
        providerChain: toTelemetryProviderList(providerChain),
        attempts: [],
        finalProvider: null,
        finalError: ""
      }
    };

    await saveImageJob(job);
    res.status(202).json(toPublicImageJob(job));

    runImageJob({
      jobId: job.jobId,
      body: { ...body },
      files: referenceFiles.map((file) => ({ ...file, buffer: Buffer.from(file.buffer) })),
      outputFormat: normalizeOption(body.output_format, ["png", "jpeg", "webp"], "png"),
      prompt,
      provider,
      providers: providerChain,
      telemetry: {
        requestedProviderIdRaw: String(body.provider || "").trim()
      }
    }).catch((error) => {
      console.error("Image job failed.", error);
    });
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "参考图仅支持 JPG、PNG 或 WebP 图片。" });
    }
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "生图任务提交失败，请稍后再试。" });
  }
});

app.post("/api/image-jobs/batch", requireAdmin, async (req, res) => {
  const body = req.body || {};
  const referenceIds = parseReferenceIds(body.referenceIds);
  let preparedJobs = [];

  try {
    const styleGroupId = String(body.styleGroupId || "").trim();
    const promptOverride = String(body.promptOverride || "").trim();
    const providers = getImageProviders();
    const settings = await readAppSettings();
    const provider = resolveImageProvider(body.provider, providers, settings);
    const providerChain = getProviderFallbackChain(body.provider, providers, settings);
    let sharedReferenceFiles = [];
    let groups = [];
    let styles = [];
    let group = null;
    let styleMap = null;
    let groupStyles = [];

    if (!styleGroupId) {
      return res.status(400).json({ message: "Please choose a style group first." });
    }

    if (!provider) {
      return res.status(400).json({ message: "Please choose a valid provider first." });
    }

    [groups, styles] = await Promise.all([readStyleGroups(), readStyles()]);
    group = groups.find((item) => item.id === styleGroupId) || null;
    if (!group) {
      return res.status(404).json({ message: "Style group not found." });
    }

    styleMap = new Map(styles.map((style) => [style.id, style]));
    groupStyles = (group.styleIds || []).map((styleId) => styleMap.get(styleId)).filter(Boolean);
    if (!groupStyles.length) {
      return res.status(400).json({ message: "The selected style group has no valid styles." });
    }

    sharedReferenceFiles = await collectReferenceFiles([], referenceIds);
    if (sharedReferenceFiles.some((file) => file.mimetype === "image/svg+xml")) {
      return res.status(400).json({ message: "Reference images only support JPG, PNG, or WebP." });
    }

    for (const style of groupStyles) {
      const prompt = promptOverride || String(style.prompt || "").trim();
      const referenceFiles = await buildBatchReferenceFiles(style, sharedReferenceFiles);
      const now = new Date().toISOString();
      const jobId = randomUUID();
      const styleName = formatStyleName(style);
      const originalReferences = await persistImageJobReferences(jobId, referenceFiles);
      const job = {
        jobId,
        status: "queued",
        message: "Batch job submitted. Waiting to run.",
        result: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        prompt,
        size: normalizeSize(body.size),
        referenceCount: referenceFiles.length,
        originalReferences,
        styleId: String(style.id || ""),
        styleName,
        styleGroupId: group.id,
        styleGroupName: group.name,
        provider: {
          id: provider.id,
          name: provider.name,
          model: provider.model
        },
        mode: referenceFiles.length ? "edit" : "generation",
        telemetry: {
          requestedProviderIdRaw: String(body.provider || "").trim(),
          requestedProvider: toTelemetryProvider(provider),
          providerChain: toTelemetryProviderList(providerChain),
          attempts: [],
          finalProvider: null,
          finalError: ""
        }
      };

      preparedJobs.push({
        job: job,
        runArgs: {
          jobId: jobId,
          body: { ...body, styleId: style.id, styleName: styleName, styleGroupId: group.id, styleGroupName: group.name },
          files: referenceFiles.map(cloneReferenceFile),
          outputFormat: normalizeOption(body.output_format, ["png", "jpeg", "webp"], "png"),
          prompt: prompt,
          provider: provider,
          providers: providerChain,
          telemetry: {
            requestedProviderIdRaw: String(body.provider || "").trim()
          }
        }
      });
    }

    await Promise.all(preparedJobs.map((item) => saveImageJob(item.job)));

    res.status(202).json({
      group: group,
      submittedCount: preparedJobs.length,
      jobs: preparedJobs.map((item) => toPublicImageJob(item.job))
    });

    preparedJobs.forEach((item) => {
      runImageJob(item.runArgs).catch((error) => {
        console.error("Batch image job failed.", error);
      });
    });
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "Reference images only support JPG, PNG, or WebP." });
    }
    await Promise.all(preparedJobs.map(async (item) => {
      await deleteJobReferences(item.job);
      await rm(getImageJobPath(item.job.jobId), { force: true });
    }));
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "Failed to submit batch jobs." });
  } finally {
    if (referenceIds.length) {
      await deleteTemporaryReferences(referenceIds);
    }
  }
});

app.get("/api/public/clip-items", requireWebAccount, async (req, res) => {
  try {
    const experienceType = String(req.query.experience || "").trim();
    const jobs = await listImageJobs();
    const items = jobs
      .filter(
        (job) =>
          job.visibility === "public" &&
          accountOwnsPublicRecord(req.webAccount, job) &&
          job.isLiked &&
          (!experienceType || normalizePublicExperienceType(job.experienceType) === normalizePublicExperienceType(experienceType))
      )
      .sort((a, b) => String(b.likedAt || b.updatedAt || b.createdAt || "").localeCompare(String(a.likedAt || a.updatedAt || a.createdAt || "")))
      .map((job) => ({
        ...toPublicClipItem(job),
        originalRedeemed: commerceStore.isOriginalImageRedeemed(req.webAccount.id, job.jobId)
      }));
    res.json({ items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取卡夹失败，请稍后再试。" });
  }
});

app.get("/api/public/clip-items/:jobId/download-original", requireWebAccount, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    assertCanDownloadClipOriginal(req, job);
    const file = await resolveJobImageFile(job);
    if (!file) throw createHttpError(404, "原图不存在。");
    commerceStore.redeemOriginalImage({ accountId: req.webAccount.id, jobId: job.jobId });
    await sendPublicClipOriginalImage(res, job, file);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "下载原图失败，请稍后再试。" });
  }
});

app.get("/api/image-jobs", requireAdmin, async (req, res) => {
  try {
    const payload = await queryImageJobs(req.query || {});
    res.json(payload);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取生图任务列表失败。" });
  }
});

app.get("/api/admin/draw-card-sessions", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || ADMIN_DRAW_CARD_SESSION_LIMIT), 1), ADMIN_DRAW_CARD_SESSION_LIMIT);
    const sessions = await listDrawCardSessions();
    const selectedSessions = sessions
      .sort((a, b) =>
        String(b.updatedAt || b.completedAt || b.createdAt || "").localeCompare(
          String(a.updatedAt || a.completedAt || a.createdAt || "")
        )
      )
      .slice(0, limit);

    const synchronizedSessions = await Promise.all(
      selectedSessions.map(async (session) => {
        if (["queued", "running"].includes(String(session.status || ""))) {
          return synchronizeDrawCardSession(session);
        }
        return normalizeDrawCardSession(session);
      })
    );

    const payload = await Promise.all(
      synchronizedSessions.map(async (session) => {
        const jobs = await Promise.all(session.items.map((item) => readImageJob(item.jobId)));
        const publicJobs = jobs.filter(Boolean).map(toPublicImageJob);
        return toPublicAdminDrawCardSession(session, publicJobs);
      })
    );

    res.json({ sessions: payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取公开玩法观测失败。" });
  }
});

app.post("/api/image-jobs/:jobId/cancel", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    if (!["queued", "running"].includes(job.status)) {
      return res.status(409).json({ message: "只有排队中或生成中的任务可以停止。" });
    }

    activeImageJobs.get(job.jobId)?.abortController.abort();
    const now = new Date().toISOString();
    const nextJob = await saveImageJob({
      ...job,
      status: "cancelled",
      message: "任务已停止。",
      updatedAt: now,
      completedAt: now
    });
    res.json(toPublicImageJob(nextJob));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "停止生图任务失败。" });
  }
});

app.post("/api/image-jobs/:jobId/like", requireWebAccount, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    assertCanToggleLike(req, job);

    const now = new Date().toISOString();
    const nextJob = await saveImageJob({
      ...job,
      isLiked: true,
      likedAt: job.likedAt || now,
      updatedAt: now
    });
    res.json(toPublicImageJob(nextJob));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "标记喜欢失败，请稍后再试。" });
  }
});

app.post("/api/image-jobs/:jobId/unlike", requireWebAccount, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    assertCanToggleLike(req, job);

    const nextJob = await saveImageJob({
      ...job,
      isLiked: false,
      likedAt: null,
      updatedAt: new Date().toISOString()
    });
    res.json(toPublicImageJob(nextJob));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "移出卡夹失败，请稍后再试。" });
  }
});

app.get("/api/image-jobs/:jobId", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    res.json(toPublicImageJob(job));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取生图任务失败。" });
  }
});

app.post("/api/image-jobs/:jobId/style-preview", requireAdmin, async (req, res) => {
  try {
    const variant = String(req.body?.variant || "").trim();
    if (!getStyleVariantImageFields(variant)) {
      return res.status(400).json({ message: "请选择要替换的人物或宠物效果图。" });
    }

    const [job, styles] = await Promise.all([readImageJob(req.params.jobId), readStyles()]);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    if (String(job.status || "") !== "succeeded" || !job.result?.imageUrl) {
      return res.status(409).json({ message: "只有已完成且有生成结果的任务可以替换效果图。" });
    }

    const matchedStyles = findStylesMatchingJobPrompt(styles, job.prompt);
    if (matchedStyles.length !== 1) {
      return res.status(409).json({ message: matchedStyles.length ? "匹配到多个同提示词风格，无法确定替换目标。" : "当前任务的提示词未匹配到图库风格。" });
    }

    const sourceFile = await resolveJobImageFile(job);
    if (!sourceFile) return res.status(404).json({ message: "任务原图不存在，无法替换效果图。" });

    const mimeType = mimeForExtension(path.extname(sourceFile).toLowerCase());
    if (!mimeType) return res.status(400).json({ message: "任务图片格式不受支持。" });

    const style = matchedStyles[0];
    await saveStyleVariantImage(style, variant, await readFile(sourceFile), mimeType);
    await saveStyles(styles);

    const galleryImage = await getWebGalleryImage(style);
    res.json({
      style: {
        id: style.id,
        title: formatStyleName(style),
        subjectType: style.subjectType,
        galleryImage,
        personGalleryImage: String(style.personThumbnailImage || style.personImage || galleryImage || ""),
        petGalleryImage: String(style.petThumbnailImage || style.petImage || galleryImage || "")
      },
      variant
    });
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "任务图片格式不受支持。" });
    }
    console.error(error);
    return res.status(error.status || 500).json({ message: error.publicMessage || "替换风格效果图失败。" });
  }
});

app.delete("/api/image-jobs/:jobId", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });

    activeImageJobs.get(job.jobId)?.abortController.abort();
    await deleteImageJob(job);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "删除生图任务失败。" });
  }
});

async function listRedemptionCodesHandler(_req, res) {
  try {
    const inviteCodes = await readInviteCodes();
    res.json({
      inviteCodes: inviteCodes
        .filter((invite) => invite.enabled !== false)
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .map(toPublicInviteCode)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取兑换码失败。" });
  }
}

app.get("/api/admin/redemption-codes", requireAdmin, listRedemptionCodesHandler);
app.get("/api/admin/invite-codes", requireAdmin, listRedemptionCodesHandler);

async function createRedemptionCodesHandler(req, res) {
  try {
    const count = Math.min(Math.max(Number(req.body?.count || 1), 1), 20);
    const coinBonus = normalizeInviteBonus(req.body?.coinBonus, 5);
    const beanBonus = normalizeInviteBonus(req.body?.beanBonus, 10);
    const fridgeMagnetItemCount = normalizeRedemptionEntitlementCount(req.body?.fridgeMagnetItemCount);
    const bodyBookPrintCount = normalizeRedemptionEntitlementCount(req.body?.bodyBookPrintCount);
    const prefix = String(req.body?.prefix || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);
    const created = await createInviteCodes(count, prefix, coinBonus, beanBonus, fridgeMagnetItemCount, bodyBookPrintCount);
    res.status(201).json({ inviteCodes: created.map(toPublicInviteCode) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "创建兑换码失败。" });
  }
}

app.post("/api/admin/redemption-codes", requireAdmin, createRedemptionCodesHandler);
app.post("/api/admin/invite-codes", requireAdmin, createRedemptionCodesHandler);

async function updateRedemptionCodeHandler(req, res) {
  try {
    const updated = await updateInviteCode(req.params.id, {
      enabled: req.body?.enabled
    });
    if (!updated) return res.status(404).json({ message: "兑换码不存在。" });
    res.json({ inviteCode: toPublicInviteCode(updated) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "更新兑换码失败。" });
  }
}

app.patch("/api/admin/redemption-codes/:id", requireAdmin, updateRedemptionCodeHandler);
app.patch("/api/admin/invite-codes/:id", requireAdmin, updateRedemptionCodeHandler);

app.get("/api/admin/visitors", requireAdmin, async (_req, res) => {
  try {
    const visitors = await listVisitorStates();
    res.json({
      visitors: visitors
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
        .map(toPublicAdminVisitor)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取访客额度失败。" });
  }
});

app.get("/api/admin/visitor-records", requireAdmin, async (_req, res) => {
  try {
    await closeTimedOutVisitSessions();
    const [visitors, visitSessions, drawCardSessions] = await Promise.all([
      listVisitorStates(),
      listVisitSessions(),
      listDrawCardSessions()
    ]);
    const orders = orderStore.listOrdersForExport();

    const visitorById = new Map(visitors.map((visitor) => [visitor.visitorId, normalizeVisitorState(visitor)]));
    const sessionsByVisitorId = new Map();
    const latestOrderSourceByVisitorId = new Map();
    const orderTotalByVisitorId = new Map();
    const generationCountByVisitorId = new Map();
    const visitorIds = new Set(visitorById.keys());

    visitSessions.forEach((session) => {
      const safeSession = normalizeVisitSession(session);
      if (!safeSession.visitorId) return;
      visitorIds.add(safeSession.visitorId);
      const current = sessionsByVisitorId.get(safeSession.visitorId) || [];
      current.push(safeSession);
      sessionsByVisitorId.set(safeSession.visitorId, current);
    });

    drawCardSessions.forEach((session) => {
      const visitorId = String(session?.ownerVisitorId || "");
      if (!visitorId) return;
      visitorIds.add(visitorId);
      generationCountByVisitorId.set(visitorId, Number(generationCountByVisitorId.get(visitorId) || 0) + 1);
    });

    orders.forEach((order) => {
      const visitorId = String(order?.visitorId || "");
      if (!visitorId) return;
      visitorIds.add(visitorId);
      if (String(order?.fulfillmentStatus || "") !== "cancelled" && !order?.cancelledAt) {
        orderTotalByVisitorId.set(visitorId, Number(orderTotalByVisitorId.get(visitorId) || 0) + Number(order?.totalCents || 0));
      }
      const hasMerchantSource = String(order?.sourceMerchantId || "").trim() || String(order?.sourceMerchantName || "").trim();
      const currentOrder = latestOrderSourceByVisitorId.get(visitorId);
      const currentCreatedAt = String(currentOrder?.createdAt || "");
      const nextCreatedAt = String(order?.createdAt || "");
      if (hasMerchantSource && (!currentOrder || nextCreatedAt.localeCompare(currentCreatedAt) > 0)) {
        latestOrderSourceByVisitorId.set(visitorId, {
          sourceMerchantId: String(order?.sourceMerchantId || ""),
          sourceMerchantName: String(order?.sourceMerchantName || ""),
          createdAt: nextCreatedAt
        });
      }
    });

    const records = Array.from(visitorIds)
      .map((visitorId) => {
        const visitor = visitorById.get(visitorId) || normalizeVisitorState({
          visitorId,
          tier: "anonymous",
          quotaLimit: DEFAULT_VISITOR_ANONYMOUS_LIMIT,
          quotaUsed: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        const visitorSessions = (sessionsByVisitorId.get(visitorId) || []).sort((left, right) =>
          String(getVisitSessionLastActivityAt(right) || "").localeCompare(String(getVisitSessionLastActivityAt(left) || ""))
        );
        const latestVisitSession = visitorSessions[0] || null;
        const latestOrderSource = latestOrderSourceByVisitorId.get(visitorId) || null;
        const sourceMerchantId = visitor.sourceMerchantId || latestVisitSession?.sourceMerchantId || latestOrderSource?.sourceMerchantId || "";
        const sourceMerchantName = visitor.sourceMerchantName || latestVisitSession?.sourceMerchantName || latestOrderSource?.sourceMerchantName || "";
        const lastActiveAt = getVisitSessionLastActivityAt(latestVisitSession) || visitor.lastActiveAt || visitor.updatedAt || visitor.createdAt || null;
        return toPublicAdminVisitorRecord({
          visitorId,
          sourceMerchantId,
          sourceMerchantName,
          lastActiveAt,
          lastVisitDurationSeconds: latestVisitSession?.durationSeconds ?? null,
          generationCount: Number(generationCountByVisitorId.get(visitorId) || 0),
          orderTotalCents: Number(orderTotalByVisitorId.get(visitorId) || 0),
          createdAt: visitor.createdAt || null,
          updatedAt: lastActiveAt || visitor.updatedAt || visitor.createdAt || null
        });
      })
      .sort((left, right) => String(right.lastActiveAt || "").localeCompare(String(left.lastActiveAt || "")))
      .slice(0, ADMIN_VISITOR_RECORD_LIMIT);

    res.json({ records });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取访问记录失败。" });
  }
});

app.get("/api/admin/merchants", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), MERCHANT_SEARCH_LIMIT);
    const search = String(req.query.search || "").trim().toLowerCase();
    const merchants = await merchantStore.listMerchants();
    const filteredMerchants = search
      ? merchants.filter((merchant) =>
          `${merchant.id} ${merchant.name} ${merchant.note}`.toLowerCase().includes(search)
        )
      : merchants;
    const total = filteredMerchants.length;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * limit;
    res.json({
      total,
      page: safePage,
      limit,
      merchants: filteredMerchants.slice(offset, offset + limit).map((merchant) => toPublicMerchant(req, merchant))
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || error.message || "读取商户列表失败。" });
  }
});

app.post("/api/admin/merchants", requireAdmin, async (req, res) => {
  try {
    const created = await merchantStore.createMerchant({
      id: req.body?.id,
      name: req.body?.name,
      status: MERCHANT_STATUS_VALUES.has(String(req.body?.status || "").trim()) ? req.body.status : "active",
      commissionRateBps: req.body?.commissionRateBps,
      note: req.body?.note
    });
    res.status(201).json({ merchant: toPublicMerchant(req, created) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || error.message || "创建商户失败。" });
  }
});

app.patch("/api/admin/merchants/:merchantId", requireAdmin, async (req, res) => {
  try {
    const updated = await merchantStore.updateMerchant(req.params.merchantId, {
      name: req.body?.name,
      status: MERCHANT_STATUS_VALUES.has(String(req.body?.status || "").trim()) ? req.body.status : undefined,
      commissionRateBps: req.body?.commissionRateBps,
      note: req.body?.note
    });
    if (!updated) return res.status(404).json({ message: "商户不存在。" });
    res.json({ merchant: toPublicMerchant(req, updated) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || error.message || "更新商户失败。" });
  }
});

app.delete("/api/admin/merchants/:merchantId", requireAdmin, async (req, res) => {
  try {
    const deleted = await merchantStore.deleteMerchant(req.params.merchantId);
    if (!deleted) return res.status(404).json({ message: "商户不存在。" });
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || error.message || "删除商户失败。" });
  }
});

app.get("/api/admin/merchant-commissions", requireAdmin, async (req, res) => {
  try {
    const merchantId = normalizeMerchantId(String(req.query.merchantId || ""));
    const startDate = String(req.query.startDate || "").trim();
    const endDate = String(req.query.endDate || "").trim();
    const merchants = await merchantStore.listMerchants();
    const merchantById = new Map(merchants.map((merchant) => [merchant.id, merchant]));
    const fallbackCommissionRateByMerchantId = Object.fromEntries(
      merchants.map((merchant) => [merchant.id, merchant.commissionRateBps])
    );
    const summary = orderStore.listMerchantCommissionSummary({
      merchantId,
      startDate,
      endDate,
      fallbackCommissionRateByMerchantId
    }).map((item) => {
      const merchant = merchantById.get(item.merchantId);
      return {
        merchantId: item.merchantId,
        merchantName: merchant?.name || item.merchantName || item.merchantId,
        merchantStatus: merchant?.status || "active",
        commissionRateBps: merchant?.commissionRateBps ?? 0,
        paidOrderCount: item.paidOrderCount,
        paidTotalCents: item.paidTotalCents,
        commissionAmountCents: item.commissionAmountCents,
        latestPaidAt: item.latestPaidAt,
        latestCreatedAt: item.latestCreatedAt
      };
    });
    res.json({ summary });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || error.message || "读取商户佣金汇总失败。" });
  }
});

async function deleteRedemptionCodeHandler(req, res) {
  try {
    const deleted = await disableInviteCode(req.params.id);
    if (!deleted) return res.status(404).json({ message: "兑换码不存在。" });
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "删除兑换码失败。" });
  }
}

app.delete("/api/admin/redemption-codes/:id", requireAdmin, deleteRedemptionCodeHandler);
app.delete("/api/admin/invite-codes/:id", requireAdmin, deleteRedemptionCodeHandler);

app.get("/api/admin/users", requireAdmin, async (req, res, next) => {
  try {
    const payload = await listAdminUserRecords({
      page: req.query?.page,
      limit: req.query?.limit,
      search: req.query?.search,
      status: req.query?.status,
      type: req.query?.type
    });
    res.json({ ...payload, users: payload.items.map(toPublicAdminUser) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users/:id", requireAdmin, (req, res, next) => {
  try {
    const detail = commerceStore.readRegisteredUserDetail(req.params.id);
    if (!detail) throw createHttpError(404, "用户不存在。");
    res.json({
      user: toPublicAdminUser({ ...detail.account, visitorCount: detail.visitorCount, orderCount: detail.orderCount, paidTotalCents: detail.paidTotalCents }),
      ledger: detail.ledger.map(toPublicCreditLedger),
      beanLedger: detail.beanLedger.map(toPublicCreditLedger),
      orders: detail.orders
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users/:id/clip-items", requireAdmin, async (req, res, next) => {
  try {
    const account = commerceStore.readAccount(req.params.id);
    if (!account?.isRegistered) throw createHttpError(404, "用户不存在。");
    const items = await listAdminUserClipItems(account.id);
    res.json({ user: toPublicAdminUser(account), items });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users/:id/clip-items/:jobId/download-original", requireAdmin, async (req, res, next) => {
  try {
    const account = commerceStore.readAccount(req.params.id);
    if (!account?.isRegistered) throw createHttpError(404, "用户不存在。");
    const job = await readImageJob(req.params.jobId);
    if (!isAdminUserClipItem(account.id, job)) throw createHttpError(404, "卡夹图片不存在。");
    await sendAdminJobImage(res, job, { asDownload: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id", requireAdmin, async (req, res, next) => {
  try {
    const account = commerceStore.readAccount(req.params.id);
    if (!account?.isRegistered) throw createHttpError(404, "用户不存在。");
    const result = await permanentlyDeleteAdminUser(account);
    res.json({ deleted: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/users/:id/status", requireAdmin, (req, res, next) => {
  try {
    const current = commerceStore.readAccount(req.params.id);
    if (!current?.isRegistered) throw createHttpError(404, "用户不存在。");
    const status = String(req.body?.status || "").trim();
    if (!new Set(["active", "disabled"]).has(status)) throw createHttpError(400, "用户状态无效。");
    const account = commerceStore.setAccountStatus(current.id, status);
    res.json({ user: toPublicAdminUser(account) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/wallet", requireAdmin, (req, res, next) => {
  try {
    const account = commerceStore.readAccount(req.params.id);
    if (!account?.isRegistered) throw createHttpError(404, "用户不存在。");
    const delta = Math.trunc(Number(req.body?.delta || 0));
    const currency = String(req.body?.currency || "coin");
    const remark = String(req.body?.remark || "").trim().slice(0, 300);
    if (!delta || !remark || !["coin", "bean"].includes(currency)) throw createHttpError(400, "请填写非零余额调整、币种和备注。");
    const adjust = currency === "bean" ? commerceStore.adjustBeans : commerceStore.adjustCredits;
    const updatedAccount = adjust({
      accountId: account.id,
      delta,
      reason: "admin_adjustment",
      note: remark,
      referenceId: randomUUID()
    }).account;
    res.status(201).json({ user: toPublicAdminUser(updatedAccount), ledger: commerceStore.listCreditLedger(account.id, 100).map(toPublicCreditLedger), beanLedger: commerceStore.listBeanLedger(account.id, 100).map(toPublicCreditLedger) });
  } catch (error) {
    if (["INSUFFICIENT_CREDITS", "INSUFFICIENT_BEANS"].includes(error?.code)) return next(createHttpError(400, "扣减后的余额不能小于零。"));
    next(error);
  }
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), ORDER_SEARCH_LIMIT);
    const merchantId = normalizeMerchantId(String(req.query.merchantId || ""));
    const orderStatus = normalizeAdminOrderListStatus(String(req.query.orderStatus || ""));
    const orderType = normalizeAdminOrderListType(String(req.query.orderType || ""));
    const search = String(req.query.search || "").trim();
    const startDate = String(req.query.startDate || "").trim();
    const endDate = String(req.query.endDate || "").trim();
    const records = listAdminOrderRecords({ merchantId, orderStatus, orderType, search, startDate, endDate });
    const total = records.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * limit;

    res.json({
      total,
      page: safePage,
      limit,
      orders: records.slice(offset, offset + limit)
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取订单列表失败。" });
  }
});

app.get("/api/admin/orders/export", requireAdmin, async (req, res) => {
  try {
    const merchantId = normalizeMerchantId(String(req.query.merchantId || ""));
    const orderStatus = normalizeAdminOrderListStatus(String(req.query.orderStatus || ""));
    const orderType = normalizeAdminOrderListType(String(req.query.orderType || ""));
    const search = String(req.query.search || "").trim();
    const startDate = String(req.query.startDate || "").trim();
    const endDate = String(req.query.endDate || "").trim();
    const orders = listAdminOrderRecords({ merchantId, orderStatus, orderType, search, startDate, endDate });

    const rows = [
      ["下单日期", "付款日期", "订单类型", "订单号", "订单状态", "用户/收件人", "电话", "地址", "备注", "商品小计", "邮费", "豆豆优惠", "已购币优惠", "实付金额", "来源商户"],
      ...orders.map((order) => [
        formatOrderExportDate(order.createdAt),
        formatOrderExportDate(order.paidAt),
        getAdminOrderRecordTypeLabel(order),
        String(order.orderNo || ""),
        getAdminOrderRecordStatusLabel(order),
        String(order.recordType === "purchase" ? order.accountName : order.receiverName || ""),
        String(order.receiverPhone || ""),
        order.recordType === "purchase" ? "" : formatOrderExportAddress(order),
        order.recordType === "purchase" ? order.purchaseQuantityText : String(order.remark || ""),
        formatOrderAmount(order.subtotalCents ?? order.amountCents),
        formatOrderAmount(order.shippingFeeCents),
        formatOrderAmount(-Math.max(0, Number(order.beanDiscountCents || 0))),
        formatOrderAmount(-Math.max(0, Number(order.coinDiscountCents || 0))),
        formatOrderAmount(order.recordType === "purchase" ? order.amountCents : getOrderPayableCents(order)),
        String(order.sourceMerchantName || "")
      ])
    ];

    const csv = `\uFEFF${rows.map((row) => row.map(toCsvCell).join(",")).join("\r\n")}\r\n`;
    const filename = `orders-${formatFilenameDate(new Date())}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "导出订单明细失败。" });
  }
});

app.get("/api/admin/orders/:orderId", requireAdmin, async (req, res) => {
  try {
    const order = orderStore.readOrderWithRelations(req.params.orderId);
    if (!order) return res.status(404).json({ message: "订单不存在。" });
    res.json({ order: toPublicOrder(order, { includePrivate: true }) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取订单详情失败。" });
  }
});

async function handleAdminOrderOriginalDownload(req, res) {
  try {
    const order = orderStore.readOrderWithRelations(req.params.orderId);
    if (!order) return res.status(404).json({ message: "订单不存在。" });
    const result = await ensureOrderOriginalImageBundle(order);
    await streamOrderOriginalImageBundle(res, result);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "下载原图失败。" });
  }
}

app.get("/api/admin/orders/:orderId/download-originals", requireAdmin, handleAdminOrderOriginalDownload);
app.post("/api/admin/orders/:orderId/download-originals", requireAdmin, handleAdminOrderOriginalDownload);

app.patch("/api/admin/orders/:orderId", requireAdmin, async (req, res) => {
  try {
    const order = orderStore.readOrderWithRelations(req.params.orderId);
    if (!order) return res.status(404).json({ message: "订单不存在。" });

    const patch = {};
    if (req.body?.orderStatus !== undefined) {
      const nextOrderStatus = normalizeOrderStatus(req.body.orderStatus, getOrderStatus(order));
      if (nextOrderStatus === "pending_payment") {
        patch.fulfillmentStatus = "new";
        patch.paymentStatus = "unpaid";
        patch.paidAt = "";
        patch.shippedAt = "";
        patch.completedAt = "";
        patch.cancelledAt = "";
        patch.lastPaymentError = "";
      } else if (nextOrderStatus === "pending_shipment") {
        patch.paymentStatus = "paid";
        patch.fulfillmentStatus = "new";
        patch.paidAt = order.paidAt || new Date().toISOString();
        patch.shippedAt = "";
        patch.completedAt = "";
        patch.cancelledAt = "";
        patch.lastPaymentError = "";
      } else if (nextOrderStatus === "shipped") {
        patch.paymentStatus = "paid";
        patch.fulfillmentStatus = "shipped";
        patch.paidAt = order.paidAt || new Date().toISOString();
        if (!order.shippedAt) patch.shippedAt = new Date().toISOString();
        patch.completedAt = "";
        patch.cancelledAt = "";
      } else if (nextOrderStatus === "completed") {
        patch.paymentStatus = "paid";
        patch.fulfillmentStatus = "completed";
        patch.paidAt = order.paidAt || new Date().toISOString();
        patch.shippedAt = order.shippedAt || new Date().toISOString();
        if (!order.completedAt) patch.completedAt = new Date().toISOString();
        patch.cancelledAt = "";
      } else if (nextOrderStatus === "cancelled") {
        patch.fulfillmentStatus = "cancelled";
        if (!order.cancelledAt) patch.cancelledAt = new Date().toISOString();
        if (order.paymentStatus === "unpaid") {
          patch.paymentStatus = "expired";
          patch.lastPaymentError = "订单已取消";
        }
      } else if (nextOrderStatus === "expired") {
        patch.paymentStatus = "expired";
        patch.lastPaymentError = patch.lastPaymentError || "订单已过期";
      }
    }

    if (req.body?.paymentStatus !== undefined) {
      const nextPaymentStatus = normalizeOrderPaymentStatus(req.body.paymentStatus, order.paymentStatus);
      if (nextPaymentStatus === "paid" && order.paymentStatus === "unpaid") {
        patch.paymentStatus = "paid";
        patch.paidAt = order.paidAt || new Date().toISOString();
      } else if (nextPaymentStatus !== order.paymentStatus) {
        patch.paymentStatus = nextPaymentStatus;
      }
    }

    if (req.body?.fulfillmentStatus !== undefined) {
      const nextFulfillmentStatus = normalizeOrderFulfillmentStatus(req.body.fulfillmentStatus, order.fulfillmentStatus);
      patch.fulfillmentStatus = nextFulfillmentStatus;
      if (nextFulfillmentStatus === "shipped" && !order.shippedAt) patch.shippedAt = new Date().toISOString();
      if (nextFulfillmentStatus === "completed" && !order.completedAt) patch.completedAt = new Date().toISOString();
      if (nextFulfillmentStatus === "cancelled") {
        if (!order.cancelledAt) patch.cancelledAt = new Date().toISOString();
        if (order.paymentStatus === "unpaid" && patch.paymentStatus === undefined) {
          patch.paymentStatus = "expired";
          patch.lastPaymentError = "订单已取消";
        }
      }
    }

    if (req.body?.adminRemark !== undefined) {
      patch.adminRemark = String(req.body.adminRemark || "").trim();
    }
    if (req.body?.shippingCarrier !== undefined) {
      const shippingCarrier = normalizeShippingCarrierCode(req.body.shippingCarrier);
      if (req.body.shippingCarrier && !shippingCarrier) throw createHttpError(400, "请选择支持的快递公司。");
      patch.shippingCarrier = shippingCarrier;
    }
    if (req.body?.shippingTrackingNo !== undefined) {
      patch.shippingTrackingNo = String(req.body.shippingTrackingNo || "").trim().slice(0, 120);
    }

    if (patch.paymentStatus === "paid" && order.paymentStatus === "unpaid") {
      confirmManualOrderPayment(order);
    }
    const updated = orderStore.updateOrder(req.params.orderId, patch);
    if (updated?.fulfillmentStatus === "completed") {
      commerceStore.releaseReferralPaymentForOrder(updated.id);
    }
    if (order.experienceType === "body-book" && order.paymentStatus === "unpaid" && updated?.paymentStatus === "expired") {
      commerceStore.releaseBodyBookDiscountReservation(order.id);
    }
    queueOrderOriginalImageBundle(updated);
    res.json({ order: toPublicOrder(updated, { includePrivate: true }) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "更新订单失败。" });
  }
});

app.post("/api/admin/orders/:orderId/confirm-manual-payment", requireAdmin, async (req, res) => {
  try {
    const order = orderStore.readOrderWithRelations(req.params.orderId);
    if (!order) return res.status(404).json({ message: "订单不存在。" });
    const updated = confirmManualOrderPayment(order);
    queueOrderOriginalImageBundle(updated);
    res.json({ order: toPublicOrder(updated, { includePrivate: true }) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "确认收款失败。" });
  }
});

app.post("/api/admin/commerce/payments/:paymentIntentId/confirm-manual", requireAdmin, async (req, res) => {
  try {
    const intent = commerceStore.readPaymentIntent(req.params.paymentIntentId);
    if (!intent || !["bean_purchase", "coin_purchase"].includes(intent.kind)) return res.status(404).json({ message: "购买单不存在。" });
    if (intent.status === "paid") return res.json({ payment: toPublicAdminPaymentIntent(intent) });
    if (intent.status === "cancelled" || intent.channel !== "manual_collection") {
      return res.status(409).json({ message: "当前购买单无法人工确认收款。" });
    }
    const settled = commerceStore.settlePayment({
      outTradeNo: intent.outTradeNo,
      transactionId: `MANUAL-${intent.outTradeNo}`,
      paidAt: new Date().toISOString(),
      payload: {
        mode: "manual_collection",
        purchaseNo: String(intent.metadata?.purchaseNo || ""),
        confirmedBy: "admin"
      },
      headers: {}
    });
    res.json({ payment: toPublicAdminPaymentIntent(settled.intent) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "确认收款失败。" });
  }
});

app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
  try {
    const settings = await readAppSettings();
    res.json({ settings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取系统设置失败。" });
  }
});

app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    const current = await readAppSettings();
    const updated = await saveAppSettings({
      ...current,
      anonymousQuotaLimit: req.body?.anonymousQuotaLimit !== undefined
        ? normalizeAnonymousQuotaLimit(req.body?.anonymousQuotaLimit)
        : current.anonymousQuotaLimit,
      defaultCoinBonus: req.body?.defaultCoinBonus !== undefined
        ? normalizeWalletBonus(req.body?.defaultCoinBonus, WEB_SIGNUP_CREDITS)
        : current.defaultCoinBonus,
      defaultBeanBonus: req.body?.defaultBeanBonus !== undefined
        ? normalizeWalletBonus(req.body?.defaultBeanBonus, WEB_SIGNUP_BEANS)
        : current.defaultBeanBonus,
      defaultImageProviderId: req.body?.defaultImageProviderId !== undefined
        ? normalizeImageProviderId(req.body?.defaultImageProviderId)
        : current.defaultImageProviderId,
      fridgeMagnetOrderingEnabled: req.body?.fridgeMagnetOrderingEnabled !== undefined
        ? req.body?.fridgeMagnetOrderingEnabled === true
        : current.fridgeMagnetOrderingEnabled,
      fridgeMagnetUnitPriceCents: req.body?.fridgeMagnetUnitPriceCents !== undefined
        ? normalizeMoneyCents(req.body?.fridgeMagnetUnitPriceCents, DEFAULT_FRIDGE_MAGNET_UNIT_PRICE_CENTS)
        : current.fridgeMagnetUnitPriceCents,
      singleItemShippingFeeCents: req.body?.singleItemShippingFeeCents !== undefined
        ? normalizeMoneyCents(req.body?.singleItemShippingFeeCents, DEFAULT_SINGLE_ITEM_SHIPPING_FEE_CENTS)
        : current.singleItemShippingFeeCents,
      bodyBookOrderingEnabled: req.body?.bodyBookOrderingEnabled !== undefined
        ? req.body?.bodyBookOrderingEnabled === true
        : current.bodyBookOrderingEnabled,
      bodyBookPriceCents: req.body?.bodyBookPriceCents !== undefined
        ? normalizeMoneyCents(req.body?.bodyBookPriceCents, DEFAULT_BODY_BOOK_PRICE_CENTS)
        : current.bodyBookPriceCents,
      bodyBookShippingFeeCents: req.body?.bodyBookShippingFeeCents !== undefined
        ? normalizeMoneyCents(req.body?.bodyBookShippingFeeCents, DEFAULT_BODY_BOOK_SHIPPING_FEE_CENTS)
        : current.bodyBookShippingFeeCents,
      paymentMode: req.body?.paymentMode !== undefined
        ? normalizeOrderPaymentMode(req.body?.paymentMode)
        : current.paymentMode,
      manualPaymentExpireDays: req.body?.manualPaymentExpireDays !== undefined
        ? normalizeManualPaymentExpireDays(req.body?.manualPaymentExpireDays)
        : current.manualPaymentExpireDays,
      contactWechatId: req.body?.contactWechatId !== undefined
        ? normalizeContactWechatId(req.body?.contactWechatId)
        : current.contactWechatId
    });
    res.json({ settings: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "更新系统设置失败。" });
  }
});

app.get("/api/admin/storage", requireAdmin, async (_req, res) => {
  try {
    const summary = await buildStorageSummary();
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取存储概览失败。" });
  }
});

app.post("/api/admin/storage/backups", requireAdmin, async (_req, res) => {
  try {
    const backup = await createStorageBackup();
    res.status(201).json({ backup });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "创建备份失败。" });
  }
});

app.post("/api/admin/storage/image-backups", requireAdmin, async (req, res) => {
  try {
    const backup = await createImageRangeBackup(req.body || {});
    res.status(201).json({ backup });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "创建图片备份失败。" });
  }
});

app.get("/api/admin/storage/backups/:backupId/download", requireAdmin, async (req, res) => {
  try {
    const backup = await readStorageBackupMetadata(req.params.backupId);
    if (!backup) return res.status(404).json({ message: "备份不存在。" });
    const filePath = getStorageBackupFilePath(backup.filename);
    if (!(await fileExists(filePath))) {
      return res.status(404).json({ message: "备份文件不存在。" });
    }
    res.download(filePath, backup.filename);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "下载备份失败。" });
  }
});

app.delete("/api/admin/storage/backups/:backupId", requireAdmin, async (req, res) => {
  try {
    const deleted = await deleteStorageBackup(req.params.backupId);
    if (!deleted) return res.status(404).json({ message: "备份不存在。" });
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "删除备份失败。" });
  }
});

app.post("/api/admin/storage/cleanup", requireAdmin, async (req, res) => {
  try {
    const result = await cleanupStorageHistory(req.body || {});
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "清理历史数据失败。" });
  }
});

app.get("/api/admin/image-jobs/:jobId/result", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    await sendAdminJobImage(res, job);
  } catch (error) {
    console.error(error);
    res.status(error.status || 404).json({ message: error.publicMessage || "读取高清图失败。" });
  }
});

app.get("/api/admin/image-jobs/:jobId/download", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    await sendAdminJobImage(res, job, { asDownload: true });
  } catch (error) {
    console.error(error);
    res.status(error.status || 404).json({ message: error.publicMessage || "下载高清图失败。" });
  }
});

app.get("/api/admin/image-jobs/:jobId/references/:index", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    await sendAdminReferenceImage(res, job, Number(req.params.index));
  } catch (error) {
    console.error(error);
    res.status(error.status || 404).json({ message: error.publicMessage || "读取参考图失败。" });
  }
});

app.post("/api/style-groups", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const styleIds = new Set(styles.map((style) => style.id));
  const groups = await readStyleGroups();
  const group = normalizeStyleGroup(
    {
      id: `group_${Date.now()}`,
      name: req.body.name,
      styleIds: req.body.styleIds,
      size: req.body.size
    },
    styleIds
  );

  groups.unshift(group);
  await saveStyleGroups(groups);
  res.status(201).json(group);
});

app.put("/api/style-groups/:id", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const styleIds = new Set(styles.map((style) => style.id));
  const groups = await readStyleGroups();
  const index = groups.findIndex((group) => group.id === req.params.id);
  if (index < 0) return res.status(404).json({ message: "风格组不存在。" });

  groups[index] = normalizeStyleGroup(
    {
      ...groups[index],
      name: req.body.name,
      styleIds: req.body.styleIds,
      size: req.body.size
    },
    styleIds
  );
  await saveStyleGroups(groups);
  res.json(groups[index]);
});

app.delete("/api/style-groups/:id", requireAdmin, async (req, res) => {
  const groups = await readStyleGroups();
  const nextGroups = groups.filter((group) => group.id !== req.params.id);
  if (nextGroups.length === groups.length) return res.status(404).json({ message: "风格组不存在。" });

  await saveStyleGroups(nextGroups);
  res.status(204).end();
});

app.post("/api/styles", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const now = new Date().toISOString();
  const tags = normalizeTags(req.body.tags).length ? normalizeTags(req.body.tags) : ["新风格"];
  const style = {
    id: `style_${Date.now()}`,
    title: normalizeStyleTitle(req.body.title, tags.join(" / ")),
    tags,
    subjectType: normalizeStyleSubjectType(req.body.subjectType),
    drawCardEnabled: normalizeDrawCardEnabled(req.body.drawCardEnabled, true),
    drawCardWeight: normalizeDrawCardWeight(req.body.drawCardWeight),
    image: "/style-previews/default/cover.svg",
    imageUpdatedAt: now,
    prompt: String(req.body.prompt || "在这里填写这个风格对应的提示词。").trim(),
    useStyleImageAsReference: Boolean(req.body.useStyleImageAsReference)
  };
  styles.unshift(style);
  await saveStyles(styles);
  res.status(201).json(style);
});

app.put("/api/styles/order", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const currentIds = new Set(styles.map((style) => style.id));
  const nextIds = new Set(ids);
  const hasSameItems = ids.length === styles.length && ids.every((id) => currentIds.has(id)) && nextIds.size === currentIds.size;
  if (!hasSameItems) return res.status(400).json({ message: "排序数据与当前风格列表不匹配。" });

  const styleById = new Map(styles.map((style) => [style.id, style]));
  const nextStyles = ids.map((id) => styleById.get(id));
  await saveStyles(nextStyles);
  res.json(nextStyles);
});

app.put("/api/styles/:id", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const style = styles.find((item) => item.id === req.params.id);
  if (!style) return res.status(404).json({ message: "风格不存在。" });

  style.tags = normalizeTags(req.body.tags);
  style.title = normalizeStyleTitle(req.body.title, style.title || style.tags.join(" / ") || style.id);
  style.subjectType = normalizeStyleSubjectType(req.body.subjectType, style);
  style.drawCardEnabled = normalizeDrawCardEnabled(req.body.drawCardEnabled, style.drawCardEnabled);
  style.drawCardWeight = normalizeDrawCardWeight(req.body.drawCardWeight);
  style.prompt = String(req.body.prompt || "").trim();
  style.useStyleImageAsReference = Boolean(req.body.useStyleImageAsReference);
  await saveStyles(styles);
  res.json(style);
});

app.delete("/api/styles/:id", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const nextStyles = styles.filter((item) => item.id !== req.params.id);
  if (nextStyles.length === styles.length) return res.status(404).json({ message: "风格不存在。" });

  await saveStyles(nextStyles);
  await removeStyleFromGroups(req.params.id);
  await deleteMiniImage(req.params.id);
  res.status(204).end();
});

app.post("/api/styles/:id/image", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const styles = await readStyles();
    const style = styles.find((item) => item.id === req.params.id);
    if (!style) return res.status(404).json({ message: "风格不存在。" });
    if (!req.file) return res.status(400).json({ message: "请选择一张图片。" });

    const variant = String(req.body?.variant || "").trim();
    const variantField = variant ? getStyleVariantImageFields(variant) : null;
    if (variant && !variantField) return res.status(400).json({ message: "图片主体类型无效。" });

    if (variantField) {
      await saveStyleVariantImage(style, variant, req.file.buffer, req.file.mimetype);
    } else {
      const ext = extensionForMime(req.file.mimetype);
      const dir = path.join(previewRoot, style.id);
      await mkdir(dir, { recursive: true });
      const filename = `cover.${ext}`;
      await writeFile(path.join(dir, filename), req.file.buffer);
      const imageUrl = `/style-previews/${style.id}/${filename}`;
      const updatedAt = new Date().toISOString();
      style.image = imageUrl;
      style.imageUpdatedAt = updatedAt;
    }
    await saveStyles(styles);
    const galleryImage = await getWebGalleryImage(style);
    res.json({
      ...style,
      galleryImage,
      personGalleryImage: String(style.personThumbnailImage || style.personImage || galleryImage || style.image || ""),
      personImageUpdatedAt: style.personImageUpdatedAt || style.imageUpdatedAt || null,
      petGalleryImage: String(style.petThumbnailImage || style.petImage || galleryImage || style.image || ""),
      petImageUpdatedAt: style.petImageUpdatedAt || style.imageUpdatedAt || null
    });
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "仅支持 JPG、PNG、WebP 或 SVG 图片。" });
    }
    console.error(error);
    res.status(500).json({ message: "图片保存失败。" });
  }
});

app.get("/generated-images/:filename", async (req, res, next) => {
  try {
    const filename = path.basename(String(req.params.filename || ""));
    const jobId = filename.replace(/\.[^.]+$/, "");
    const job = await readImageJob(jobId);
    const file = path.join(generatedImageRoot, filename);
    if (!job || !(await fileExists(file))) throw createHttpError(404, "图片不存在。");

    if (String(job.experienceType || "").trim().toLowerCase() === "body-book") {
      if (!req.userSession || !req.webAccount?.isRegistered) {
        throw createHttpError(401, "请先注册并登录后再下载认知书原图。", "请先注册并登录后再下载认知书原图。");
      }
      if (!accountOwnsPublicRecord(req.webAccount, job)) {
        throw createHttpError(403, "无权访问该认知书原图。");
      }
    }

    res.type(mimeForExtension(path.extname(file).toLowerCase()) || "application/octet-stream");
    res.sendFile(file);
  } catch (error) {
    next(error);
  }
});
app.use("/order-assets", express.static(orderAssetPublicRoot));
app.use(express.static(path.join(rootDir, "public")));
app.use("/images-small", express.static(miniImageRoot));
app.use(express.static(path.join(rootDir, "dist")));

app.use((error, _req, res, next) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: `图片太大，请上传不超过 ${Math.round(UPLOAD_FILE_LIMIT_BYTES / 1024 / 1024)}MB 的图片。` });
  }
  if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
    return res.status(400).json({ message: "仅支持 JPG、PNG、WebP 图片。" });
  }
  if (error.status) {
    return res.status(error.status).json({ message: error.publicMessage || error.message });
  }
  console.error(error);
  return res.status(500).json({ message: "服务器暂时不可用，请稍后再试。" });
});

app.use((req, res) => {
  const pathname = req.path || "/";
  if (pathname === "/body-book" || pathname === "/body-book/") {
    return res.redirect(302, "/book");
  }
  if (pathname === "/" || pathname === "/book" || pathname === "/book/" || pathname === "/book/orders" || pathname === "/book/orders/" || pathname.startsWith("/book/orders/") || pathname === "/fridge" || pathname === "/fridge/" || pathname === "/fridge/orders" || pathname === "/fridge/orders/" || pathname.startsWith("/fridge/orders/") || pathname === "/gallery" || pathname.startsWith("/admin/") || pathname === "/admin") {
    return res.sendFile(path.join(rootDir, "dist", "index.html"));
  }
  if (pathname === "/luck" || pathname === "/manage" || pathname === "/tasks" || pathname === "/batch") {
    return res.redirect(pathname === "/luck" ? "/" : "/admin/login");
  }
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

async function repairHistoricalCommissionSnapshots() {
  const merchants = await merchantStore.listMerchants();
  const merchantById = Object.fromEntries(merchants.map((merchant) => [merchant.id, merchant]));
  const result = orderStore.backfillMissingCommissionSnapshots({ merchantById });
  if (result.updatedOrderCount > 0) {
    console.log(`Backfilled commission snapshots for ${result.updatedOrderCount} orders.`);
  }
}

app.listen(port, () => {
  console.log(`Prompt gallery listening on http://127.0.0.1:${port}`);
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    console.warn("Admin credentials are missing. Please set ADMIN_USERNAME and ADMIN_PASSWORD in .env.");
  }
  prepareImageJobStorage()
    .then(migrateLegacyGeneratedImages)
    .then(repairHistoricalCommissionSnapshots)
    .then(() => {
      void preparePendingShipmentOrderOriginalBundles();
    })
    .then(readStyles)
    .then(syncMiniProgram)
    .then(() => console.log("Mini program files synced."))
    .catch((error) => console.error("Startup tasks failed.", error));
});

async function readStyles() {
  const styles = JSON.parse(await readFile(dataPath, "utf-8"));
  return Promise.all(
    styles.map(async (style) => {
      const image = style.image || "/style-previews/default/cover.svg";
      const subjectType = normalizeStyleSubjectType(style.subjectType, style);
      const legacyUniversalImage = subjectType === SUBJECT_BOTH && image !== "/style-previews/default/cover.svg" ? image : "";
      const personImage = String(style.personImage || legacyUniversalImage);
      const petImage = String(style.petImage || legacyUniversalImage);
      const personThumbnailImage = String(style.personThumbnailImage || "");
      const petThumbnailImage = String(style.petThumbnailImage || "");
      const galleryImage = await getWebGalleryImage(style);
      return {
        id: style.id,
        title: normalizeStyleTitle(style.title, style.tags?.join(" / ") || style.label || style.id),
        tags: normalizeTags(style.tags?.length ? style.tags : [style.label, style.description]),
        subjectType,
        drawCardEnabled: normalizeDrawCardEnabled(style.drawCardEnabled, true),
        drawCardWeight: normalizeDrawCardWeight(style.drawCardWeight),
        image,
        imageUpdatedAt: style.imageUpdatedAt || null,
        galleryImage,
        personImage,
        personImageUpdatedAt: style.personImageUpdatedAt || (personImage ? style.imageUpdatedAt || null : null),
        personThumbnailImage,
        personGalleryImage: String(personThumbnailImage || (personImage === image ? galleryImage : personImage) || galleryImage || image),
        petImage,
        petImageUpdatedAt: style.petImageUpdatedAt || (petImage ? style.imageUpdatedAt || null : null),
        petThumbnailImage,
        petGalleryImage: String(petThumbnailImage || (petImage === image ? galleryImage : petImage) || galleryImage || image),
        prompt: String(style.prompt || ""),
        useStyleImageAsReference: Boolean(style.useStyleImageAsReference)
      };
    })
  );
}

async function migrateLegacyGeneratedImages() {
  if (!(await fileExists(legacyGeneratedImageRoot))) {
    return;
  }

  await mkdir(generatedImageRoot, { recursive: true });

  const legacyEntries = await readdir(legacyGeneratedImageRoot, { withFileTypes: true });
  const legacyFiles = legacyEntries.filter((entry) => entry.isFile());
  if (!legacyFiles.length) {
    return;
  }

  for (const entry of legacyFiles) {
    const sourcePath = path.join(legacyGeneratedImageRoot, entry.name);
    const targetPath = path.join(generatedImageRoot, entry.name);
    if (!(await fileExists(targetPath))) {
      await copyFile(sourcePath, targetPath);
    }
  }

  const jobs = await listImageJobs();
  let updatedCount = 0;
  for (const job of jobs) {
    const imageUrl = String(job?.result?.imageUrl || "");
    if (!imageUrl.startsWith("/generated-images/")) continue;
    const filename = path.basename(imageUrl);
    const migratedFilePath = path.join(generatedImageRoot, filename);
    if (!(await fileExists(migratedFilePath))) continue;
    const normalizedJob = toPublicImageJob(job);
    await saveImageJob(normalizedJob);
    updatedCount += 1;
  }

  await rm(legacyGeneratedImageRoot, { recursive: true, force: true });

  console.log(`Legacy generated images migrated: ${legacyFiles.length} files, ${updatedCount} jobs normalized.`);
}

async function readStyleGroups() {
  try {
    const groups = JSON.parse(await readFile(styleGroupsPath, "utf-8"));
    return groups.map((group) => normalizeStyleGroup(group));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveStyleGroups(groups) {
  await writeFile(styleGroupsPath, `${JSON.stringify(groups, null, 2)}\n`, "utf-8");
}

function normalizeStyleGroup(group, validStyleIds = null) {
  const normalizedIds = Array.isArray(group?.styleIds)
    ? group.styleIds
        .map((styleId) => String(styleId || "").trim())
        .filter(Boolean)
        .filter((styleId, index, list) => list.indexOf(styleId) === index)
    : [];
  const nextStyleIds = validStyleIds ? normalizedIds.filter((styleId) => validStyleIds.has(styleId)) : normalizedIds;

  return {
    id: String(group?.id || `group_${Date.now()}`),
    name: String(group?.name || "").trim() || "鏈懡鍚嶉鏍肩粍",
    styleIds: nextStyleIds,
    size: normalizeStyleGroupSize(group?.size)
  };
}

function normalizeStyleGroupSize(value) {
  const size = String(value || "").trim();
  return STYLE_GROUP_SIZE_OPTIONS.has(size) ? size : DRAW_CARD_DEFAULT_SIZE;
}

function parseCookies(req) {
  const header = String(req.headers?.cookie || "");
  return header.split(/;\s*/).reduce((accumulator, item) => {
    const separator = item.indexOf("=");
    if (separator <= 0) return accumulator;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) accumulator[key] = decodeURIComponent(value);
    return accumulator;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function appendSetCookie(res, cookie) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }

  res.setHeader("Set-Cookie", Array.isArray(current) ? current.concat(cookie) : [current, cookie]);
}

function setVisitorCookie(req, res, visitorId) {
  appendSetCookie(res, serializeCookie(VISITOR_COOKIE_NAME, visitorId, {
    maxAge: 60 * 60 * 24 * 365,
    secure: shouldUseSecureCookies(req)
  }));
}

function setWebAccountCookie(req, res, accountId) {
  appendSetCookie(res, serializeCookie(WEB_ACCOUNT_COOKIE_NAME, accountId, {
    maxAge: 60 * 60 * 24 * 365,
    secure: shouldUseSecureCookies(req)
  }));
}

function clearWebAccountCookie(req, res) {
  appendSetCookie(res, serializeCookie(WEB_ACCOUNT_COOKIE_NAME, "", {
    maxAge: 0,
    secure: shouldUseSecureCookies(req)
  }));
}

function setUserSessionCookie(req, res, sessionId) {
  appendSetCookie(res, serializeCookie(USER_SESSION_COOKIE_NAME, sessionId, {
    maxAge: USER_SESSION_TTL_MS / 1000,
    secure: shouldUseSecureCookies(req)
  }));
}

function setWechatOAuthStateCookie(req, res, state) {
  appendSetCookie(res, serializeCookie(WEB_WECHAT_OAUTH_STATE_COOKIE_NAME, state, {
    maxAge: 10 * 60,
    secure: shouldUseSecureCookies(req)
  }));
}

function clearWechatOAuthStateCookie(req, res) {
  appendSetCookie(res, serializeCookie(WEB_WECHAT_OAUTH_STATE_COOKIE_NAME, "", {
    maxAge: 0,
    secure: shouldUseSecureCookies(req)
  }));
}

function clearUserSessionCookie(req, res) {
  appendSetCookie(res, serializeCookie(USER_SESSION_COOKIE_NAME, "", {
    maxAge: 0,
    secure: shouldUseSecureCookies(req)
  }));
}

function setAdminCookie(req, res, sessionId) {
  appendSetCookie(res, serializeCookie(ADMIN_COOKIE_NAME, sessionId, {
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
    secure: shouldUseSecureCookies(req)
  }));
}

function clearAdminCookie(req, res) {
  appendSetCookie(res, serializeCookie(ADMIN_COOKIE_NAME, "", {
    maxAge: 0,
    secure: shouldUseSecureCookies(req)
  }));
}

async function visitorSessionMiddleware(req, res, next) {
  try {
    const cookies = parseCookies(req);
    const current = cookies[VISITOR_COOKIE_NAME];
    const visitorId = isSafeVisitorId(current) ? current : randomUUID();
    req.visitorId = visitorId;
    if (visitorId !== current) setVisitorCookie(req, res, visitorId);
    next();
  } catch (error) {
    next(error);
  }
}

async function webAccountSessionMiddleware(req, res, next) {
  try {
    const cookies = parseCookies(req);
    const accountId = cookies[WEB_ACCOUNT_COOKIE_NAME];
    req.webAccount = isSafeAccountId(accountId) ? commerceStore.readAccount(accountId) : null;
    if (!req.webAccount) {
      // 小程序只使用微信账户，不为未授权用户创建或保留访客账户。
      const isMiniProgramRequest = String(req.get("X-PetPaint-Client") || "").toLowerCase() === "miniprogram";
      const isPublicAvatarRequest = req.path.startsWith("/api/public/account-avatars/") || req.path.startsWith("/account-avatars/");
      if (isMiniProgramRequest || isPublicAvatarRequest) return next();
      const settings = await readAppSettings();
      req.webAccount = commerceStore.createOrGetBrowserAccount({
        visitorId: req.visitorId,
        signupCredits: settings.defaultCoinBonus,
        signupBeans: settings.defaultBeanBonus
      });
      setWebAccountCookie(req, res, req.webAccount.id);
    } else {
      commerceStore.linkVisitor(req.webAccount.id, req.visitorId);
    }
    next();
  } catch (error) {
    next(error);
  }
}

async function handleGetPublicExperienceSessionReference(req, res, experienceType) {
  const config = getPublicExperienceConfig(experienceType);
  try {
    const session = await readDrawCardSession(req.params.sessionId);
    if (!session || normalizePublicExperienceType(session.experienceType) !== config.experienceType) {
      return res.status(404).json({ message: config.missingSessionMessage });
    }
    assertVisitorOwnsSession(req, session, config);

    const reference = await readPublicExperienceSessionReference(session);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(reference.mimeType);
    res.sendFile(reference.file);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取参考图失败，请稍后再试。" });
  }
}

async function userSessionMiddleware(req, res, next) {
  try {
    const cookies = parseCookies(req);
    const sessionId = cookies[USER_SESSION_COOKIE_NAME];
    req.userSession = sessionId && isSafeAccountId(sessionId) ? commerceStore.readUserSession(sessionId) : null;
    if (!req.userSession) {
      if (sessionId) clearUserSessionCookie(req, res);
      return next();
    }
    req.webAccount = req.userSession.account;
    commerceStore.linkVisitor(req.webAccount.id, req.visitorId);
    if (req.webAccount.accountStatus === "disabled") req.accountDisabled = true;
    return next();
  } catch (error) {
    return next(error);
  }
}

function shouldUseSecureCookies(req) {
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  if (forwardedProto === "https") return true;
  if (req?.secure) return true;
  if (req?.socket?.encrypted) return true;
  return false;
}

async function adminSessionMiddleware(req, _res, next) {
  try {
    const cookies = parseCookies(req);
    const sessionId = cookies[ADMIN_COOKIE_NAME];
    req.adminSession = sessionId && isSafeAdminSessionId(sessionId) ? await readAdminSession(sessionId) : null;
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req, _res, next) {
  if (!req.adminSession) {
    return next(createHttpError(401, "请先登录后台。"));
  }
  return next();
}

function createHttpError(status, publicMessage) {
  const error = new Error(publicMessage);
  error.status = status;
  error.publicMessage = publicMessage;
  return error;
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const remoteAddress = String(req.socket?.remoteAddress || "");
  return forwarded || remoteAddress || "unknown";
}

function pruneTimestamps(store, key, windowMs, now) {
  const existing = store.get(key) || [];
  const next = existing.filter((timestamp) => now - timestamp < windowMs);
  store.set(key, next);
  return next;
}

function enforcePublicRateLimits(req) {
  const now = Date.now();
  const visitorEntries = pruneTimestamps(visitorRequestLog, req.visitorId, VISITOR_RATE_WINDOW_MS, now);
  if (visitorEntries.length >= VISITOR_RATE_LIMIT) {
    throw createHttpError(429, "当前操作过于频繁，请稍后再试。");
  }
  visitorEntries.push(now);

  const ip = getClientIp(req);
  const ipEntries = pruneTimestamps(ipRequestLog, ip, IP_RATE_WINDOW_MS, now);
  if (ipEntries.length >= IP_RATE_LIMIT) {
    throw createHttpError(429, "当前网络请求过于频繁，请稍后再试。");
  }
  ipEntries.push(now);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readJsonStringFieldFromText(text, fieldName) {
  const pattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`);
  const match = String(text || "").match(pattern);
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return String(match[1] || "");
  }
}

function readJsonNullableStringFieldFromText(text, fieldName) {
  const pattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*(null|"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)")`);
  const match = String(text || "").match(pattern);
  if (!match) return null;
  if (match[1] === "null") return null;
  try {
    return JSON.parse(`"${match[2]}"`);
  } catch {
    return String(match[2] || "");
  }
}

function readJsonNumberFieldFromText(text, fieldName) {
  const pattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`);
  const match = String(text || "").match(pattern);
  if (!match) return NaN;
  return Number(match[1]);
}

function readJsonRawValueFromText(text, fieldName) {
  const pattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*(null|true|false|-?\\d+(?:\\.\\d+)?|"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)")`);
  const match = String(text || "").match(pattern);
  return match?.[1] || "";
}

function pickLatestIsoString(...values) {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .at(-1) || "";
}

function pickEarliestIsoString(...values) {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))[0] || "";
}

async function inferVisitorStateFromArtifacts(visitorId, currentText = "") {
  const [settings, inviteCodes] = await Promise.all([readAppSettings(), readInviteCodes()]);
  const anonymousQuotaLimit = normalizeAnonymousQuotaLimit(settings?.anonymousQuotaLimit);
  const matchingInvites = inviteCodes
    .filter((invite) => Array.isArray(invite?.redeemedByVisitorIds) && invite.redeemedByVisitorIds.map(String).includes(visitorId))
    .sort((left, right) => String(left.updatedAt || "").localeCompare(String(right.updatedAt || "")));
  const invitedAtFromInvite = matchingInvites[0]?.updatedAt || "";
  const recoveredInviteQuotaBonus = matchingInvites.reduce((sum, invite) => sum + normalizeInviteQuotaBonus(invite?.quotaBonus), 0);
  const chargedDrawCardSessionIds = [];
  let recoveredChargedQuotaUsed = 0;
  let latestDrawCardActivityAt = "";
  let earliestDrawCardCreatedAt = "";

  await mkdir(drawCardSessionRoot, { recursive: true });
  const drawCardEntries = await readdir(drawCardSessionRoot, { withFileTypes: true });
  for (const entry of drawCardEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const text = await readFile(path.join(drawCardSessionRoot, entry.name), "utf-8");
    if (!text.includes(`"ownerVisitorId": "${visitorId}"`)) continue;

    const sessionId = readJsonStringFieldFromText(text, "sessionId") || entry.name.replace(/\.json$/, "");
    const quotaChargedAt = readJsonRawValueFromText(text, "quotaChargedAt");
    if (sessionId && quotaChargedAt && quotaChargedAt !== "null") {
      chargedDrawCardSessionIds.push(sessionId);
      const quotaChargedCount = readJsonNumberFieldFromText(text, "quotaChargedCount");
      recoveredChargedQuotaUsed += Number.isFinite(quotaChargedCount) ? Math.max(0, Math.round(quotaChargedCount)) : 1;
    }

    latestDrawCardActivityAt = pickLatestIsoString(
      latestDrawCardActivityAt,
      readJsonStringFieldFromText(text, "updatedAt"),
      readJsonStringFieldFromText(text, "completedAt"),
      readJsonStringFieldFromText(text, "createdAt")
    );
    earliestDrawCardCreatedAt = pickEarliestIsoString(
      earliestDrawCardCreatedAt,
      readJsonStringFieldFromText(text, "createdAt")
    );
  }

  let latestVisitActivityAt = "";
  let earliestVisitCreatedAt = "";
  let activeVisitSessionId = "";
  let sourceMerchantId = readJsonStringFieldFromText(currentText, "sourceMerchantId");
  let sourceMerchantName = readJsonStringFieldFromText(currentText, "sourceMerchantName");

  await mkdir(visitSessionRoot, { recursive: true });
  const visitEntries = await readdir(visitSessionRoot, { withFileTypes: true });
  for (const entry of visitEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const text = await readFile(path.join(visitSessionRoot, entry.name), "utf-8");
    if (!text.includes(`"visitorId": "${visitorId}"`)) continue;

    const status = readJsonStringFieldFromText(text, "status");
    const updatedAt = pickLatestIsoString(
      readJsonStringFieldFromText(text, "updatedAt"),
      readJsonStringFieldFromText(text, "endedAt"),
      readJsonStringFieldFromText(text, "lastHeartbeatAt"),
      readJsonStringFieldFromText(text, "startedAt")
    );
    if (updatedAt && updatedAt >= latestVisitActivityAt) {
      latestVisitActivityAt = updatedAt;
      if (status === "active") {
        activeVisitSessionId = readJsonStringFieldFromText(text, "sessionId");
      }
      sourceMerchantId = readJsonStringFieldFromText(text, "sourceMerchantId") || sourceMerchantId;
      sourceMerchantName = readJsonStringFieldFromText(text, "sourceMerchantName") || sourceMerchantName;
    }
    earliestVisitCreatedAt = pickEarliestIsoString(
      earliestVisitCreatedAt,
      readJsonStringFieldFromText(text, "createdAt"),
      readJsonStringFieldFromText(text, "startedAt")
    );
  }

  const uniqueChargedSessionIds = [...new Set(chargedDrawCardSessionIds)];
  const recoveredQuotaLimit = readJsonNumberFieldFromText(currentText, "quotaLimit");
  const recoveredQuotaUsed = readJsonNumberFieldFromText(currentText, "quotaUsed");
  const recoveredCreatedAt = readJsonStringFieldFromText(currentText, "createdAt");
  const recoveredUpdatedAt = readJsonStringFieldFromText(currentText, "updatedAt");
  const recoveredLastActiveAt = readJsonStringFieldFromText(currentText, "lastActiveAt");
  const recoveredContactMessage = readJsonStringFieldFromText(currentText, "contactMessage");
  const recoveredSourceClaimedAt = readJsonNullableStringFieldFromText(currentText, "sourceClaimedAt");
  const recoveredSourceExpiresAt = readJsonNullableStringFieldFromText(currentText, "sourceExpiresAt");
  const createdAt = pickEarliestIsoString(recoveredCreatedAt, invitedAtFromInvite, earliestVisitCreatedAt, earliestDrawCardCreatedAt) || new Date().toISOString();
  const updatedAt = pickLatestIsoString(recoveredUpdatedAt, latestVisitActivityAt, latestDrawCardActivityAt, invitedAtFromInvite, createdAt) || createdAt;
  const lastActiveAt = pickLatestIsoString(recoveredLastActiveAt, latestVisitActivityAt, latestDrawCardActivityAt, updatedAt) || updatedAt;

  return {
    visitorId,
    tier: "anonymous",
    quotaLimit: Number.isFinite(recoveredQuotaLimit)
      ? Math.max(0, Math.round(recoveredQuotaLimit))
      : anonymousQuotaLimit + recoveredInviteQuotaBonus,
    quotaUsed: Math.max(recoveredChargedQuotaUsed, uniqueChargedSessionIds.length, Number.isFinite(recoveredQuotaUsed) ? Math.max(0, Math.round(recoveredQuotaUsed)) : 0),
    chargedDrawCardSessionIds: uniqueChargedSessionIds,
    sourceMerchantId,
    sourceMerchantName,
    sourceClaimedAt: recoveredSourceClaimedAt,
    sourceExpiresAt: recoveredSourceExpiresAt,
    invitedAt: null,
    contactMessage: recoveredContactMessage || DEFAULT_CONTACT_MESSAGE,
    lastActiveAt,
    activeVisitSessionId,
    createdAt,
    updatedAt
  };
}

async function backupCorruptedVisitorStateFile(visitorId) {
  const sourcePath = getVisitorStatePath(visitorId);
  const destinationPath = path.join(visitorStateRoot, `${visitorId}.corrupt-${formatFilenameDate(new Date())}.bak`);
  await copyFile(sourcePath, destinationPath);
  return destinationPath;
}

async function recoverCorruptedVisitorState(visitorId, rawText, parseError) {
  const backupPath = await backupCorruptedVisitorStateFile(visitorId);
  const recoveredVisitor = await saveVisitorState(await inferVisitorStateFromArtifacts(visitorId, rawText));
  console.warn(`Recovered corrupted visitor state for ${visitorId}. Backup: ${backupPath}`);
  if (parseError) {
    console.warn(parseError);
  }
  return recoveredVisitor;
}

async function readVisitorState(visitorId) {
  if (!isSafeVisitorId(visitorId)) return null;
  try {
    const rawText = await readFile(getVisitorStatePath(visitorId), "utf-8");
    try {
      return normalizeVisitorState(JSON.parse(rawText));
    } catch (error) {
      return recoverCorruptedVisitorState(visitorId, rawText, error);
    }
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function saveVisitorState(visitor) {
  await mkdir(visitorStateRoot, { recursive: true });
  const safeVisitor = normalizeVisitorState(visitor);
  await writeFile(getVisitorStatePath(safeVisitor.visitorId), `${JSON.stringify(safeVisitor, null, 2)}\n`, "utf-8");
  return safeVisitor;
}

function normalizeVisitorState(visitor) {
  // Redeeming a legacy invite code only grants a quota bonus; it is not a
  // referral relationship. Only registered accounts can be marked invited.
  const tier = "anonymous";
  const quotaLimit = Number(visitor?.quotaLimit || DEFAULT_VISITOR_ANONYMOUS_LIMIT);
  const quotaUsed = Math.max(0, Number(visitor?.quotaUsed || 0));
  const chargedDrawCardSessionIds = Array.isArray(visitor?.chargedDrawCardSessionIds)
    ? visitor.chargedDrawCardSessionIds.map((sessionId) => String(sessionId || "")).filter(Boolean)
    : [];
  const rawSourceExpiresAt = visitor?.sourceExpiresAt || null;
  const sourceExpiresAtTime = rawSourceExpiresAt ? new Date(rawSourceExpiresAt).getTime() : NaN;
  const sourceIsActive = Number.isFinite(sourceExpiresAtTime) && sourceExpiresAtTime > Date.now();
  return {
    visitorId: String(visitor?.visitorId || randomUUID()),
    tier,
    quotaLimit,
    quotaUsed,
    chargedDrawCardSessionIds,
    sourceMerchantId: sourceIsActive ? String(visitor?.sourceMerchantId || "").trim() : "",
    sourceMerchantName: sourceIsActive ? String(visitor?.sourceMerchantName || "").trim() : "",
    sourceClaimedAt: sourceIsActive ? visitor?.sourceClaimedAt || null : null,
    sourceExpiresAt: sourceIsActive ? rawSourceExpiresAt : null,
    invitedAt: null,
    contactMessage: String(visitor?.contactMessage || DEFAULT_CONTACT_MESSAGE),
    lastActiveAt: visitor?.lastActiveAt || visitor?.updatedAt || visitor?.createdAt || new Date().toISOString(),
    activeVisitSessionId: isSafeVisitSessionId(visitor?.activeVisitSessionId) ? String(visitor.activeVisitSessionId) : "",
    createdAt: visitor?.createdAt || new Date().toISOString(),
    updatedAt: visitor?.updatedAt || new Date().toISOString()
  };
}

async function readVisitSession(sessionId) {
  if (!isSafeVisitSessionId(sessionId)) return null;
  try {
    return normalizeVisitSession(JSON.parse(await readFile(getVisitSessionPath(sessionId), "utf-8")));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) {
      console.warn(`Ignoring malformed visit-session file: ${sessionId}`);
      return null;
    }
    throw error;
  }
}

async function saveVisitSession(session) {
  await mkdir(visitSessionRoot, { recursive: true });
  const safeSession = normalizeVisitSession(session);
  await writeFile(getVisitSessionPath(safeSession.sessionId), `${JSON.stringify(safeSession, null, 2)}\n`, "utf-8");
  return safeSession;
}

async function listVisitSessions() {
  await mkdir(visitSessionRoot, { recursive: true });
  const entries = await readdir(visitSessionRoot, { withFileTypes: true });
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readVisitSession(entry.name.replace(/\.json$/, "")))
  );
  return sessions.filter(Boolean);
}

function normalizeVisitSessionRoute(route) {
  const current = String(route || "").trim();
  if (!current) return "/";
  if (!current.startsWith("/")) return `/${current}`;
  return current.slice(0, 200);
}

function parseIsoTime(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : NaN;
}

function computeElapsedSeconds(startedAt, endedAt) {
  const startedAtMs = parseIsoTime(startedAt);
  const endedAtMs = parseIsoTime(endedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) return null;
  return Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000));
}

function getVisitSessionLastActivityAt(session) {
  if (!session) return null;
  return session.lastHeartbeatAt || session.endedAt || session.startedAt || session.updatedAt || session.createdAt || null;
}

function normalizeVisitSession(session) {
  const now = new Date().toISOString();
  const startedAt = session?.startedAt || session?.createdAt || now;
  const lastHeartbeatAt = session?.lastHeartbeatAt || startedAt;
  const status = ["active", "ended", "timed_out"].includes(String(session?.status || "").trim())
    ? String(session.status || "").trim()
    : "active";
  const endedAt = status === "active" ? null : session?.endedAt || lastHeartbeatAt || startedAt;
  const durationSeconds = status === "active"
    ? null
    : (() => {
        const next = Number(session?.durationSeconds);
        if (Number.isFinite(next)) return Math.max(0, Math.round(next));
        return computeElapsedSeconds(startedAt, endedAt);
      })();

  return {
    sessionId: String(session?.sessionId || randomUUID()),
    visitorId: String(session?.visitorId || ""),
    experienceType: normalizePublicExperienceType(session?.experienceType),
    route: normalizeVisitSessionRoute(session?.route),
    browser: normalizeBrowserDescription(session?.browser),
    sourceMerchantId: String(session?.sourceMerchantId || "").trim(),
    sourceMerchantName: String(session?.sourceMerchantName || "").trim(),
    startedAt,
    lastHeartbeatAt,
    endedAt,
    durationSeconds,
    status,
    createdAt: session?.createdAt || startedAt,
    updatedAt: session?.updatedAt || endedAt || lastHeartbeatAt || startedAt
  };
}

async function finalizeVisitSession(session, { status = "ended", endedAt = "", updatedAt = "" } = {}) {
  const current = normalizeVisitSession(session);
  if (current.status !== "active") return current;
  const nextUpdatedAt = updatedAt || new Date().toISOString();
  const safeEndedAt = endedAt || (status === "timed_out" ? current.lastHeartbeatAt || current.startedAt : nextUpdatedAt);
  const nextSession = await saveVisitSession({
    ...current,
    endedAt: safeEndedAt,
    durationSeconds: computeElapsedSeconds(current.startedAt, safeEndedAt),
    status,
    updatedAt: nextUpdatedAt
  });

  const visitor = await readVisitorState(current.visitorId);
  if (visitor?.activeVisitSessionId === current.sessionId) {
    await saveVisitorState({
      ...visitor,
      activeVisitSessionId: "",
      lastActiveAt: getVisitSessionLastActivityAt(nextSession) || visitor.lastActiveAt || visitor.updatedAt,
      updatedAt: nextUpdatedAt
    });
  }

  return nextSession;
}

async function closeTimedOutVisitSessions(referenceTime = Date.now()) {
  const sessions = await listVisitSessions();
  const nowMs = Number(referenceTime);
  const timedOutSessions = sessions.filter((session) => {
    if (session.status !== "active") return false;
    const lastActivityAtMs = parseIsoTime(getVisitSessionLastActivityAt(session));
    if (!Number.isFinite(lastActivityAtMs)) return false;
    return nowMs - lastActivityAtMs >= VISIT_SESSION_TIMEOUT_MS;
  });

  await Promise.all(
    timedOutSessions.map((session) =>
      finalizeVisitSession(session, {
        status: "timed_out",
        endedAt: session.lastHeartbeatAt || session.startedAt || new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString()
      })
    )
  );
}

async function getVisitorState(req) {
  const existing = await readVisitorState(req.visitorId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const settings = await readAppSettings();
  return saveVisitorState({
    visitorId: req.visitorId,
    tier: "anonymous",
    quotaLimit: normalizeAnonymousQuotaLimit(settings.anonymousQuotaLimit),
    quotaUsed: 0,
    invitedAt: null,
    contactMessage: DEFAULT_CONTACT_MESSAGE,
    createdAt: now,
    updatedAt: now
  });
}

async function readAppSettings() {
  try {
    const parsed = JSON.parse(await readFile(appSettingsPath, "utf-8"));
    return normalizeAppSettings(parsed);
  } catch (error) {
    if (error.code === "ENOENT") return normalizeAppSettings({});
    throw error;
  }
}

async function saveAppSettings(settings) {
  const safeSettings = normalizeAppSettings(settings);
  await writeFile(appSettingsPath, `${JSON.stringify(safeSettings, null, 2)}\n`, "utf-8");
  return safeSettings;
}

async function readStoredApiProviders() {
  return readStoredApiProvidersSync();
}

async function saveStoredApiProviders(providers) {
  const safeProviders = normalizeStoredApiProviders(providers);
  await writeFile(apiProviderDataPath, `${JSON.stringify(safeProviders, null, 2)}\n`, "utf-8");
  return safeProviders;
}

function normalizeAppSettings(settings) {
  return {
    anonymousQuotaLimit: normalizeAnonymousQuotaLimit(settings?.anonymousQuotaLimit),
    defaultCoinBonus: normalizeWalletBonus(settings?.defaultCoinBonus, WEB_SIGNUP_CREDITS),
    defaultBeanBonus: normalizeWalletBonus(settings?.defaultBeanBonus, WEB_SIGNUP_BEANS),
    defaultImageProviderId: normalizeImageProviderId(settings?.defaultImageProviderId),
    fridgeMagnetOrderingEnabled: settings?.fridgeMagnetOrderingEnabled === true,
    fridgeMagnetUnitPriceCents: normalizeMoneyCents(settings?.fridgeMagnetUnitPriceCents, DEFAULT_FRIDGE_MAGNET_UNIT_PRICE_CENTS),
    singleItemShippingFeeCents: normalizeMoneyCents(settings?.singleItemShippingFeeCents, DEFAULT_SINGLE_ITEM_SHIPPING_FEE_CENTS),
    bodyBookOrderingEnabled: settings?.bodyBookOrderingEnabled === true,
    bodyBookPriceCents: normalizeMoneyCents(settings?.bodyBookPriceCents, DEFAULT_BODY_BOOK_PRICE_CENTS),
    bodyBookShippingFeeCents: normalizeMoneyCents(settings?.bodyBookShippingFeeCents, DEFAULT_BODY_BOOK_SHIPPING_FEE_CENTS),
    paymentMode: normalizeOrderPaymentMode(settings?.paymentMode),
    manualPaymentExpireDays: normalizeManualPaymentExpireDays(settings?.manualPaymentExpireDays),
    contactWechatId: normalizeContactWechatId(settings?.contactWechatId)
  };
}

function normalizeAnonymousQuotaLimit(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return DEFAULT_VISITOR_ANONYMOUS_LIMIT;
  return Math.min(Math.max(Math.round(next), 1), 50);
}

function normalizeInviteBonus(value, fallback = 5) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(Math.round(next), 0), 999);
}

function normalizeBrowserDescription(value) {
  const browser = String(value || "").trim();
  return browser.slice(0, 80);
}

function describeRequestBrowser(req) {
  const userAgent = String(req?.headers?.["user-agent"] || "");
  if (!userAgent) return "未知浏览器";
  const platform = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? "iOS"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Macintosh/i.test(userAgent)
          ? "macOS"
          : "其他";
  const browser = /MicroMessenger/i.test(userAgent)
    ? "微信"
    : /Edg\//i.test(userAgent)
      ? "Edge"
      : /CriOS/i.test(userAgent)
        ? "Chrome"
        : /Chrome\//i.test(userAgent)
          ? "Chrome"
          : /Firefox\//i.test(userAgent)
            ? "Firefox"
            : /Safari\//i.test(userAgent)
              ? "Safari"
              : "其他浏览器";
  return `${browser} · ${platform}`;
}

function normalizeWalletBonus(value, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(Math.round(next), 0), 999);
}

function normalizeInviteQuotaBonus(value) {
  return normalizeInviteBonus(value, VISITOR_INVITE_BONUS);
}

function normalizeApiProviderId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 48);
}

function normalizeApiProviderName(value, fallback = "") {
  const next = String(value || "").trim();
  return next || String(fallback || "").trim();
}

function normalizeApiProviderBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/g, "");
}

function normalizeApiProviderModel(value, fallback) {
  const next = String(value || "").trim();
  return next || fallback;
}

function normalizeApiProviderRoute(value, fallback = "images") {
  const next = String(value || "").trim().toLowerCase();
  if (next === "responses") return "responses";
  if (next === "chat_completions" || next === "chat-completions" || next === "chat") return "chat_completions";
  if (next === "images") return "images";
  return fallback;
}

function normalizeImageFailoverMode(value, fallback = "auto") {
  const next = String(value || "").trim().toLowerCase();
  if (["stop", "strict", "error", "disabled", "off"].includes(next)) return "stop";
  if (["auto", "fallback", "on", "enabled"].includes(next)) return "auto";
  return fallback;
}

function normalizeApiProviderEnabled(value, fallback = true) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  if (typeof value === "boolean") return value;
  const next = String(value || "").trim().toLowerCase();
  if (["false", "0", "no", "off", "disabled"].includes(next)) return false;
  if (["true", "1", "yes", "on", "enabled"].includes(next)) return true;
  return Boolean(fallback);
}

function parseProviderIdList(value) {
  return String(value || "")
    .split(",")
    .map((item) => normalizeApiProviderId(item))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeStoredApiProvider(provider) {
  const id = normalizeApiProviderId(provider?.id);
  if (!id) return null;

  return {
    id,
    name: normalizeApiProviderName(provider?.name, id),
    baseUrl: normalizeApiProviderBaseUrl(provider?.baseUrl),
    apiKey: String(provider?.apiKey || "").trim(),
    model: normalizeApiProviderModel(provider?.model, process.env.OPENAI_IMAGE_MODEL || "gpt-image-2"),
    route: normalizeApiProviderRoute(provider?.route, "images"),
    visionModel: normalizeApiProviderModel(provider?.visionModel, process.env.OPENAI_VISION_MODEL || DEFAULT_SUBJECT_CLASSIFIER_MODEL),
    enabled: normalizeApiProviderEnabled(provider?.enabled, true)
  };
}

function normalizeStoredApiProviders(providers) {
  if (!Array.isArray(providers)) return [];

  const normalized = [];
  const seenIds = new Set();

  providers.forEach((provider) => {
    const safeProvider = normalizeStoredApiProvider(provider);
    if (!safeProvider || seenIds.has(safeProvider.id)) return;
    seenIds.add(safeProvider.id);
    normalized.push(safeProvider);
  });

  return normalized;
}

function readStoredApiProvidersSync() {
  try {
    if (!existsSync(apiProviderDataPath)) return [];
    const parsed = JSON.parse(readFileSync(apiProviderDataPath, "utf-8"));
    return normalizeStoredApiProviders(parsed);
  } catch (error) {
    console.warn("Failed to read stored API providers.", error?.message || error);
    return [];
  }
}

function createPublicError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

function normalizeAdminApiProviderPayload(payload, options = {}) {
  const providerId = normalizeApiProviderId(options.providerId || payload?.id);
  if (!providerId) {
    throw createPublicError("供应商 ID 只能包含字母、数字、- 和 _。");
  }

  const safeProvider = normalizeStoredApiProvider({
    ...payload,
    id: providerId
  });

  if (!safeProvider) {
    throw createPublicError("供应商配置无效。");
  }

  if (safeProvider.enabled) {
    if (!safeProvider.baseUrl) {
      throw createPublicError("启用中的供应商必须填写 Base URL。");
    }
    if (!isUsableApiKey(safeProvider.apiKey)) {
      throw createPublicError("启用中的供应商必须填写有效的 API Key。");
    }
  }

  return safeProvider;
}

function getApiProviderSourceLabel(source) {
  if (source === "env") return ".env";
  if (source === "env+page") return "页面覆盖 .env";
  return "页面配置";
}

function toAdminApiProvider(provider) {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: provider.model,
    route: provider.route,
    visionModel: provider.visionModel,
    enabled: provider.enabled !== false,
    source: provider.source,
    sourceLabel: getApiProviderSourceLabel(provider.source),
    hasEnvFallback: provider.hasEnvFallback === true
  };
}

function getImageProviderFailoverMode() {
  return normalizeImageFailoverMode(process.env.IMAGE_API_FAILOVER_MODE, "auto");
}

function mergeConfiguredProviders(envProviders, storedProviders) {
  const mergedProviders = [];
  const storedById = new Map((storedProviders || []).map((provider) => [provider.id, provider]));

  (envProviders || []).forEach((envProvider) => {
    const override = storedById.get(envProvider.id);
    if (override) {
      storedById.delete(envProvider.id);
    }

    mergedProviders.push({
      ...envProvider,
      ...(override || {}),
      id: envProvider.id,
      name: normalizeApiProviderName(override?.name, envProvider.name),
      baseUrl: normalizeApiProviderBaseUrl(override?.baseUrl || envProvider.baseUrl),
      apiKey: String(override?.apiKey || envProvider.apiKey || "").trim(),
      model: normalizeApiProviderModel(override?.model, envProvider.model),
      route: normalizeApiProviderRoute(override?.route, envProvider.route),
      visionModel: normalizeApiProviderModel(override?.visionModel, envProvider.visionModel),
      enabled: override ? override.enabled !== false : envProvider.enabled !== false,
      source: override ? "env+page" : "env",
      hasEnvFallback: true
    });
  });

  storedById.forEach((provider) => {
    mergedProviders.push({
      ...provider,
      source: "page",
      hasEnvFallback: false
    });
  });

  return mergedProviders;
}

function getAdminApiProviderConfigs() {
  return mergeConfiguredProviders(getEnvImageProviders(), readStoredApiProvidersSync()).map(toAdminApiProvider);
}

async function buildAdminApiProviderResponse() {
  const settings = await readAppSettings();
  const providers = getAdminApiProviderConfigs();
  return {
    defaultProviderId: getDefaultProviderId(getImageProviders(), settings),
    failoverMode: getImageProviderFailoverMode(),
    providerPriorityIds: providers.map((provider) => provider.id),
    providers
  };
}

function parseEnvAssignmentLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const separator = trimmed.indexOf("=");
  if (separator < 1) return null;
  return {
    key: trimmed.slice(0, separator).trim(),
    value: trimmed.slice(separator + 1)
  };
}

function readLocalEnvLines() {
  if (!existsSync(localEnvPath)) return [];
  return readFileSync(localEnvPath, "utf-8").split(/\r?\n/);
}

function formatLocalEnvValue(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function setLocalEnvKey(lines, key, value) {
  const rendered = `${key}=${formatLocalEnvValue(value)}`;
  const nextLines = [];
  let replaced = false;

  lines.forEach((line) => {
    const parsed = parseEnvAssignmentLine(line);
    if (parsed?.key === key) {
      if (!replaced) {
        nextLines.push(rendered);
        replaced = true;
      }
      return;
    }
    nextLines.push(line);
  });

  if (!replaced) nextLines.push(rendered);
  return nextLines;
}

function removeLocalEnvKey(lines, key) {
  return lines.filter((line) => parseEnvAssignmentLine(line)?.key !== key);
}

async function writeLocalEnvLines(lines) {
  const nextLines = Array.isArray(lines) ? [...lines] : [];
  while (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") nextLines.pop();
  await writeFile(localEnvPath, `${nextLines.join("\n")}\n`, "utf-8");
}

async function mutateLocalEnv(mutator) {
  let lines = readLocalEnvLines();
  const touchedValues = new Map();

  const api = {
    set(key, value) {
      lines = setLocalEnvKey(lines, key, value);
      touchedValues.set(key, String(value ?? ""));
    },
    remove(key) {
      lines = removeLocalEnvKey(lines, key);
      touchedValues.set(key, null);
    }
  };

  await mutator(api);
  await writeLocalEnvLines(lines);

  touchedValues.forEach((value, key) => {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  });
}

function getImageProviderEnvVariableNames(providerId) {
  const key = providerEnvKey(providerId);
  return [
    `IMAGE_API_${key}_NAME`,
    `IMAGE_API_${key}_BASE_URL`,
    `IMAGE_API_${key}_KEY`,
    `IMAGE_API_${key}_MODEL`,
    `IMAGE_API_${key}_ROUTE`,
    `IMAGE_API_${key}_VISION_MODEL`,
    `IMAGE_API_${key}_ENABLED`
  ];
}

async function saveAdminApiProviderToEnv(provider, options = {}) {
  const currentPriorityIds = parseProviderIdList(process.env.IMAGE_API_PROVIDERS);
  const nextPriorityIds = currentPriorityIds.includes(provider.id)
    ? currentPriorityIds
    : currentPriorityIds.concat(provider.id);

  const key = providerEnvKey(provider.id);
  await mutateLocalEnv((env) => {
    env.set("IMAGE_API_PROVIDERS", nextPriorityIds.join(","));
    env.set(`IMAGE_API_${key}_NAME`, provider.name);
    env.set(`IMAGE_API_${key}_BASE_URL`, provider.baseUrl);
    env.set(`IMAGE_API_${key}_KEY`, provider.apiKey);
    env.set(`IMAGE_API_${key}_MODEL`, provider.model);
    env.set(`IMAGE_API_${key}_ROUTE`, provider.route || "images");
    env.set(`IMAGE_API_${key}_VISION_MODEL`, provider.visionModel || DEFAULT_SUBJECT_CLASSIFIER_MODEL);
    env.set(`IMAGE_API_${key}_ENABLED`, provider.enabled ? "true" : "false");
  });

  const storedProviders = await readStoredApiProviders();
  if (storedProviders.some((item) => item.id === provider.id)) {
    await saveStoredApiProviders(storedProviders.filter((item) => item.id !== provider.id));
  }

  return buildAdminApiProviderResponse();
}

async function deleteAdminApiProviderFromEnv(providerId) {
  const currentPriorityIds = parseProviderIdList(process.env.IMAGE_API_PROVIDERS);
  const nextPriorityIds = currentPriorityIds.filter((item) => item !== providerId);
  const envKeys = getImageProviderEnvVariableNames(providerId);

  await mutateLocalEnv((env) => {
    if (nextPriorityIds.length) env.set("IMAGE_API_PROVIDERS", nextPriorityIds.join(","));
    else env.remove("IMAGE_API_PROVIDERS");

    envKeys.forEach((key) => env.remove(key));

    if (normalizeApiProviderId(process.env.IMAGE_API_PROVIDER) === providerId) {
      env.remove("IMAGE_API_PROVIDER");
    }
  });

  const storedProviders = await readStoredApiProviders();
  if (storedProviders.some((item) => item.id === providerId)) {
    await saveStoredApiProviders(storedProviders.filter((item) => item.id !== providerId));
  }

  const settings = await readAppSettings();
  if (settings.defaultImageProviderId === providerId) {
    await saveAppSettings({
      ...settings,
      defaultImageProviderId: ""
    });
  }

  return buildAdminApiProviderResponse();
}

async function saveAdminApiProviderSettings(payload) {
  const adminProviders = getAdminApiProviderConfigs();
  const knownIds = new Set(adminProviders.map((provider) => provider.id));
  const currentPriorityIds = adminProviders.map((provider) => provider.id);
  const requestedPriorityIds = Array.isArray(payload?.providerPriorityIds)
    ? payload.providerPriorityIds.map((item) => normalizeApiProviderId(item)).filter(Boolean)
    : currentPriorityIds;
  const orderedPriorityIds = requestedPriorityIds
    .filter((item, index, list) => list.indexOf(item) === index)
    .filter((item) => knownIds.has(item))
    .concat(currentPriorityIds.filter((item) => !requestedPriorityIds.includes(item)));

  const enabledProviders = getImageProviders();
  const defaultProviderId = normalizeImageProviderId(payload?.defaultProviderId, enabledProviders);
  const failoverMode = normalizeImageFailoverMode(payload?.failoverMode, getImageProviderFailoverMode());

  await mutateLocalEnv((env) => {
    if (orderedPriorityIds.length) env.set("IMAGE_API_PROVIDERS", orderedPriorityIds.join(","));
    else env.remove("IMAGE_API_PROVIDERS");

    if (defaultProviderId) env.set("IMAGE_API_PROVIDER", defaultProviderId);
    else env.remove("IMAGE_API_PROVIDER");

    env.set("IMAGE_API_FAILOVER_MODE", failoverMode);
  });

  const settings = await readAppSettings();
  if (settings.defaultImageProviderId) {
    await saveAppSettings({
      ...settings,
      defaultImageProviderId: ""
    });
  }

  return buildAdminApiProviderResponse();
}

function normalizeImageProviderId(value, providers = getImageProviders()) {
  const next = String(value || "").trim();
  if (!next) return "";
  return providers.some((provider) => provider.id === next) ? next : "";
}

function normalizeMoneyCents(value, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(Math.round(next), 0), 99999999);
}

function normalizeOrderPaymentMode(value) {
  const next = String(value || DEFAULT_ORDER_PAYMENT_MODE).trim();
  return ORDER_PAYMENT_MODE_VALUES.has(next) ? next : DEFAULT_ORDER_PAYMENT_MODE;
}

function normalizeManualPaymentExpireDays(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return DEFAULT_MANUAL_PAYMENT_EXPIRE_DAYS;
  return Math.min(Math.max(Math.round(next), 1), 365);
}

function normalizeContactWechatId(value) {
  const next = String(value || "").trim();
  return next || DEFAULT_CONTACT_WECHAT_ID;
}

function normalizeMerchantId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}

function getMerchantSigningSecret() {
  return String(
    process.env.MERCHANT_SOURCE_SIGNING_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "prompt-gallery-local-merchant-source"
  );
}

function createMerchantSignature(merchantId) {
  const safeMerchantId = normalizeMerchantId(merchantId);
  const digest = createHmac("sha256", getMerchantSigningSecret())
    .update(safeMerchantId)
    .digest()
    .subarray(0, MERCHANT_SIGNATURE_BYTES);
  return Buffer.from(digest).toString("base64url");
}

function isValidMerchantSignature(merchantId, signature) {
  return safeCompareString(createMerchantSignature(merchantId), String(signature || "").trim());
}

function buildRequestOrigin(req) {
  const configuredOrigin = String(
    process.env.PUBLIC_SITE_URL ||
    process.env.APP_PUBLIC_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    ""
  ).trim().replace(/\/+$/g, "");
  if (configuredOrigin) return configuredOrigin;
  const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const proto = forwardedProto || req.protocol || (shouldUseSecureCookies(req) ? "https" : "http");
  const host = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}

function buildMerchantLandingUrl(req, merchantId) {
  const origin = buildRequestOrigin(req);
  const safeMerchantId = normalizeMerchantId(merchantId);
  const signature = createMerchantSignature(safeMerchantId);
  const url = new URL(`/q/${safeMerchantId}/${signature}`, origin || "http://localhost");
  return origin ? url.toString() : `${url.pathname}${url.search}`;
}

function toPublicMerchant(req, merchant) {
  if (!merchant) return null;
  return {
    id: merchant.id,
    name: merchant.name,
    status: merchant.status,
    commissionRateBps: merchant.commissionRateBps,
    note: merchant.note,
    landingUrl: buildMerchantLandingUrl(req, merchant.id),
    signature: createMerchantSignature(merchant.id),
    createdAt: merchant.createdAt,
    updatedAt: merchant.updatedAt
  };
}

function getActiveVisitorMerchantSource(visitor) {
  const safeVisitor = normalizeVisitorState(visitor);
  if (!safeVisitor.sourceMerchantId || !safeVisitor.sourceExpiresAt) return null;
  return {
    sourceMerchantId: safeVisitor.sourceMerchantId,
    sourceMerchantName: safeVisitor.sourceMerchantName,
    sourceClaimedAt: safeVisitor.sourceClaimedAt,
    sourceExpiresAt: safeVisitor.sourceExpiresAt
  };
}

async function claimMerchantSourceForVisitor(req, merchantId, signature) {
  const safeMerchantId = normalizeMerchantId(merchantId);
  if (!safeMerchantId || !signature) throw createHttpError(400, "缺少商户来源参数。");
  if (!isValidMerchantSignature(safeMerchantId, signature)) throw createHttpError(400, "商户来源签名无效。");

  const merchant = await merchantStore.readMerchantById(safeMerchantId);
  if (!merchant || merchant.status !== "active") throw createHttpError(404, "商户不存在或已停用。");

  const visitor = await getVisitorState(req);
  const currentSource = getActiveVisitorMerchantSource(visitor);
  if (currentSource?.sourceMerchantId) {
    return {
      visitor,
      claimedNow: false,
      locked: true
    };
  }

  const now = new Date();
  const sourceExpiresAt = new Date(now.getTime() + MERCHANT_SOURCE_LOCK_MS).toISOString();
  const nextVisitor = await saveVisitorState({
    ...visitor,
    sourceMerchantId: merchant.id,
    sourceMerchantName: merchant.name,
    sourceClaimedAt: now.toISOString(),
    sourceExpiresAt,
    updatedAt: now.toISOString()
  });

  return {
    visitor: nextVisitor,
    claimedNow: true,
    locked: true
  };
}

async function resolveOrderMerchantSource(req) {
  const visitor = await getVisitorState(req);
  const activeSource = getActiveVisitorMerchantSource(visitor);
  if (!activeSource?.sourceMerchantId) {
    return {
      sourceMerchantId: "",
      sourceMerchantName: "",
      commissionRateBps: 0,
      sourceClaimedAt: null
    };
  }

  const merchant = await merchantStore.readMerchantById(activeSource.sourceMerchantId);
  if (!merchant || merchant.status !== "active") {
    return {
      sourceMerchantId: activeSource.sourceMerchantId,
      sourceMerchantName: activeSource.sourceMerchantName,
      commissionRateBps: 0,
      sourceClaimedAt: activeSource.sourceClaimedAt || null
    };
  }

  return {
    sourceMerchantId: merchant.id,
    sourceMerchantName: merchant.name,
    commissionRateBps: merchant.commissionRateBps,
    sourceClaimedAt: activeSource.sourceClaimedAt || null
  };
}

function sanitizeFilesystemSegment(value, fallback = "item") {
  const normalized = String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "")
    .trim();
  return normalized || fallback;
}

function extensionForContentType(contentType = "") {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.includes("image/png")) return ".png";
  if (normalized.includes("image/jpeg")) return ".jpg";
  if (normalized.includes("image/webp")) return ".webp";
  return "";
}

function extensionForRemoteUrl(url) {
  try {
    const pathname = new URL(String(url || "")).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return ext;
  } catch {}
  return "";
}

async function resolveOrderOriginalCandidates(order) {
  const archivedCandidates = await resolveArchivedOrderOriginalCandidates(order);
  const items = Array.isArray(order?.items)
    ? order.items.slice().sort((left, right) => Number(left?.sortOrder || 0) - Number(right?.sortOrder || 0))
    : [];
  const archivedSortOrders = new Set(archivedCandidates.map((candidate) => Number(candidate.sortOrder)).filter(Number.isFinite));
  const jobs = await Promise.all(items.map((item) => readImageJob(item.jobId)));
  const candidates = [...archivedCandidates];
  const seenKeys = new Set();

  archivedCandidates.forEach((candidate) => {
    if (candidate.sourceType === "archived") seenKeys.add(`archived:${candidate.archivedFilePath}`);
    if (candidate.sourceType === "stored") seenKeys.add(`stored:${candidate.storedFilePath}`);
  });

  jobs.forEach((job, index) => {
    const item = items[index];
    const sortOrder = Number(item?.sortOrder ?? index);
    if (archivedSortOrders.has(sortOrder)) return;
    if (!job?.jobId) return;

    const generatedFilePath = path.join(generatedImageRoot, path.basename(String(job?.result?.imageUrl || "")));
    const hasGeneratedImage = String(job?.result?.imageUrl || "").startsWith("/generated-images/");
    if (hasGeneratedImage) {
      const key = `generated:${generatedFilePath}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        candidates.push({
          sourceType: "generated",
          jobId: job.jobId,
          sortOrder,
          generatedFilePath,
          mimeType: String(job?.result?.mimeType || "")
        });
      }
    }

    const remoteUrl = String(job?.result?.originalImageUrl || "").trim();
    if (remoteUrl && !hasGeneratedImage) {
      const key = `remote:${remoteUrl}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        candidates.push({
          sourceType: "remote",
          jobId: job.jobId,
          sortOrder,
          remoteUrl
        });
      }
    }
  });

  return candidates.sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
}

async function resolveArchivedOrderOriginalCandidates(order) {
  const dir = path.join(orderOriginalArchiveRoot, String(order?.id || ""));
  const entries = (await fileExists(dir))
    ? await readdir(dir, { withFileTypes: true })
    : [];
  const originalEntries = entries.filter((entry) => entry.isFile());
  const items = Array.isArray(order?.items)
    ? order.items.slice().sort((left, right) => Number(left?.sortOrder || 0) - Number(right?.sortOrder || 0))
    : [];

  if (!items.length) {
    return originalEntries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry, index) => ({
        sourceType: "archived",
        jobId: "",
        sortOrder: index,
        archivedFilePath: path.join(dir, entry.name)
      }));
  }

  const archiveByPosition = new Map(originalEntries.map((entry) => [path.parse(entry.name).name, entry]));
  const candidates = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const sortOrder = Number(item?.sortOrder ?? index);
    const archiveName = `original-${String(sortOrder + 1).padStart(2, "0")}`;
    const archivedEntry = archiveByPosition.get(archiveName);
    if (archivedEntry) {
      candidates.push({
        sourceType: "archived",
        jobId: String(item?.jobId || ""),
        sortOrder,
        archivedFilePath: path.join(dir, archivedEntry.name)
      });
      continue;
    }

    // Built-in learning pages are shipped with the product rather than made by
    // an image job. Older orders may not have archived them, so recover the
    // original image from the order asset (or built-in public asset) at download
    // time.
    if (String(order?.experienceType || "") !== "body-book" || !String(item?.jobId || "").startsWith("built-in:")) continue;
    const storedFilePath = resolvePublicAssetFilePath(item?.imageUrl);
    if (storedFilePath && await fileExists(storedFilePath)) {
      candidates.push({
        sourceType: "stored",
        jobId: String(item.jobId),
        sortOrder,
        storedFilePath
      });
    }
  }

  return candidates;
}

function getOrderOriginalBundlePath(order) {
  const orderId = path.basename(String(order?.id || "order"));
  // A versioned path intentionally leaves previous downloads intact, while
  // upgrading old tar-with-a-.zip-extension files and colour-book exports.
  const suffix = isColorBookOrder(order)
    ? `-${ORDER_ORIGINAL_BUNDLE_VERSION}-${COLOR_BOOK_PRINT_BUNDLE_VERSION}`
    : `-${ORDER_ORIGINAL_BUNDLE_VERSION}`;
  return path.join(orderOriginalArchiveRoot, `${orderId}${suffix}.zip`);
}

function isColorBookOrder(order) {
  if (String(order?.experienceType || "") !== "body-book") return false;
  if (String(order?.bodyBookThemeName || "").trim() === String(getBookTheme("color")?.name || "颜色认知书")) return true;
  // Keep older colour-book orders working even when their theme name predates
  // the order metadata field. Built-in object-page IDs are unique to this book.
  return Array.isArray(order?.items) && order.items.some((item) =>
    /^built-in:(?:red|orange|yellow|green|blue|purple|pink|black)-objects$/i.test(String(item?.jobId || ""))
  );
}

function isBodyBookOrder(order) {
  return String(order?.experienceType || "") === "body-book";
}

function queueOrderOriginalImageBundle(order) {
  if (!order?.id || order.paymentStatus !== "paid" || order.fulfillmentStatus === "cancelled") return;
  void ensureOrderOriginalImageBundle(order).catch((error) => {
    console.error(`Failed to prepare original-image ZIP for order ${order.id}.`, error);
  });
}

async function preparePendingShipmentOrderOriginalBundles() {
  const limit = 100;
  let page = 1;
  let prepared = 0;
  while (true) {
    const result = orderStore.listOrders({ orderStatus: "pending_shipment", page, limit });
    for (const order of result.items) {
      try {
        await ensureOrderOriginalImageBundle(order);
        prepared += 1;
      } catch (error) {
        console.error(`Failed to prepare original-image ZIP for pending order ${order.id}.`, error);
      }
    }
    if (page * limit >= result.total) break;
    page += 1;
  }
  if (prepared > 0) console.log(`Prepared original-image ZIPs for ${prepared} pending-shipment orders.`);
}

async function ensureOrderOriginalImageBundle(order) {
  const zipPath = getOrderOriginalBundlePath(order);
  if (await fileExists(zipPath)) {
    return { zipPath, filename: getOrderOriginalBundleFilename(order) };
  }

  const orderId = String(order?.id || "");
  const activeBuild = orderOriginalBundleBuilds.get(orderId);
  if (activeBuild) return activeBuild;

  const build = buildOrderOriginalImageBundle(order)
    .finally(() => orderOriginalBundleBuilds.delete(orderId));
  orderOriginalBundleBuilds.set(orderId, build);
  return build;
}

function getOrderOriginalBundleFilename(order) {
  const folderName = sanitizeFilesystemSegment(`${order.orderNo}_${order.receiverName}_${order.receiverPhone}`, order.orderNo || "order");
  return `${folderName}.zip`;
}

async function buildOrderOriginalImageBundle(order) {
  const candidates = await resolveOrderOriginalCandidates(order);
  if (!candidates.length) {
    throw createHttpError(404, "该历史订单关联的任务原图已被清理，当前无法下载。");
  }

  const folderName = path.basename(getOrderOriginalBundleFilename(order), ".zip");
  await mkdir(storageExportTempRoot, { recursive: true });
  const bundleId = randomUUID();
  const tempDir = path.join(storageExportTempRoot, `order-originals-${bundleId}`);
  const folderPath = path.join(tempDir, folderName);
  const stagingZipPath = path.join(storageExportTempRoot, `order-originals-${bundleId}.zip`);
  const zipPath = getOrderOriginalBundlePath(order);
  const applyColorBookPrintBleed = isColorBookOrder(order);
  await mkdir(folderPath, { recursive: true });

  const downloadedFiles = [];
  const failedSources = [];
  try {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];

      try {
        const source = await readOrderOriginalCandidate(candidate);
        const ext = applyColorBookPrintBleed
          ? ".png"
          : source.extension || extensionForContentType(candidate.mimeType) || ".png";
        const filename = `original-${String(downloadedFiles.length + 1).padStart(2, "0")}${ext}`;
        const filePath = path.join(folderPath, filename);
        if (applyColorBookPrintBleed) {
          await writeColorBookPrintBleedImage({ input: source.input, outputPath: filePath });
        } else if (source.filePath) {
          await copyFile(source.filePath, filePath);
        } else {
          await writeFile(filePath, source.input);
        }
        downloadedFiles.push(filePath);
      } catch (error) {
        failedSources.push({
          sourceType: candidate.sourceType,
          jobId: candidate.jobId,
          message: error.publicMessage || error.message || "下载失败"
        });
      }
    }

    if (!downloadedFiles.length) {
      throw createHttpError(404, failedSources[0]?.message || "该历史订单关联的任务原图已被清理，当前无法下载。");
    }

    // Physical books always carry the same supplied QR-code back cover. It is
    // added after all page originals so print operators can use it directly as
    // the final page, without altering customer artwork or its preview.
    if (isBodyBookOrder(order)) {
      if (!(await fileExists(bodyBookPrintBackCoverPath))) {
        throw createHttpError(500, "服务器未找到认知书固定封底文件。");
      }
      const backCoverPath = path.join(folderPath, `original-${String(downloadedFiles.length + 1).padStart(2, "0")}-封底.jpg`);
      await copyFile(bodyBookPrintBackCoverPath, backCoverPath);
      downloadedFiles.push(backCoverPath);
    }

    await createZipFromDirectory(tempDir, stagingZipPath);
    await mkdir(path.dirname(zipPath), { recursive: true });
    await rename(stagingZipPath, zipPath);
    return {
      downloadedCount: downloadedFiles.length,
      failedSources,
      filename: getOrderOriginalBundleFilename(order),
      folderName,
      zipPath
    };
  } catch (error) {
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await rm(stagingZipPath, { force: true });
  }
}

async function readOrderOriginalCandidate(candidate) {
  if (candidate.sourceType === "archived" || candidate.sourceType === "stored" || candidate.sourceType === "generated") {
    const filePath = candidate.sourceType === "archived"
      ? candidate.archivedFilePath
      : candidate.sourceType === "stored"
        ? candidate.storedFilePath
        : candidate.generatedFilePath;
    if (!(await fileExists(filePath))) {
      const label = candidate.sourceType === "stored" ? "认知书内置认知页原图" : "已保存的生成原图";
      throw createHttpError(404, `服务器未找到${label}。`);
    }
    return { input: filePath, filePath, extension: path.extname(filePath).toLowerCase() };
  }

  if (candidate.sourceType === "remote") {
    const response = await fetch(candidate.remoteUrl);
    if (!response.ok) {
      throw createHttpError(response.status === 404 ? 404 : 502, `下载原图失败：${response.status}`);
    }
    const contentType = String(response.headers.get("content-type") || "");
    return {
      input: Buffer.from(await response.arrayBuffer()),
      filePath: "",
      extension: extensionForContentType(contentType) || extensionForRemoteUrl(candidate.remoteUrl)
    };
  }

  throw createHttpError(400, "不支持的订单原图来源。");
}

async function writeColorBookPrintBleedImage({ input, outputPath }) {
  const sharp = await loadSharpModule();
  if (!sharp) throw createHttpError(500, "服务器未安装印刷出血处理组件。");

  const source = sharp(input, { animated: false });
  const metadata = await source.metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) throw createHttpError(422, "无法读取认知书页面尺寸。");

  const bleed = Math.max(1, Math.round(Math.min(width, height) * COLOR_BOOK_PRINT_BLEED_RATIO));
  const background = await getPrintBleedBackgroundColor(sharp, input, width, height);
  await sharp({
    create: {
      width: width + bleed * 2,
      height: height + bleed * 2,
      channels: 4,
      background
    }
  })
    .composite([{ input, left: bleed, top: bleed }])
    .png()
    .toFile(outputPath);
}

async function getPrintBleedBackgroundColor(sharp, input, width, height) {
  const sampleSize = Math.max(8, Math.min(64, Math.floor(Math.min(width, height) * 0.06)));
  const positions = [
    { left: 0, top: 0 },
    { left: width - sampleSize, top: 0 },
    { left: 0, top: height - sampleSize },
    { left: width - sampleSize, top: height - sampleSize }
  ];
  const samples = [];
  for (const position of positions) {
    const { data, info } = await sharp(input, { animated: false })
      .extract({ ...position, width: sampleSize, height: sampleSize })
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let index = 0; index < data.length; index += info.channels) {
      if (info.channels === 4 && data[index + 3] < 220) continue;
      samples.push([data[index], data[index + 1], data[index + 2]]);
    }
  }
  if (!samples.length) return { r: 255, g: 255, b: 255, alpha: 1 };

  const bins = new Map();
  for (const pixel of samples) {
    const key = pixel.map((channel) => Math.round(channel / 16) * 16).join(",");
    const group = bins.get(key) || [];
    group.push(pixel);
    bins.set(key, group);
  }
  const dominant = [...bins.values()].sort((left, right) => right.length - left.length)[0];
  const median = (values) => values.slice().sort((left, right) => left - right)[Math.floor(values.length / 2)];
  return {
    r: median(dominant.map((pixel) => pixel[0])),
    g: median(dominant.map((pixel) => pixel[1])),
    b: median(dominant.map((pixel) => pixel[2])),
    alpha: 1
  };
}

async function streamOrderOriginalImageBundle(res, bundle) {
  const fileInfo = await stat(bundle.zipPath);
  res.status(200);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Length", String(fileInfo.size));
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(bundle.filename)}`);
  res.setHeader("Cache-Control", "private, no-store");
  const stream = createReadStream(bundle.zipPath);
  stream.on("error", (error) => {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ message: "读取原图压缩包失败。" });
    else res.destroy(error);
  });
  stream.pipe(res);
}

async function buildStoredOrderItems({ orderId, requestedItems, likedJobById }) {
  const storedItems = [];
  const orderAssetDir = path.join(orderAssetPublicRoot, String(orderId || ""));
  const orderOriginalDir = path.join(orderOriginalArchiveRoot, String(orderId || ""));
  await mkdir(orderAssetDir, { recursive: true });
  await mkdir(orderOriginalDir, { recursive: true });

  for (let index = 0; index < requestedItems.length; index += 1) {
    const item = requestedItems[index];
    const job = likedJobById.get(item.jobId);
    const archivedAssets = await archiveOrderItemAssets({
      orderId,
      orderAssetDir,
      orderOriginalDir,
      job,
      itemIndex: index
    });

    storedItems.push({
      orderId,
      jobId: String(job?.jobId || ""),
      styleId: String(job?.styleId || ""),
      styleName: String(job?.styleName || ""),
      imageUrl: archivedAssets.imageUrl,
      thumbnailUrl: archivedAssets.thumbnailUrl,
      quantity: item.quantity,
      sortOrder: index
    });
  }

  return storedItems;
}

async function createBodyBookPhysicalOrder({ req, pricing }) {
  const bodyBookPricing = pricing?.bodyBook || {};
  if (!bodyBookPricing.enabled) throw createHttpError(403, "认知书实体书下单暂未开放。");
  const projectId = String(req.body?.bodyBookProjectId || req.body?.projectId || "").trim();
  const project = await readBodyBookSession(projectId);
  if (!project) throw createHttpError(404, "这本认知书工程不存在或已删除。");
  assertWebAccountOwnsBodyBookSession(req, project);
  const current = await synchronizeBodyBookSession(project);
  const theme = getBookTheme(current.themeId) || getBookTheme("body");
  const hasRequiredPageCount = current.pages.length === getBodyBookSelectionPageCount(theme, current.layoutVersion);
  const pages = getBodyBookPrintPages(current);
  const cover = pages.find((page) => page.key === "cover") || null;
  if (!hasRequiredPageCount || !cover || !pages.length || pages.some((page) => page.status !== "succeeded" || !page.result?.imageUrl || (!page.isBuiltIn && !page.jobId))) {
    throw createHttpError(409, "实体认知书固定为 1 张封面页和 16 张内页，请先调整为正确页数并完成生成后再下单。");
  }

  const address = normalizeOrderAddress(req.body || {});
  assertValidOrderAddress(address);
  const requestedItems = pages.map((page) => ({ jobId: page.isBuiltIn ? `built-in:${page.key}` : page.jobId, quantity: 1 }));
  const sourceJobs = await Promise.all(pages.filter((page) => !page.isBuiltIn).map((page) => readImageJob(page.jobId)));
  if (sourceJobs.some((job) => !job || job.status !== "succeeded" || !job.result?.imageUrl)) {
    throw createHttpError(409, "认知书图片尚未准备完成，请稍后重试。");
  }
  const pageByJobId = new Map(pages.map((page) => [page.jobId, page]));
  const jobsById = new Map(sourceJobs.map((job) => {
    const page = pageByJobId.get(String(job?.jobId || ""));
    return [String(job?.jobId || ""), {
      ...job,
      styleId: "body-book",
      styleName: String(page?.title || job?.styleName || "认知书页面")
    }];
  }));
  pages.filter((page) => page.isBuiltIn).forEach((page) => {
    jobsById.set(`built-in:${page.key}`, {
      jobId: `built-in:${page.key}`,
      status: "succeeded",
      result: page.result,
      styleId: "body-book",
      styleName: String(page.title || "认知书页面")
    });
  });
  const amount = calculateBodyBookOrderAmounts(bodyBookPricing);
  const redemptionEntitlements = commerceStore.getRedemptionEntitlementSummary(req.webAccount.id);
  const usesPrintRedemption = redemptionEntitlements.bodyBookPrintCount > 0;
  const paymentMode = normalizeOrderPaymentMode(pricing?.paymentMode);
  const merchantSource = await resolveOrderMerchantSource(req);
  const now = new Date();
  const createdAt = now.toISOString();
  const orderId = randomUUID();
  const expiresAt = new Date(now.getTime() + getOrderExpireMs(pricing)).toISOString();
  const storedOrderItems = await buildStoredOrderItems({
    orderId,
    requestedItems,
    likedJobById: jobsById
  });
  const discountReservation = usesPrintRedemption ? null : commerceStore.reserveBodyBookDiscount({
    accountId: req.webAccount.id,
    orderId,
    orderTotalCents: amount.totalCents,
    expiresAt
  });
  const beanDiscountCents = discountReservation?.discountCents || 0;
  const payableCents = usesPrintRedemption ? 0 : Math.max(0, amount.totalCents - beanDiscountCents);
  if (usesPrintRedemption) {
    try {
      commerceStore.consumeRedemptionEntitlement({
        accountId: req.webAccount.id,
        entitlementType: "body_book_print",
        quantity: 1,
        referenceId: orderId
      });
    } catch (error) {
      throw createHttpError(409, error.message || "实体认知书兑换券不足。", "实体认知书兑换券不足，请先兑换或联系客服。");
    }
  }
  let created;
  try {
    created = orderStore.createOrder({
    order: {
      id: orderId,
      orderNo: generateOrderNo(),
      visitorId: req.visitorId,
      accountId: req.webAccount.id,
      publicToken: randomUUID(),
      experienceType: "body-book",
      bodyBookThemeName: theme.name,
      paymentStatus: usesPrintRedemption ? "paid" : "unpaid",
      fulfillmentStatus: "new",
      itemCount: amount.itemCount,
      unitPriceCents: amount.unitPriceCents,
      shippingFeeCents: amount.shippingFeeCents,
      subtotalCents: amount.subtotalCents,
      totalCents: amount.totalCents,
      beanDiscountCents,
      payableCents,
      remark: address.remark,
      receiverName: address.receiverName,
      receiverPhone: address.receiverPhone,
      province: address.province,
      city: address.city,
      district: address.district,
      addressDetail: address.addressDetail,
      sourceMerchantId: merchantSource.sourceMerchantId,
      sourceMerchantName: merchantSource.sourceMerchantName,
      commissionRateBps: merchantSource.commissionRateBps,
      sourceClaimedAt: merchantSource.sourceClaimedAt,
      wechatOpenId: "",
      wechatTransactionId: usesPrintRedemption ? `REDEMPTION-${orderId}` : "",
      outTradeNo: generateWechatOutTradeNo("BB"),
      lastPaymentChannel: usesPrintRedemption ? "redemption_code" : (paymentMode === "manual" ? "manual_collection" : ""),
      lastPaymentError: "",
      expiresAt,
      paidAt: usesPrintRedemption ? createdAt : null,
      createdAt,
      updatedAt: createdAt
    },
    items: storedOrderItems,
    initialPaymentEvent: {
      eventType: "order_created",
      eventId: `${orderId}:order_created`,
      success: true,
      payload: {
        projectId: current.sessionId,
        pageCount: pages.length,
        totalCents: amount.totalCents,
        beanDiscountCents,
        payableCents,
        paymentMode,
        usesPrintRedemption
      }
    }
    });
  } catch (error) {
    if (usesPrintRedemption) commerceStore.restoreRedemptionEntitlement({ accountId: req.webAccount.id, entitlementType: "body_book_print", referenceId: orderId });
    else commerceStore.releaseBodyBookDiscountReservation(orderId);
    throw error;
  }
  if (usesPrintRedemption) {
    const paidOrder = orderStore.updateOrderAndAppendEvent(created.id, {}, {
      eventType: "redemption_entitlement_consumed",
      eventId: `redemption:${created.id}`,
      success: true,
      payload: { entitlementType: "body_book_print", quantity: 1 }
    });
    return {
      order: toPublicOrder(paidOrder, { includeToken: true }),
      payment: { status: "already_paid", mode: "redemption_code", expiresAt: created.expiresAt }
    };
  }
  const paymentIntent = commerceStore.createPaymentIntent({
    accountId: req.webAccount.id,
    outTradeNo: created.outTradeNo,
    kind: "body_book_order",
    amountCents: created.payableCents,
    targetOrderId: created.id,
    expiresAt: created.expiresAt,
    metadata: {
      orderNo: created.orderNo,
      projectId: current.sessionId,
      pageCount: pages.length,
      itemCount: amount.itemCount,
      beanDiscountCents,
      payableCents
    }
  });
  if (created.payableCents === 0) {
    const paidAt = new Date().toISOString();
    commerceStore.settlePayment({
      outTradeNo: created.outTradeNo,
      transactionId: `BEAN-DISCOUNT-${created.outTradeNo}`,
      paidAt,
      payload: { mode: "bean_discount", orderId: created.id, orderNo: created.orderNo },
      headers: {}
    });
    const paidOrder = orderStore.updateOrderAndAppendEvent(created.id, {
      paymentStatus: "paid",
      fulfillmentStatus: "new",
      lastPaymentChannel: "bean_discount",
      lastPaymentError: "",
      wechatTransactionId: `BEAN-DISCOUNT-${created.outTradeNo}`,
      paidAt
    }, {
      eventType: "bean_discount_settled",
      eventId: `${created.id}:bean_discount_settled`,
      success: true,
      payload: { beanDiscountCents, payableCents: 0 }
    });
    queueOrderOriginalImageBundle(paidOrder);
    return {
      order: toPublicOrder(paidOrder, { includeToken: true }),
      payment: { status: "already_paid", mode: "bean_discount", expiresAt: created.expiresAt }
    };
  }
  return {
    order: toPublicOrder(created, { includeToken: true }),
    payment: prepareInitialOrderPayment(created, pricing, paymentIntent)
  };
}

async function archiveOrderItemAssets({ orderId, orderAssetDir, orderOriginalDir, job, itemIndex }) {
  const previewFallback = String(job?.result?.previewUrl || job?.result?.thumbnailUrl || "");
  const thumbnailFallback = String(job?.result?.thumbnailUrl || job?.result?.previewUrl || "");
  const previewArchivedUrl = await copyOrderAssetFile({
    assetUrl: previewFallback,
    targetDir: orderAssetDir,
    outputName: `item-${String(itemIndex + 1).padStart(2, "0")}-preview`
  });
  const thumbnailArchivedUrl = await copyOrderAssetFile({
    assetUrl: thumbnailFallback,
    targetDir: orderAssetDir,
    outputName: `item-${String(itemIndex + 1).padStart(2, "0")}-thumbnail`
  });
  await archiveOrderOriginalFile({
    job,
    targetDir: orderOriginalDir,
    outputName: `original-${String(itemIndex + 1).padStart(2, "0")}`
  });

  return {
    imageUrl: previewArchivedUrl || previewFallback || thumbnailArchivedUrl || thumbnailFallback,
    thumbnailUrl: thumbnailArchivedUrl || thumbnailFallback || previewArchivedUrl || previewFallback
  };
}

async function copyOrderAssetFile({ assetUrl, targetDir, outputName }) {
  const sourcePath = resolvePublicAssetFilePath(assetUrl);
  if (!sourcePath || !(await fileExists(sourcePath))) return "";
  const ext = path.extname(sourcePath).toLowerCase() || ".webp";
  const filename = `${outputName}${ext}`;
  const targetPath = path.join(targetDir, filename);
  await copyFile(sourcePath, targetPath);
  return `/order-assets/${path.basename(targetDir)}/${filename}`;
}

async function archiveOrderOriginalFile({ job, targetDir, outputName }) {
  const localImagePath = await resolveJobImageFile(job);
  if (localImagePath && await fileExists(localImagePath)) {
    const ext = path.extname(localImagePath).toLowerCase() || ".png";
    await copyFile(localImagePath, path.join(targetDir, `${outputName}${ext}`));
    return;
  }

  const remoteUrl = String(job?.result?.originalImageUrl || "").trim();
  if (!remoteUrl) return;

  try {
    const response = await fetch(remoteUrl);
    if (!response.ok) return;
    const arrayBuffer = await response.arrayBuffer();
    const contentType = String(response.headers.get("content-type") || "");
    const ext = extensionForContentType(contentType) || extensionForRemoteUrl(remoteUrl) || ".png";
    await writeFile(path.join(targetDir, `${outputName}${ext}`), Buffer.from(arrayBuffer));
  } catch {}
}

function resolvePublicAssetFilePath(assetUrl) {
  const value = String(assetUrl || "").trim();
  if (!value) return "";
  if (value.startsWith("/generated-previews/")) {
    return path.join(generatedPreviewRoot, path.basename(value));
  }
  if (value.startsWith("/generated-thumbnails/")) {
    return path.join(generatedThumbnailRoot, path.basename(value));
  }
  if (value.startsWith("/generated-images/")) {
    return path.join(generatedImageRoot, path.basename(value));
  }
  if (value.startsWith("/order-assets/")) {
    const relativePath = value.replace(/^\/order-assets\//, "").split("/").join(path.sep);
    return path.join(orderAssetPublicRoot, relativePath);
  }
  if (value.startsWith("/body-book-color-pages/")) {
    return path.join(rootDir, "public", "body-book-color-pages", path.basename(value));
  }
  if (value.startsWith("/body-book-preset-pages/")) {
    return path.join(bodyBookPresetPageRoot, path.basename(value));
  }
  return "";
}

async function buildStorageSummary() {
  const [directoryStats, backupFiles, appSettings] = await Promise.all([
    Promise.all([
      summarizeStorageDirectory("任务记录", imageJobRoot, "jobRecords"),
      summarizeStorageDirectory("抽卡会话", drawCardSessionRoot, "drawCardSessions"),
      summarizeStorageDirectory("访客额度", visitorStateRoot, "visitorStates"),
      summarizeStorageDirectory("后台会话", adminSessionRoot, "adminSessions"),
      summarizeStorageDirectory("临时参考图", tempReferenceRoot, "tempReferences"),
      summarizeStorageDirectory("高清原图", generatedImageRoot, "generatedImages"),
      summarizeStorageDirectory("公开预览图", generatedPreviewRoot, "generatedPreviews"),
      summarizeStorageDirectory("任务缩略图", generatedThumbnailRoot, "generatedThumbnails"),
      summarizeStorageDirectory("任务参考图", jobReferenceRoot, "jobReferences"),
      summarizeStorageDirectory("参考图缩略图", jobReferenceThumbnailRoot, "jobReferenceThumbnails")
    ]),
    listStorageBackups(),
    readAppSettings()
  ]);

  return {
    directories: directoryStats,
    backups: backupFiles,
    totals: {
      bytes: directoryStats.reduce((sum, item) => sum + item.bytes, 0),
      files: directoryStats.reduce((sum, item) => sum + item.files, 0)
    },
    cleanupDefaults: {
      retentionDays: normalizeCleanupRetentionDays(appSettings?.storageHistoryRetentionDays)
    }
  };
}

async function summarizeStorageDirectory(label, dirPath, key) {
  const stats = await getDirectoryTreeStats(dirPath);
  return {
    key,
    label,
    path: path.relative(rootDir, dirPath).replace(/\\/g, "/"),
    bytes: stats.bytes,
    files: stats.files,
    directories: stats.directories
  };
}

async function getDirectoryTreeStats(targetPath) {
  if (!(await fileExists(targetPath))) {
    return { bytes: 0, files: 0, directories: 0 };
  }

  const rootStat = await stat(targetPath);
  if (!rootStat.isDirectory()) {
    return {
      bytes: Number(rootStat.size || 0),
      files: 1,
      directories: 0
    };
  }

  let bytes = 0;
  let files = 0;
  let directories = 0;
  const queue = [targetPath];

  while (queue.length) {
    const current = queue.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        directories += 1;
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const entryStat = await stat(fullPath);
      files += 1;
      bytes += Number(entryStat.size || 0);
    }
  }

  return { bytes, files, directories };
}

async function listStorageBackups() {
  await mkdir(storageBackupRoot, { recursive: true });
  const entries = await readdir(storageBackupRoot, { withFileTypes: true });
  const backups = await Promise.all(
    entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === ".zip") return true;
        if (ext !== ".json") return false;
        return !entry.name.endsWith(".backup.json");
      })
      .map((entry) => readStorageBackupMetadata(entry.name))
  );
  return backups
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function createStorageBackup() {
  await mkdir(storageBackupRoot, { recursive: true });
  const now = new Date();
  const backupId = randomUUID();
  const timestamp = formatBackupTimestamp(now);
  const filename = `storage-backup-${timestamp}-${backupId.slice(0, 8)}.json`;
  const payload = {
    meta: {
      backupId,
      kind: BACKUP_KIND_CONFIG,
      filename,
      createdAt: now.toISOString(),
      version: 1
    },
    data: {
      styles: await readStyles(),
      styleGroups: await readStyleGroups(),
      inviteCodes: await readInviteCodes(),
      merchants: await merchantStore.listMerchants(),
      appSettings: await readAppSettings()
    }
  };
  const filePath = getStorageBackupFilePath(filename);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return {
    backupId,
    kind: BACKUP_KIND_CONFIG,
    filename,
    createdAt: payload.meta.createdAt,
    sizeBytes: Buffer.byteLength(`${JSON.stringify(payload, null, 2)}\n`, "utf-8"),
    version: payload.meta.version
  };
}

async function readStorageBackupMetadata(backupId) {
  const filePath = await resolveStorageBackupPathById(backupId);
  if (!filePath) return null;
  const fileStat = await stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const raw = ext === ".json"
    ? JSON.parse(await readFile(filePath, "utf-8"))
    : await readZipBackupSidecar(filePath);
  const meta = raw?.meta || {};
  const kind = String(meta.kind || (ext === ".zip" ? BACKUP_KIND_IMAGE_RANGE : BACKUP_KIND_CONFIG));
  return {
    backupId: String(meta.backupId || backupId),
    kind,
    filename: path.basename(filePath),
    createdAt: meta.createdAt || fileStat.mtime.toISOString(),
    sizeBytes: Number(fileStat.size || 0),
    version: Number(meta.version || 1),
    dateRange: meta.dateRange || null
  };
}

async function resolveStorageBackupPathById(backupId) {
  const normalizedId = String(backupId || "").trim();
  if (!normalizedId) return null;

  const directFilename = normalizedId.endsWith(".json") ? normalizedId : `${normalizedId}.json`;
  const directPath = path.join(storageBackupRoot, directFilename);
  if (await fileExists(directPath)) {
    return directPath;
  }

  const directZipPath = normalizedId.endsWith(".zip") ? path.join(storageBackupRoot, normalizedId) : path.join(storageBackupRoot, `${normalizedId}.zip`);
  if (await fileExists(directZipPath)) {
    return directZipPath;
  }

  const entries = await readdir(storageBackupRoot, { withFileTypes: true });
  const matched = entries.find((entry) => entry.isFile() && [".json", ".zip"].includes(path.extname(entry.name).toLowerCase()) && entry.name.includes(normalizedId));
  if (matched) {
    return path.join(storageBackupRoot, matched.name);
  }

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") continue;
    const fullPath = path.join(storageBackupRoot, entry.name);
    try {
      const raw = JSON.parse(await readFile(fullPath, "utf-8"));
      if (String(raw?.meta?.backupId || "").trim() === normalizedId) {
        if (String(raw?.meta?.kind || "") === BACKUP_KIND_IMAGE_RANGE) {
          const zipPath = getZipPathFromSidecar(fullPath, raw?.meta?.filename);
          if (zipPath && await fileExists(zipPath)) {
            return zipPath;
          }
        }
        return fullPath;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function getStorageBackupFilePath(filename) {
  return path.join(storageBackupRoot, path.basename(String(filename || "")));
}

async function deleteStorageBackup(backupId) {
  const filePath = await resolveStorageBackupPathById(backupId);
  if (!filePath) return false;
  await rm(filePath, { force: true });
  if (path.extname(filePath).toLowerCase() === ".zip") {
    await rm(getZipBackupSidecarPath(filePath), { force: true });
  }
  return true;
}

async function createImageRangeBackup(options) {
  const startDate = normalizeDateInput(options.startDate);
  const endDate = normalizeDateInput(options.endDate);
  if (!startDate) {
    throw createHttpError(400, "请选择开始日期。");
  }
  if (!endDate) {
    throw createHttpError(400, "请选择结束日期。");
  }
  if (startDate > endDate) {
    throw createHttpError(400, "开始日期不能晚于结束日期。");
  }

  const startTime = new Date(`${startDate}T00:00:00`).getTime();
  const endTime = new Date(`${endDate}T23:59:59.999`).getTime();
  const jobItems = await collectImageBackupOriginals(startTime, endTime);
  const tempReferenceItems = await collectImageBackupTempReferences(startTime, endTime);
  const allItems = jobItems.concat(tempReferenceItems).sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));

  if (!allItems.length) {
    throw createHttpError(400, "所选日期范围内没有可备份图片。");
  }

  await mkdir(storageBackupRoot, { recursive: true });
  await mkdir(storageExportTempRoot, { recursive: true });

  const backupId = randomUUID();
  const zipFilename = `${startDate.replace(/-/g, "")}-${endDate.replace(/-/g, "")}.zip`;
  const tempDir = path.join(storageExportTempRoot, backupId);
  const createdAt = new Date().toISOString();

  try {
    await mkdir(tempDir, { recursive: true });
    const manifest = {
      version: 1,
      kind: BACKUP_KIND_IMAGE_RANGE,
      backupId,
      dateRange: { startDate, endDate },
      generatedAt: createdAt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      items: []
    };

    for (const item of allItems) {
      const relativeArchivePath = item.archivePath.replace(/\//g, path.sep);
      const targetPath = path.join(tempDir, relativeArchivePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(item.sourceFilePath, targetPath);
      manifest.items.push({
        type: item.type,
        date: item.date,
        jobId: item.jobId || null,
        referenceId: item.referenceId || null,
        sourcePath: item.sourcePath,
        archivePath: item.archivePath,
        createdAt: item.createdAt
      });
    }

    await writeFile(path.join(tempDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

    const outputPath = path.join(storageBackupRoot, zipFilename);
    const sidecarPath = getZipBackupSidecarPath(outputPath);
    if (await fileExists(outputPath)) {
      await rm(outputPath, { force: true });
    }
    if (await fileExists(sidecarPath)) {
      await rm(sidecarPath, { force: true });
    }
    await createZipFromDirectory(tempDir, outputPath);
    await writeFile(sidecarPath, `${JSON.stringify({
      meta: {
        backupId,
        kind: BACKUP_KIND_IMAGE_RANGE,
        filename: zipFilename,
        createdAt,
        version: 1,
        dateRange: { startDate, endDate }
      }
    }, null, 2)}\n`, "utf-8");

    return {
      backupId,
      kind: BACKUP_KIND_IMAGE_RANGE,
      filename: zipFilename,
      createdAt,
      sizeBytes: Number((await stat(outputPath)).size || 0),
      version: 1,
      dateRange: { startDate, endDate }
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function collectImageBackupOriginals(startTime, endTime) {
  const jobs = await listImageJobs();
  const items = [];

  for (const job of jobs) {
    const imageFilePath = await resolveJobImageFile(job);
    if (!imageFilePath) continue;
    const createdAt = String(job?.createdAt || "");
    const time = new Date(createdAt).getTime();
    if (!Number.isFinite(time) || time < startTime || time > endTime) continue;
    const date = formatArchiveDate(createdAt);
    const filename = path.basename(imageFilePath);
    items.push({
      type: "original",
      date,
      jobId: String(job.jobId || ""),
      referenceId: "",
      sourcePath: toRelativeStoragePath(imageFilePath),
      sourceFilePath: imageFilePath,
      archivePath: `${date}/originals/${filename}`,
      createdAt
    });
  }

  return items;
}

async function collectImageBackupTempReferences(startTime, endTime) {
  if (!(await fileExists(tempReferenceRoot))) return [];
  const entries = await readdir(tempReferenceRoot, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const referenceId = entry.name;
    const dir = path.join(tempReferenceRoot, referenceId);
    const metadataPath = path.join(dir, "metadata.json");
    let metadata = null;

    try {
      metadata = JSON.parse(await readFile(metadataPath, "utf-8"));
    } catch {
      metadata = null;
    }

    const fallbackStat = await stat(dir);
    const createdAt = String(metadata?.createdAt || fallbackStat.mtime.toISOString());
    const time = new Date(createdAt).getTime();
    if (!Number.isFinite(time) || time < startTime || time > endTime) continue;
    const date = formatArchiveDate(createdAt);
    const fileEntries = await readdir(dir, { withFileTypes: true });

    for (const fileEntry of fileEntries) {
      if (!fileEntry.isFile() || fileEntry.name === "metadata.json") continue;
      const filePath = path.join(dir, fileEntry.name);
      items.push({
        type: "temp-reference",
        date,
        jobId: "",
        referenceId,
        sourcePath: toRelativeStoragePath(filePath),
        sourceFilePath: filePath,
        archivePath: `${date}/temp-references/${referenceId}/${fileEntry.name}`,
        createdAt
      });
    }
  }

  return items;
}

function normalizeDateInput(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return text;
}

function formatArchiveDate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeImageJobPage(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_IMAGE_JOB_PAGE;
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) {
    throw createHttpError(400, "页码参数无效。");
  }
  return page;
}

function normalizeImageJobLimit(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_IMAGE_JOB_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw createHttpError(400, "每页数量参数无效。");
  }
  return Math.min(limit, MAX_IMAGE_JOB_LIMIT);
}

function normalizeImageJobQueryStatus(value) {
  const status = String(value || "all").trim() || "all";
  if (!IMAGE_JOB_QUERY_STATUS_VALUES.has(status)) {
    throw createHttpError(400, "任务状态参数无效。");
  }
  return status;
}

function normalizeImageJobSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeImageJobQueryDate(value) {
  if (value === undefined || value === null || value === "") return "";
  const normalized = normalizeDateInput(value);
  if (!normalized) {
    throw createHttpError(400, "日期参数无效。");
  }
  return normalized;
}

function normalizeBooleanQuery(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(text);
}

function matchesImageJobStatus(job, status) {
  if (status === "all") return true;
  return String(job?.status || "") === status;
}

function matchesImageJobLikedOnly(job, likedOnly) {
  if (!likedOnly) return true;
  return Boolean(job?.isLiked);
}

function matchesImageJobDate(job, date) {
  if (!date) return true;
  const createdAt = String(job?.createdAt || "");
  if (!createdAt) return false;
  const time = new Date(createdAt).getTime();
  if (!Number.isFinite(time)) return false;
  return formatArchiveDate(createdAt) === date;
}

function matchesImageJobSearch(job, search, owner = null) {
  if (!search) return true;
  const haystack = [
    job?.jobId,
    job?.prompt,
    job?.styleName,
    job?.styleGroupName,
    owner?.name,
    owner?.email,
    owner?.visitorId,
    owner?.accountId
  ]
    .map((value) => String(value || "").toLowerCase())
    .join("\n");
  return haystack.includes(search);
}

function toRelativeStoragePath(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

async function createZipFromDirectory(sourceDir, outputPath) {
  // GNU tar's `-a` flag does not create a ZIP archive for a `.zip` filename;
  // it silently writes a tar stream instead. Use Python's standard-library
  // zipfile module so downloads are genuine ZIPs on both Windows and Linux.
  const pythonCommand = process.platform === "win32" ? "python" : "python3";
  const script = [
    "import pathlib, sys, zipfile",
    "source = pathlib.Path(sys.argv[1])",
    "output = pathlib.Path(sys.argv[2])",
    "with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:",
    "    for file_path in sorted(path for path in source.rglob('*') if path.is_file()):",
    "        archive.write(file_path, file_path.relative_to(source).as_posix())"
  ].join("\n");
  await execFileAsync(pythonCommand, ["-c", script, sourceDir, outputPath]);
}

function getZipBackupSidecarPath(zipFilePath) {
  const parsed = path.parse(zipFilePath);
  return path.join(parsed.dir, `${parsed.name}.backup.json`);
}

function getZipPathFromSidecar(sidecarPath, filename) {
  if (filename) {
    return path.join(path.dirname(sidecarPath), path.basename(String(filename)));
  }
  const parsed = path.parse(sidecarPath);
  const baseName = parsed.name.replace(/\.backup$/, "");
  return path.join(parsed.dir, `${baseName}.zip`);
}

async function readZipBackupSidecar(zipFilePath) {
  const sidecarPath = getZipBackupSidecarPath(zipFilePath);
  if (!(await fileExists(sidecarPath))) return null;
  try {
    return JSON.parse(await readFile(sidecarPath, "utf-8"));
  } catch {
    return null;
  }
}

async function cleanupStorageHistory(options) {
  const retentionDays = normalizeCleanupRetentionDays(options.retentionDays);
  const beforeTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cleanVisitors = options.cleanVisitors === true;
  const cleanAdminSessions = options.cleanAdminSessions === true;
  const cleanTempReferences = options.cleanTempReferences !== false;
  const clearAllHistory = options.clearAllHistory !== false;

  const result = {
    retentionDays,
    clearAllHistory,
    deleted: {
      imageJobs: 0,
      drawCardSessions: 0,
      visitorStates: 0,
      adminSessions: 0,
      tempReferences: 0
    }
  };

  result.deleted.imageJobs = clearAllHistory ? await cleanupAllImageJobs() : await cleanupImageJobsBefore(beforeTime);
  result.deleted.drawCardSessions = clearAllHistory ? await cleanupAllJsonFiles(drawCardSessionRoot) : await cleanupJsonFilesBefore(drawCardSessionRoot, beforeTime);
  if (cleanVisitors) {
    result.deleted.visitorStates = clearAllHistory ? await cleanupAllJsonFiles(visitorStateRoot) : await cleanupJsonFilesBefore(visitorStateRoot, beforeTime);
  }
  if (cleanAdminSessions) {
    result.deleted.adminSessions = clearAllHistory ? await cleanupAllJsonFiles(adminSessionRoot) : await cleanupJsonFilesBefore(adminSessionRoot, beforeTime);
  }
  if (cleanTempReferences) {
    result.deleted.tempReferences = clearAllHistory ? await cleanupAllDirectories(tempReferenceRoot) : await cleanupDirectoriesBefore(tempReferenceRoot, beforeTime);
  }

  return result;
}

function normalizeCleanupRetentionDays(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return DEFAULT_STORAGE_CLEANUP_DAYS;
  return Math.min(Math.max(Math.round(next), 0), MAX_STORAGE_CLEANUP_DAYS);
}

async function cleanupImageJobsBefore(beforeTime) {
  const jobs = await listImageJobs();
  const targets = jobs.filter((job) => {
    const updatedAt = new Date(job?.updatedAt || job?.completedAt || job?.createdAt || 0).getTime();
    return Number.isFinite(updatedAt) && updatedAt <= beforeTime;
  });
  for (const job of targets) {
    activeImageJobs.get(job.jobId)?.abortController?.abort?.();
    await deleteImageJob(job);
  }
  return targets.length;
}

async function cleanupAllImageJobs() {
  const jobs = await listImageJobs();
  for (const job of jobs) {
    activeImageJobs.get(job.jobId)?.abortController?.abort?.();
    await deleteImageJob(job);
  }
  return jobs.length;
}

async function cleanupAllJsonFiles(dirPath) {
  if (!(await fileExists(dirPath))) return 0;
  const entries = await readdir(dirPath, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    await rm(path.join(dirPath, entry.name), { force: true });
    deleted += 1;
  }
  return deleted;
}

async function cleanupJsonFilesBefore(dirPath, beforeTime) {
  if (!(await fileExists(dirPath))) return 0;
  const entries = await readdir(dirPath, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const fullPath = path.join(dirPath, entry.name);
    const entryStat = await stat(fullPath);
    if (Number(entryStat.mtimeMs || 0) > beforeTime) continue;
    await rm(fullPath, { force: true });
    deleted += 1;
  }
  return deleted;
}

async function cleanupDirectoriesBefore(dirPath, beforeTime) {
  if (!(await fileExists(dirPath))) return 0;
  const entries = await readdir(dirPath, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const entryStat = await stat(fullPath);
    if (Number(entryStat.mtimeMs || 0) > beforeTime) continue;
    await rm(fullPath, { recursive: true, force: true });
    deleted += 1;
  }
  return deleted;
}

async function cleanupAllDirectories(dirPath) {
  if (!(await fileExists(dirPath))) return 0;
  const entries = await readdir(dirPath, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    await rm(path.join(dirPath, entry.name), { recursive: true, force: true });
    deleted += 1;
  }
  return deleted;
}

function formatBackupTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function toPublicVisitorState(visitor) {
  const safeVisitor = normalizeVisitorState(visitor);
  return {
    visitorId: safeVisitor.visitorId,
    tier: safeVisitor.tier,
    quotaLimit: safeVisitor.quotaLimit,
    quotaUsed: safeVisitor.quotaUsed,
    quotaRemaining: Math.max(0, safeVisitor.quotaLimit - safeVisitor.quotaUsed),
    canGenerate: safeVisitor.quotaUsed < safeVisitor.quotaLimit,
    contactMessage: safeVisitor.contactMessage,
    sourceMerchantId: safeVisitor.sourceMerchantId,
    sourceMerchantName: safeVisitor.sourceMerchantName,
    sourceClaimedAt: safeVisitor.sourceClaimedAt,
    sourceExpiresAt: safeVisitor.sourceExpiresAt
  };
}

async function listVisitorStates() {
  await mkdir(visitorStateRoot, { recursive: true });
  const entries = await readdir(visitorStateRoot, { withFileTypes: true });
  const visitors = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readVisitorState(entry.name.replace(/\.json$/, "")))
  );
  return visitors.filter(Boolean);
}

function toPublicAdminVisitor(visitor) {
  const safeVisitor = normalizeVisitorState(visitor);
  return {
    visitorId: safeVisitor.visitorId,
    tier: safeVisitor.tier,
    quotaLimit: safeVisitor.quotaLimit,
    quotaUsed: safeVisitor.quotaUsed,
    quotaRemaining: Math.max(0, safeVisitor.quotaLimit - safeVisitor.quotaUsed),
    sourceMerchantId: safeVisitor.sourceMerchantId,
    sourceMerchantName: safeVisitor.sourceMerchantName,
    sourceClaimedAt: safeVisitor.sourceClaimedAt,
    sourceExpiresAt: safeVisitor.sourceExpiresAt,
    invitedAt: safeVisitor.invitedAt,
    createdAt: safeVisitor.createdAt,
    updatedAt: safeVisitor.updatedAt
  };
}

function toPublicVisitSession(session) {
  const safeSession = normalizeVisitSession(session);
  return {
    sessionId: safeSession.sessionId,
    visitorId: safeSession.visitorId,
    experienceType: safeSession.experienceType,
    route: safeSession.route,
    sourceMerchantId: safeSession.sourceMerchantId,
    sourceMerchantName: safeSession.sourceMerchantName,
    startedAt: safeSession.startedAt,
    lastHeartbeatAt: safeSession.lastHeartbeatAt,
    endedAt: safeSession.endedAt,
    durationSeconds: safeSession.durationSeconds,
    status: safeSession.status,
    createdAt: safeSession.createdAt,
    updatedAt: safeSession.updatedAt
  };
}

function toPublicAdminVisitorRecord(record) {
  const rawLastVisitDurationSeconds = record?.lastVisitDurationSeconds;
  return {
    visitorId: String(record?.visitorId || ""),
    sourceMerchantId: String(record?.sourceMerchantId || ""),
    sourceMerchantName: String(record?.sourceMerchantName || ""),
    lastActiveAt: record?.lastActiveAt || null,
    lastVisitDurationSeconds: rawLastVisitDurationSeconds === null || rawLastVisitDurationSeconds === undefined || rawLastVisitDurationSeconds === ""
      ? null
      : Number.isFinite(Number(rawLastVisitDurationSeconds))
        ? Math.max(0, Math.round(Number(rawLastVisitDurationSeconds)))
        : null,
    generationCount: Math.max(0, Number(record?.generationCount || 0)),
    orderTotalCents: Math.max(0, Number(record?.orderTotalCents || 0)),
    createdAt: record?.createdAt || null,
    updatedAt: record?.updatedAt || null
  };
}

function getOrderPricingSnapshot(settings) {
  const safeSettings = normalizeAppSettings(settings);
  return {
    enabled: safeSettings.fridgeMagnetOrderingEnabled === true,
    unitPriceCents: safeSettings.fridgeMagnetUnitPriceCents,
    singleItemShippingFeeCents: safeSettings.singleItemShippingFeeCents,
    freeShippingItemCount: DEFAULT_FREE_SHIPPING_ITEM_COUNT,
    paymentMode: safeSettings.paymentMode,
    manualPaymentExpireDays: safeSettings.manualPaymentExpireDays,
    contactWechatId: safeSettings.contactWechatId,
    bodyBook: {
      enabled: safeSettings.bodyBookOrderingEnabled === true && safeSettings.bodyBookPriceCents > 0,
      priceCents: safeSettings.bodyBookPriceCents,
      shippingFeeCents: safeSettings.bodyBookShippingFeeCents
    }
  };
}

async function enrichBodyBookOrderThemeName(order) {
  if (!order || order.experienceType !== "body-book" || order.bodyBookThemeName) return order;
  try {
    const fullOrder = orderStore.readOrderWithRelations(order.id);
    const createdEvent = fullOrder?.paymentEvents?.find((event) => event.eventType === "order_created");
    const projectId = String(createdEvent?.payload?.projectId || "").trim();
    const project = projectId ? await readBodyBookSession(projectId) : null;
    const themeName = getBookTheme(project?.themeId)?.name || "";
    return themeName ? { ...order, bodyBookThemeName: themeName } : order;
  } catch {
    return order;
  }
}

function calculateBodyBookOrderAmounts(pricing) {
  const priceCents = normalizeMoneyCents(pricing?.priceCents, DEFAULT_BODY_BOOK_PRICE_CENTS);
  const shippingFeeCents = normalizeMoneyCents(pricing?.shippingFeeCents, DEFAULT_BODY_BOOK_SHIPPING_FEE_CENTS);
  return {
    itemCount: 1,
    unitPriceCents: priceCents,
    shippingFeeCents,
    subtotalCents: priceCents,
    totalCents: priceCents + shippingFeeCents
  };
}

function normalizeBeanPurchaseCount(value) {
  const beanCount = Math.trunc(Number(value || 0));
  if (!Number.isFinite(beanCount) || beanCount < 1 || beanCount > 1000) {
    throw createHttpError(400, "购买数量需为 1 到 1000 之间的整数。");
  }
  return beanCount;
}

function normalizeCoinPurchaseCount(value) {
  const coinCount = Math.trunc(Number(value || 0));
  if (!Number.isFinite(coinCount) || coinCount < 1 || coinCount > 1000) {
    throw createHttpError(400, "购买数量需为 1 到 1000 之间的整数。");
  }
  return coinCount;
}

function getOrderPayableCents(order) {
  return Math.max(0, Math.trunc(Number(order?.payableCents ?? order?.totalCents ?? 0)));
}

function getOrderExpireMs(pricing) {
  const paymentMode = normalizeOrderPaymentMode(pricing?.paymentMode);
  if (paymentMode === "manual") {
    return normalizeManualPaymentExpireDays(pricing?.manualPaymentExpireDays) * 24 * 60 * 60 * 1000;
  }
  return ORDER_PAYMENT_EXPIRE_MS;
}

function prepareInitialOrderPayment(order, pricing, intent) {
  const paymentMode = normalizeOrderPaymentMode(pricing?.paymentMode);
  if (paymentMode !== "manual") {
    return {
      status: "payment_required",
      mode: "wechat",
      expiresAt: order.expiresAt
    };
  }
  commerceStore.markPaymentPrepared(intent.id, {
    channel: "manual_collection",
    eventId: `${order.id}:manual_collection`,
    payload: { mode: "manual", orderNo: order.orderNo }
  });
  return {
    status: "manual_payment_required",
    mode: "manual",
    channel: "manual_collection",
    expiresAt: order.expiresAt
  };
}

function prepareInitialBeanPurchasePayment(intent, pricing) {
  const paymentMode = normalizeOrderPaymentMode(pricing?.paymentMode);
  if (paymentMode !== "manual") {
    return {
      status: "payment_required",
      mode: "wechat",
      expiresAt: intent.expiresAt
    };
  }
  commerceStore.markPaymentPrepared(intent.id, {
    channel: "manual_collection",
    eventId: `${intent.id}:manual_collection`,
    payload: { mode: "manual", purchaseNo: String(intent.metadata?.purchaseNo || "") }
  });
  return {
    status: "manual_payment_required",
    mode: "manual",
    channel: "manual_collection",
    expiresAt: intent.expiresAt
  };
}

function prepareInitialCoinPurchasePayment(intent, pricing) {
  const paymentMode = normalizeOrderPaymentMode(pricing?.paymentMode);
  if (paymentMode !== "manual") {
    return {
      status: "payment_required",
      mode: "wechat",
      expiresAt: intent.expiresAt
    };
  }
  commerceStore.markPaymentPrepared(intent.id, {
    channel: "manual_collection",
    eventId: `${intent.id}:manual_collection`,
    payload: { mode: "manual", purchaseNo: String(intent.metadata?.purchaseNo || "") }
  });
  return {
    status: "manual_payment_required",
    mode: "manual",
    channel: "manual_collection",
    expiresAt: intent.expiresAt
  };
}

async function prepareOrderPayment({ req, order, intent, pricing, oauthCode = "" }) {
  const paymentMode = normalizeOrderPaymentMode(pricing?.paymentMode);
  if (paymentMode === "manual" || order.lastPaymentChannel === "manual_collection") {
    return prepareInitialOrderPayment(order, { ...pricing, paymentMode: "manual" }, intent);
  }
  if (intent.status === "cancelled") throw createHttpError(409, "该订单已取消，无法继续支付。");

  if (!isValidWechatOutTradeNo(order.outTradeNo)) {
    const nextOutTradeNo = generateWechatOutTradeNo(order.experienceType === "body-book" ? "BB" : "FM");
    const repairedOrder = orderStore.replaceOrderOutTradeNo(order.id, nextOutTradeNo);
    const repairedIntent = commerceStore.replacePaymentIntentOutTradeNo(intent.id, nextOutTradeNo);
    if (!repairedOrder || !repairedIntent) throw createHttpError(500, "修复微信支付单失败，请重新下单。", "支付单修复失败，请重新下单。");
    order = repairedOrder;
    intent = repairedIntent;
  }

  const description = order.experienceType === "body-book" ? "宝宝认知书实体书" : "AI 定制冰箱贴";
  if (isMiniProgramRequest(req)) {
    const payment = await createWechatJsapiPayment({
      intent,
      openId: getMiniProgramPaymentOpenId(req),
      description,
      config: assertWechatMiniProgramPaymentConfigured()
    });
    orderStore.updateOrder(order.id, {
      wechatOpenId: String(req.webAccount?.openId || ""),
      lastPaymentChannel: payment.channel,
      lastPaymentError: ""
    });
    return { ...payment, mode: "wechat", expiresAt: order.expiresAt };
  }
  if (isWechatBrowser(req)) {
    if (!oauthCode) {
      return {
        status: "requires_authorization",
        mode: "wechat",
        channel: "wechat_jsapi",
        authorizationUrl: createOrderPaymentAuthorizationUrl(req, order)
      };
    }
    const openId = await fetchWechatOpenId(oauthCode);
    const payment = await createWechatJsapiPayment({ intent, openId, description });
    orderStore.updateOrder(order.id, {
      wechatOpenId: openId,
      lastPaymentChannel: payment.channel,
      lastPaymentError: ""
    });
    return { ...payment, mode: "wechat", expiresAt: order.expiresAt };
  }

  const payment = await createWechatNativePayment({ intent, description });
  orderStore.updateOrder(order.id, {
    lastPaymentChannel: payment.channel,
    lastPaymentError: ""
  });
  return { ...payment, mode: "wechat", expiresAt: order.expiresAt };
}

async function prepareBeanPurchasePayment({ req, intent, pricing, oauthCode = "" }) {
  const paymentMode = normalizeOrderPaymentMode(pricing?.paymentMode);
  if (paymentMode === "manual" || intent.channel === "manual_collection") {
    return prepareInitialBeanPurchasePayment(intent, { ...pricing, paymentMode: "manual" });
  }
  if (intent.status === "cancelled") throw createHttpError(409, "该购买单已取消，无法继续支付。");
  if (!isValidWechatOutTradeNo(intent.outTradeNo)) {
    const repaired = commerceStore.replacePaymentIntentOutTradeNo(intent.id, generateWechatOutTradeNo("BP"));
    if (!repaired) throw createHttpError(500, "修复微信支付单失败，请重新购买。", "支付单修复失败，请重新购买。");
    intent = repaired;
  }
  if (isMiniProgramRequest(req)) {
    const payment = await createWechatJsapiPayment({
      intent,
      openId: getMiniProgramPaymentOpenId(req),
      description: "购买豆豆",
      config: assertWechatMiniProgramPaymentConfigured()
    });
    return { ...payment, mode: "wechat", expiresAt: intent.expiresAt };
  }
  if (isWechatBrowser(req)) {
    if (!oauthCode) {
      return {
        status: "requires_authorization",
        mode: "wechat",
        channel: "wechat_jsapi",
        authorizationUrl: createBeanPurchasePaymentAuthorizationUrl(req, intent)
      };
    }
    const openId = await fetchWechatOpenId(oauthCode);
    const payment = await createWechatJsapiPayment({ intent, openId, description: "购买豆豆" });
    return { ...payment, mode: "wechat", expiresAt: intent.expiresAt };
  }
  const payment = await createWechatNativePayment({ intent, description: "购买豆豆" });
  return { ...payment, mode: "wechat", expiresAt: intent.expiresAt };
}

async function prepareCoinPurchasePayment({ req, intent, pricing, oauthCode = "" }) {
  const paymentMode = normalizeOrderPaymentMode(pricing?.paymentMode);
  if (paymentMode === "manual" || intent.channel === "manual_collection") {
    return prepareInitialCoinPurchasePayment(intent, { ...pricing, paymentMode: "manual" });
  }
  if (intent.status === "cancelled") throw createHttpError(409, "该购买单已取消，无法继续支付。");
  if (!isValidWechatOutTradeNo(intent.outTradeNo)) {
    const repaired = commerceStore.replacePaymentIntentOutTradeNo(intent.id, generateWechatOutTradeNo("CP"));
    if (!repaired) throw createHttpError(500, "修复微信支付单失败，请重新购买。", "支付单修复失败，请重新购买。");
    intent = repaired;
  }
  if (isMiniProgramRequest(req)) {
    const payment = await createWechatJsapiPayment({
      intent,
      openId: getMiniProgramPaymentOpenId(req),
      description: "购买币",
      config: assertWechatMiniProgramPaymentConfigured()
    });
    return { ...payment, mode: "wechat", expiresAt: intent.expiresAt };
  }
  if (isWechatBrowser(req)) {
    if (!oauthCode) {
      return {
        status: "requires_authorization",
        mode: "wechat",
        channel: "wechat_jsapi",
        authorizationUrl: createCoinPurchasePaymentAuthorizationUrl(req, intent)
      };
    }
    const openId = await fetchWechatOpenId(oauthCode);
    const payment = await createWechatJsapiPayment({ intent, openId, description: "购买币" });
    return { ...payment, mode: "wechat", expiresAt: intent.expiresAt };
  }
  const payment = await createWechatNativePayment({ intent, description: "购买币" });
  return { ...payment, mode: "wechat", expiresAt: intent.expiresAt };
}

function calculateOrderAmounts(itemCount, pricing) {
  const safeItemCount = Math.max(0, Number(itemCount || 0));
  const safeUnitPrice = normalizeMoneyCents(pricing?.unitPriceCents, DEFAULT_FRIDGE_MAGNET_UNIT_PRICE_CENTS);
  const safeShipping = normalizeMoneyCents(pricing?.singleItemShippingFeeCents, DEFAULT_SINGLE_ITEM_SHIPPING_FEE_CENTS);
  const subtotalCents = safeItemCount * safeUnitPrice;
  const shippingFeeCents = safeItemCount === 1 ? safeShipping : 0;
  return {
    itemCount: safeItemCount,
    unitPriceCents: safeUnitPrice,
    shippingFeeCents,
    subtotalCents,
    totalCents: subtotalCents + shippingFeeCents
  };
}

function normalizeRequestedOrderItems(payload) {
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  const fallbackJobIds = Array.isArray(payload?.jobIds) ? payload.jobIds : [];
  const sourceItems = rawItems.length
    ? rawItems
    : fallbackJobIds.map((jobId) => ({ jobId, quantity: 1 }));
  const quantitiesByJobId = new Map();

  sourceItems.forEach((rawItem) => {
    const jobId = String(rawItem?.jobId || "").trim();
    if (!jobId) return;

    const quantity = Object.prototype.hasOwnProperty.call(rawItem || {}, "quantity")
      ? normalizeRequestedOrderItemQuantity(rawItem.quantity)
      : 1;
    if (quantity === 0) return;
    const nextQuantity = (quantitiesByJobId.get(jobId) || 0) + quantity;
    if (nextQuantity > 99) {
      throw createHttpError(400, "同款数量需在 1 到 99 之间。");
    }
    quantitiesByJobId.set(jobId, nextQuantity);
  });

  return Array.from(quantitiesByJobId.entries()).map(([jobId, quantity]) => ({
    jobId,
    quantity
  }));
}

function normalizeRequestedOrderItemQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
    throw createHttpError(400, "同款数量需在 0 到 99 之间。");
  }
  return quantity;
}

function normalizeOrderPaymentStatus(value, fallback = "unpaid") {
  const current = String(value || fallback).trim();
  return ORDER_PAYMENT_STATUS_VALUES.has(current) ? current : fallback;
}

function normalizeOrderFulfillmentStatus(value, fallback = "new") {
  const current = String(value || fallback).trim();
  return ORDER_FULFILLMENT_STATUS_VALUES.has(current) ? current : fallback;
}

function normalizeOrderStatus(value, fallback = "pending_payment") {
  const current = String(value || fallback).trim();
  return ORDER_STATUS_VALUES.has(current) ? current : fallback;
}

function maskPhone(phone) {
  const normalized = String(phone || "").replace(/\s+/g, "");
  if (normalized.length < 7) return normalized;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function generateOrderNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  const random = Math.random().toString().slice(2, 8);
  return `FM${year}${month}${day}${hour}${minute}${second}${random}`;
}

function generateWechatOutTradeNo(prefix = "WX") {
  const safePrefix = String(prefix || "WX").replace(/[^0-9A-Za-z]/g, "").slice(0, 6) || "WX";
  const randomPartLength = 32 - safePrefix.length;
  return `${safePrefix}${randomUUID().replace(/-/g, "").slice(0, randomPartLength)}`;
}

function isValidWechatOutTradeNo(value) {
  return /^[0-9A-Za-z_-]{6,32}$/.test(String(value || ""));
}

function buildOrderReturnUrl(req, order) {
  const origin = getRequestOrigin(req);
  const prefix = order?.experienceType === "body-book" ? "/book/orders" : "/fridge/orders";
  return `${origin}${prefix}/${encodeURIComponent(order.id)}?token=${encodeURIComponent(order.publicToken)}`;
}

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const protocol = forwardedProto || (req.secure ? "https" : "http");
  return `${protocol}://${host}`;
}

function getWechatConfig() {
  return {
    appId: String(process.env.WECHAT_PAY_APP_ID || "").trim(),
    mchId: String(process.env.WECHAT_PAY_MCH_ID || "").trim(),
    apiV3Key: String(process.env.WECHAT_PAY_API_V3_KEY || "").trim(),
    serialNo: String(process.env.WECHAT_PAY_SERIAL_NO || "").trim(),
    privateKey: normalizePem(process.env.WECHAT_PAY_PRIVATE_KEY),
    notifyUrl: String(process.env.WECHAT_PAY_NOTIFY_URL || "").trim(),
    oauthRedirectUrl: String(process.env.WECHAT_OAUTH_REDIRECT_URL || "").trim()
  };
}

function getWechatMiniProgramConfig() {
  return {
    appId: String(process.env.WECHAT_MINIPROGRAM_APP_ID || "").trim(),
    appSecret: String(process.env.WECHAT_MINIPROGRAM_APP_SECRET || "").trim()
  };
}

function getWechatMiniProgramPaymentConfig() {
  return {
    ...getWechatConfig(),
    appId: String(process.env.WECHAT_MINIPROGRAM_APP_ID || "").trim()
  };
}

async function fetchWechatMiniProgramIdentity(code) {
  const config = getWechatMiniProgramConfig();
  if (!config.appId || !config.appSecret) {
    throw createHttpError(503, "小程序微信登录未完成配置。", "小程序登录暂未配置完成，请联系管理员。");
  }
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", config.appId);
  url.searchParams.set("secret", config.appSecret);
  url.searchParams.set("js_code", String(code || ""));
  url.searchParams.set("grant_type", "authorization_code");
  const response = await fetch(url, { method: "GET" });
  const payload = await response.json().catch(() => ({}));
  const openId = String(payload.openid || "").trim();
  if (!response.ok || payload.errcode || !openId) {
    throw createHttpError(502, payload.errmsg || "小程序微信登录失败，请稍后重试。");
  }
  return { openId, nickname: "", avatarUrl: "" };
}

function isTrustedWechatAvatarUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && (hostname === "qlogo.cn" || hostname.endsWith(".qlogo.cn"));
  } catch {
    return false;
  }
}

async function fetchTrustedWechatAvatar(avatarUrl) {
  const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  const maxBytes = 3 * 1024 * 1024;
  let currentUrl = String(avatarUrl || "").trim();

  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    if (!isTrustedWechatAvatarUrl(currentUrl)) throw createHttpError(400, "微信头像地址无效。");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch(currentUrl, { redirect: "manual", signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw createHttpError(502, "微信头像跳转失败。");
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!response.ok) throw createHttpError(502, "微信头像加载失败。");

    const contentType = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (!allowedContentTypes.has(contentType) || (contentLength && contentLength > maxBytes)) {
      throw createHttpError(502, "微信头像格式无效。");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maxBytes) throw createHttpError(502, "微信头像文件无效。");
    return { contentType, bytes };
  }

  throw createHttpError(502, "微信头像跳转次数过多。");
}

function normalizeShippingCarrierCode(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) return "";
  return SHIPPING_CARRIER_OPTIONS.find((carrier) =>
    carrier.code === normalized || carrier.aliases.some((alias) => alias.toLowerCase() === normalized)
  )?.code || "";
}

function getShippingCarrierName(value) {
  const carrierCode = normalizeShippingCarrierCode(value);
  return SHIPPING_CARRIER_OPTIONS.find((carrier) => carrier.code === carrierCode)?.name || "";
}

function normalizePem(value) {
  return String(value || "").trim().replace(/\\n/g, "\n");
}

function toPublicWebAccountState(req, account) {
  const publicAccount = toPublicCommerceAccount(account);
  return {
    visitorId: req.visitorId,
    tier: "web_account",
    authenticated: true,
    quotaLimit: publicAccount.coinBalance,
    quotaUsed: 0,
    quotaRemaining: publicAccount.coinBalance,
    canGenerate: publicAccount.accountStatus !== "disabled" && publicAccount.coinBalance > 0,
    contactMessage: publicAccount.accountStatus === "disabled" ? "该账户已被禁用，请联系管理员。" : "冰箱贴订单支付后，按实付金额赠送等额币。",
    account: publicAccount,
    beanPurchaseDiscount: commerceStore.getBodyBookDiscountSummary(publicAccount.id),
    coinPurchaseDiscount: commerceStore.getFridgeCoinDiscountSummary(publicAccount.id),
    redemptionEntitlements: commerceStore.getRedemptionEntitlementSummary(publicAccount.id),
    authorizationUrl: ""
  };
}

function getWebWechatOAuthConfig(req = null) {
  const appId = String(process.env.WECHAT_PAY_APP_ID || "").trim();
  const appSecret = String(process.env.WECHAT_OAUTH_APP_SECRET || "").trim();
  const configuredRedirectUrl = String(process.env.WECHAT_WEB_OAUTH_REDIRECT_URL || "").trim();
  return {
    appId,
    appSecret,
    redirectUrl: configuredRedirectUrl || (req ? `${getRequestOrigin(req)}/api/auth/wechat/callback` : ""),
    stateSecret: String(process.env.WECHAT_OAUTH_STATE_SECRET || appSecret || "").trim()
  };
}

function safeReturnPath(value) {
  const text = String(value || "").trim();
  if (!text) return "/";
  try {
    const parsed = new URL(text, "https://local.invalid");
    if (!parsed.pathname.startsWith("/")) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function createWebWechatOAuthState(returnTo) {
  const config = getWebWechatOAuthConfig();
  if (!config.stateSecret) throw createHttpError(503, "微信网页授权未完成配置：缺少 WECHAT_OAUTH_APP_SECRET。", "微信网页授权尚未配置完成。");
  const payload = Buffer.from(JSON.stringify({
    returnTo: safeReturnPath(returnTo),
    nonce: randomUUID(),
    expiresAt: Date.now() + 10 * 60 * 1000
  }), "utf-8").toString("base64url");
  const signature = createHmac("sha256", config.stateSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyWebWechatOAuthState(value) {
  const [payload, signature] = String(value || "").split(".");
  const config = getWebWechatOAuthConfig();
  if (!payload || !signature || !config.stateSecret) throw createHttpError(400, "微信授权状态无效，请重新发起授权。", "微信授权已失效，请重试。");
  const expected = createHmac("sha256", config.stateSecret).update(payload).digest("base64url");
  if (!safeCompareString(signature, expected)) throw createHttpError(400, "微信授权状态校验失败。", "微信授权已失效，请重试。");
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    throw createHttpError(400, "微信授权状态格式错误。", "微信授权已失效，请重试。");
  }
  if (!Number.isFinite(Number(parsed?.expiresAt)) || Number(parsed.expiresAt) < Date.now()) {
    throw createHttpError(400, "微信授权状态已过期。", "微信授权已过期，请重试。");
  }
  return { returnTo: safeReturnPath(parsed.returnTo) };
}

function createWebWechatAuthorizationUrl(req, returnTo = "/") {
  if (!isWechatBrowser(req)) return "";
  const config = getWebWechatOAuthConfig(req);
  if (!config.appId || !config.appSecret || !config.redirectUrl) return "";
  const state = createWebWechatOAuthState(returnTo);
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(config.appId)}&redirect_uri=${encodeURIComponent(config.redirectUrl)}&response_type=code&scope=snsapi_userinfo&state=${encodeURIComponent(state)}#wechat_redirect`;
}

async function fetchWechatWebUserProfile(code) {
  const config = getWebWechatOAuthConfig();
  if (!config.appId || !config.appSecret) {
    throw createHttpError(503, "微信网页授权未完成配置：缺少 WECHAT_PAY_APP_ID 或 WECHAT_OAUTH_APP_SECRET。", "微信网页授权尚未配置完成。");
  }
  const url = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  url.searchParams.set("appid", config.appId);
  url.searchParams.set("secret", config.appSecret);
  url.searchParams.set("code", String(code || ""));
  url.searchParams.set("grant_type", "authorization_code");
  const response = await fetch(url, { method: "GET" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errcode) throw createHttpError(502, payload.errmsg || "获取微信授权令牌失败。", "微信授权失败，请稍后重试。");
  const accessToken = String(payload.access_token || "").trim();
  const openId = String(payload.openid || "").trim();
  if (!accessToken || !openId) throw createHttpError(502, "微信未返回用户授权信息。", "微信授权失败，请稍后重试。");
  const profileUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
  profileUrl.searchParams.set("access_token", accessToken);
  profileUrl.searchParams.set("openid", openId);
  profileUrl.searchParams.set("lang", "zh_CN");
  const profileResponse = await fetch(profileUrl, { method: "GET" });
  const profilePayload = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok || profilePayload.errcode) {
    throw createHttpError(502, profilePayload.errmsg || "获取微信用户资料失败。", "微信授权失败，请稍后重试。");
  }
  return {
    openId,
    nickname: String(profilePayload.nickname || "").trim(),
    avatarUrl: String(profilePayload.headimgurl || "").trim()
  };
}

function requireWebAccount(req, _res, next) {
  if (req.accountDisabled || req.webAccount?.accountStatus === "disabled") {
    return next(createHttpError(403, "该账户已被禁用，请联系管理员。"));
  }
  if (req.webAccount) return next();
  return next(createHttpError(401, "访客账户初始化失败，请刷新后重试。"));
}

function assertRegisteredAccount(req) {
  if (req.webAccount?.accountStatus === "disabled") throw createHttpError(403, "该账户已被禁用，请联系管理员。");
  if (!req.userSession || !req.webAccount?.isRegistered) {
    throw createHttpError(401, "请先完成注册后再提交定制订单。", "请先注册并登录后再提交定制订单。");
  }
}

function toPublicCommerceAccount(account) {
  if (!account) return null;
  const avatarUrl = String(account.wechatAvatarUrl || "").trim();
  const localAvatarUrl = /^\/account-avatars\/(?:[0-9a-f-]+\.(?:jpg|png|webp)|default-avatar\.svg)$/i.test(avatarUrl) ? avatarUrl : "";
  const defaultNickname = buildDefaultWechatNickname(account.id);
  return {
    id: account.id,
    isGuest: !account.isRegistered,
    isRegistered: Boolean(account.isRegistered),
    username: getAccountDisplayName(account, defaultNickname),
    defaultWechatNickname: defaultNickname,
    hasWechatProfile: Boolean(account.wechatNickname && account.wechatAvatarUrl),
    wechatAvatarUrl: localAvatarUrl || (avatarUrl ? `/api/public/account-avatars/${encodeURIComponent(account.id)}` : "/account-avatars/default-avatar.svg"),
    email: account.email || "",
    accountStatus: account.accountStatus || "active",
    coinBalance: Math.max(0, Number(account.coinBalance ?? account.creditBalance ?? 0)),
    beanBalance: Math.max(0, Number(account.beanBalance || 0)),
    referralBalanceCents: Math.max(0, Number(account.referralBalanceCents || 0)),
    referralPendingCents: Math.max(0, Number(account.referralPendingCents || 0)),
    canRedeemOriginalDownloads: commerceStore.hasOriginalImageDownloadAccess(account.id),
    createdAt: account.createdAt || null
  };
}

function buildDefaultWechatNickname(accountId) {
  const compactId = String(accountId || "").replace(/[^0-9a-f]/gi, "").slice(-10);
  const serial = Number.parseInt(compactId || "0", 16) % 100000000;
  return `小画家${String(serial).padStart(8, "0")}`;
}

function getAccountDisplayName(account, defaultNickname = "") {
  if (!account) return "";
  const username = String(account?.username || "").trim();
  if (username && username !== "微信用户") return username;
  const wechatNickname = String(account?.wechatNickname || "").trim();
  if (wechatNickname && wechatNickname !== "微信用户") return wechatNickname;
  return defaultNickname || buildDefaultWechatNickname(account?.id);
}

function toPublicCreditLedger(entry) {
  return {
    id: entry.id,
    accountId: entry.accountId,
    delta: Number(entry.delta || 0),
    balanceAfter: Number(entry.balanceAfter || 0),
    reason: entry.reason || "",
    referenceType: entry.referenceType || "",
    referenceId: entry.referenceId || "",
    note: entry.note || "",
    createdAt: entry.createdAt || null
  };
}

function toPublicAdminUser(account) {
  const recordType = String(account?.recordType || "registered");
  return {
    id: account.id,
    recordType,
    accountId: String(account.accountId || (recordType === "registered" ? account.id : "")),
    visitorId: String(account.visitorId || ""),
    username: getAccountDisplayName(account),
    email: account.email || "",
    status: account.accountStatus || "active",
    coinBalance: Number(account.coinBalance ?? account.creditBalance ?? 0),
    beanBalance: Number(account.beanBalance || 0),
    registeredAt: account.registeredAt || null,
    lastLoginAt: account.lastLoginAt || null,
    createdAt: account.createdAt || null,
    updatedAt: account.updatedAt || null,
    visitorCount: Number(account.visitorCount || 0),
    orderCount: Number(account.orderCount || 0),
    paidTotalCents: Number(account.paidTotalCents || 0),
    visitorTier: String(account.visitorTier || ""),
    browser: String(account.browser || ""),
    inviter: toPublicAdminInviter(account),
    invitationSource: String(account.invitationSource || "")
  };
}

function toPublicAdminInviter(account) {
  const id = String(account?.inviterAccountId || "");
  if (!id) return null;
  const raw = {
    id,
    username: String(account?.inviterUsername || ""),
    wechatNickname: String(account?.inviterWechatNickname || ""),
    email: String(account?.inviterEmail || "")
  };
  return {
    id,
    name: getAccountDisplayName(raw, raw.email || `用户 ${id.slice(0, 8)}`),
    email: raw.email
  };
}

async function listAdminUserRecords({ page = 1, limit = 20, search = "", status = "", type = "" } = {}) {
  const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 20)), 1), 100);
  const requestedPage = Math.max(Math.trunc(Number(page || 1)), 1);
  const keyword = String(search || "").trim().toLowerCase();
  const safeStatus = ["active", "disabled"].includes(String(status || "")) ? String(status) : "";
  const safeType = ["registered", "visitor"].includes(String(type || "")) ? String(type) : "";
  const [visitors, accounts, jobs, visitSessions] = await Promise.all([
    listVisitorStates(),
    Promise.resolve(commerceStore.listAdminAccounts()),
    listImageJobs(),
    listVisitSessions()
  ]);
  const accountByVisitorId = new Map();
  const visitorGenerationCount = new Map();
  const latestSessionByVisitorId = new Map();
  const visitorById = new Map(visitors.map((visitor) => {
    const safeVisitor = normalizeVisitorState(visitor);
    return [safeVisitor.visitorId, safeVisitor];
  }));
  jobs.forEach((job) => {
    const visitorId = String(job?.ownerVisitorId || "");
    if (!visitorId) return;
    visitorGenerationCount.set(visitorId, Number(visitorGenerationCount.get(visitorId) || 0) + 1);
  });
  visitSessions.forEach((session) => {
    const safeSession = normalizeVisitSession(session);
    if (!safeSession.visitorId) return;
    const current = latestSessionByVisitorId.get(safeSession.visitorId);
    if (!current || String(getVisitSessionLastActivityAt(safeSession) || "").localeCompare(String(getVisitSessionLastActivityAt(current) || "")) > 0) {
      latestSessionByVisitorId.set(safeSession.visitorId, safeSession);
    }
  });
  accounts.forEach((account) => {
    const visitorIds = Array.isArray(account.visitorIds) ? account.visitorIds : [];
    visitorIds.forEach((visitorId) => {
      const current = accountByVisitorId.get(visitorId);
      if (!current || (!current.isRegistered && account.isRegistered)) accountByVisitorId.set(visitorId, account);
    });
    if (account.channel === "browser_guest" && account.openId) {
      const current = accountByVisitorId.get(account.openId);
      if (!current || (!current.isRegistered && account.isRegistered)) accountByVisitorId.set(account.openId, account);
    }
  });
  // Older jobs can already carry the registered account ID while the legacy
  // visitor-to-account mapping is absent. Treat that task ownership as a
  // binding too, so the same person is not shown once as a user and again as
  // an independent visitor.
  jobs.forEach((job) => {
    const visitorId = String(job?.ownerVisitorId || "");
    const account = accounts.find((item) => String(item.id || "") === String(job?.ownerAccountId || ""));
    if (visitorId && account?.isRegistered) accountByVisitorId.set(visitorId, account);
  });
  const latestActivityByAccountId = new Map();
  accounts.forEach((account) => {
    const activity = [account.lastLoginAt];
    const visitorIds = Array.isArray(account.visitorIds) ? account.visitorIds : [];
    visitorIds.forEach((visitorId) => {
      const visitor = visitorById.get(visitorId);
      const session = latestSessionByVisitorId.get(visitorId);
      activity.push(getVisitSessionLastActivityAt(session), visitor?.lastActiveAt, visitor?.updatedAt);
    });
    const latestActivity = activity
      .filter(Boolean)
      .map((value) => String(value))
      .sort()
      .at(-1) || null;
    latestActivityByAccountId.set(account.id, latestActivity);
  });

  const records = [
    ...accounts
      .filter((account) => account.isRegistered)
      .map((account) => ({
        ...account,
        recordType: "registered",
        accountId: account.id,
        visitorId: "",
        lastLoginAt: latestActivityByAccountId.get(account.id) || account.lastLoginAt
      })),
    ...visitors
      .filter((visitor) => {
        const visitorId = String(visitor?.visitorId || "");
        return Number(visitorGenerationCount.get(visitorId) || 0) > 0 && !accountByVisitorId.get(visitorId)?.isRegistered;
      })
      .map((visitor) => {
      const safeVisitor = normalizeVisitorState(visitor);
      const linkedAccount = accountByVisitorId.get(safeVisitor.visitorId) || null;
      const latestSession = latestSessionByVisitorId.get(safeVisitor.visitorId) || null;
      const visitorLabel = linkedAccount
        ? `访客 · ${getAccountDisplayName(linkedAccount, `访客 ${safeVisitor.visitorId.slice(0, 8)}`)}`
        : `访客 ${safeVisitor.visitorId.slice(0, 8)}`;
      return {
        ...(linkedAccount || {}),
        id: safeVisitor.visitorId,
        recordType: "visitor",
        accountId: String(linkedAccount?.id || ""),
        visitorId: safeVisitor.visitorId,
        username: visitorLabel,
        email: "",
        accountStatus: linkedAccount?.accountStatus || "active",
        creditBalance: Number(linkedAccount?.creditBalance || 0),
        beanBalance: Number(linkedAccount?.beanBalance || 0),
        visitorCount: 0,
        orderCount: Number(visitorGenerationCount.get(safeVisitor.visitorId) || 0),
        paidTotalCents: 0,
        visitorTier: safeVisitor.tier,
        browser: latestSession?.browser || "未知（历史访问未记录）",
        invitationSource: safeVisitor.tier === "invited" ? "兑换码兑换（未记录来源）" : "",
        registeredAt: null,
        lastLoginAt: getVisitSessionLastActivityAt(latestSession) || safeVisitor.lastActiveAt || safeVisitor.updatedAt || null,
        createdAt: safeVisitor.createdAt || null,
        updatedAt: safeVisitor.updatedAt || null
      };
    })
  ]
    .filter((record) => !safeType || record.recordType === safeType)
    .filter((record) => !safeStatus || String(record.accountStatus || "active") === safeStatus)
    .filter((record) => {
      if (!keyword) return true;
      const inviter = toPublicAdminInviter(record);
      return [record.username, record.email, record.id, record.accountId, record.visitorId, inviter?.name, inviter?.email]
        .map((value) => String(value || "").toLowerCase())
        .join("\n")
        .includes(keyword);
    })
    .sort((left, right) => String(right.lastLoginAt || right.updatedAt || right.createdAt || "").localeCompare(String(left.lastLoginAt || left.updatedAt || left.createdAt || "")));
  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const safePage = Math.min(requestedPage, totalPages);
  return {
    total,
    page: safePage,
    limit: safeLimit,
    items: records.slice((safePage - 1) * safeLimit, safePage * safeLimit)
  };
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : "";
}

function normalizeUsername(value) {
  const username = String(value || "").trim();
  return username.length >= 2 && username.length <= 32 ? username : "";
}

function isValidPassword(value) {
  return String(value || "").length >= 8 && String(value || "").length <= 256;
}

function hashPassword(password) {
  const salt = randomUUID().replace(/-/g, "");
  return `${salt}:${scryptSync(String(password || ""), salt, 64).toString("base64")}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expected] = String(storedHash || "").split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(String(password || ""), salt, 64).toString("base64");
  return safeCompareString(expected, actual);
}

function getEmailCodeSecret() {
  return String(process.env.EMAIL_CODE_SECRET || process.env.TENCENTCLOUD_SECRET_KEY || process.env.WECHAT_OAUTH_STATE_SECRET || "local-email-code-secret");
}

function hashEmailVerificationCode({ email, purpose, code }) {
  return createHmac("sha256", getEmailCodeSecret())
    .update(`${String(email || "").trim().toLowerCase()}|${String(purpose || "").trim()}|${String(code || "")}`)
    .digest("base64url");
}

async function toLoggedAuthHttpError(action, error) {
  await writeAuthDebugLog(action, error);
  return toAuthHttpError(error);
}

async function writeAuthDebugLog(action, error) {
  if (!isEmailCodeLogOnly()) return;
  try {
    await mkdir(path.dirname(authDebugLogPath), { recursive: true });
    const entry = {
      at: new Date().toISOString(),
      action,
      code: error?.code || "",
      status: error?.status || null,
      message: error?.message || String(error || ""),
      stack: error?.stack || ""
    };
    await appendFile(authDebugLogPath, `${JSON.stringify(entry)}\n`, "utf-8");
  } catch {
    // Logging must never mask the original auth failure.
  }
}

function toAuthHttpError(error) {
  if (error?.status) return error;
  const code = String(error?.code || "");
  if (code === "CODE_RATE_LIMIT") return createHttpError(429, "验证码发送过于频繁，请 60 秒后重试。");
  if (code === "CODE_EXPIRED") return createHttpError(400, "验证码已过期，请重新获取。");
  if (code === "CODE_ATTEMPTS_EXCEEDED") return createHttpError(429, "验证码错误次数过多，请重新获取。");
  if (code === "CODE_INVALID") return createHttpError(400, "验证码不正确。");
  if (code === "EMAIL_EXISTS") return createHttpError(409, "该邮箱已注册，请直接登录。");
  if (code === "USERNAME_EXISTS") return createHttpError(409, "用户名已被使用。");
  if (code === "ALREADY_REGISTERED") return createHttpError(409, "当前账户已完成注册。");
  if (isEmailCodeLogOnly()) return createHttpError(500, `本地认证错误：${error?.message || "未知错误。"}`);
  return error;
}

function isEmailCodeLogOnly() {
  return String(process.env.EMAIL_CODE_LOG_ONLY || "").trim().toLowerCase() === "true";
}

async function sendEmailVerificationCode({ email, code, purpose }) {
  if (isEmailCodeLogOnly()) {
    console.info(`[email-code:development] ${purpose} ${email}: ${code}`);
    return;
  }
  const secretId = String(process.env.TENCENTCLOUD_SECRET_ID || "").trim();
  const secretKey = String(process.env.TENCENTCLOUD_SECRET_KEY || "").trim();
  const region = String(process.env.TENCENTCLOUD_SES_REGION || "").trim();
  const fromEmail = String(process.env.TENCENTCLOUD_SES_FROM_EMAIL || "").trim();
  const templateId = Number(process.env.TENCENTCLOUD_SES_TEMPLATE_ID || 0);
  if (!secretId || !secretKey || !region || !fromEmail || !templateId) {
    throw createHttpError(503, "邮箱服务尚未配置。请联系管理员或在本地启用 EMAIL_CODE_LOG_ONLY。", "邮箱验证码服务尚未配置。");
  }
  let tencentcloud;
  try {
    tencentcloud = await import("tencentcloud-sdk-nodejs");
  } catch {
    throw createHttpError(503, "腾讯云 SES 依赖未安装。", "邮箱验证码服务暂不可用。");
  }
  const sdk = tencentcloud.default || tencentcloud;
  const Client = sdk.ses?.v20201002?.Client;
  if (!Client) throw createHttpError(503, "腾讯云 SES 客户端初始化失败。", "邮箱验证码服务暂不可用。");
  const client = new Client({ credential: { secretId, secretKey }, region, profile: { httpProfile: { endpoint: "ses.tencentcloudapi.com" } } });
  try {
    await client.SendEmail({
      FromEmailAddress: fromEmail,
      Destination: [email],
      Subject: "AI小画家邮箱验证码",
      Template: { TemplateID: templateId, TemplateData: JSON.stringify({ code, minutes: "10" }) }
    });
  } catch (error) {
    console.error("Tencent SES send failed", error);
    throw createHttpError(502, "腾讯云 SES 发送失败。", "验证码发送失败，请稍后重试。");
  }
}

function toPublicPaymentIntent(intent) {
  if (!intent) return null;
  return {
    id: intent.id,
    kind: intent.kind,
    amountCents: intent.amountCents,
    creditAmount: intent.creditAmount,
    status: intent.status,
    channel: intent.channel,
    metadata: intent.metadata,
    expiresAt: intent.expiresAt,
    paidAt: intent.paidAt,
    createdAt: intent.createdAt
  };
}

function toPublicBeanPurchase(intent) {
  const payment = toPublicPaymentIntent(intent);
  if (!payment) return null;
  return {
    ...payment,
    purchaseNo: String(intent.metadata?.purchaseNo || ""),
    beanCount: Math.max(0, Math.trunc(Number(intent.metadata?.beanCount || intent.creditAmount || 0))),
    unitPriceCents: 100
  };
}

function toPublicCoinPurchase(intent) {
  const payment = toPublicPaymentIntent(intent);
  if (!payment) return null;
  return {
    ...payment,
    purchaseNo: String(intent.metadata?.purchaseNo || ""),
    coinCount: Math.max(0, Math.trunc(Number(intent.metadata?.coinCount || intent.creditAmount || 0))),
    unitPriceCents: 100
  };
}

function toPublicAdminPaymentIntent(intent) {
  return {
    ...toPublicPaymentIntent(intent),
    accountId: intent.accountId,
    targetOrderId: intent.targetOrderId,
    outTradeNo: intent.outTradeNo,
    transactionId: intent.transactionId,
    metadata: intent.metadata
  };
}

function normalizeAdminOrderListType(value) {
  const type = String(value || "").trim();
  return new Set(["fridge", "body_book", "coin_purchase", "bean_purchase"]).has(type) ? type : "";
}

function normalizeAdminOrderListStatus(value) {
  const status = String(value || "").trim();
  return ORDER_STATUS_VALUES.has(status) || status === "paid" ? status : "";
}

function getAdminPurchaseOrderStatus(intent) {
  if (intent?.status === "paid") return "paid";
  if (intent?.status === "cancelled") return "cancelled";
  if (intent?.expiresAt && Date.parse(intent.expiresAt) <= Date.now()) return "expired";
  return "pending_payment";
}

function getAdminPurchaseOrderStatusLabel(intent) {
  const status = getAdminPurchaseOrderStatus(intent);
  if (status === "paid") return "已支付";
  if (status === "cancelled") return "已取消";
  if (status === "expired") return "已过期";
  return intent?.channel === "manual_collection" ? "待确认收款" : "待付款";
}

function getAdminOrderRecordTypeLabel(record) {
  if (record?.recordType === "purchase") return record.orderType === "coin_purchase" ? "购买币" : "购买豆豆";
  return record?.experienceType === "body-book" ? "认知书实体书" : "冰箱贴定制";
}

function getAdminOrderRecordStatusLabel(record) {
  if (record?.recordType === "purchase") return record.purchaseStatusLabel || getAdminPurchaseOrderStatusLabel(record);
  return getOrderStatusLabel(record);
}

function isWithinAdminOrderDateRange(createdAt, startDate, endDate) {
  const createdAtMs = Date.parse(createdAt || "");
  if (!Number.isFinite(createdAtMs)) return false;
  if (startDate && createdAtMs < Date.parse(`${startDate}T00:00:00.000Z`)) return false;
  if (endDate && createdAtMs > Date.parse(`${endDate}T23:59:59.999Z`)) return false;
  return true;
}

function listAdminOrderRecords({ merchantId = "", orderStatus = "", orderType = "", search = "", startDate = "", endDate = "" } = {}) {
  const records = [];
  const includePhysicalOrders = !orderType || ["fridge", "body_book"].includes(orderType);
  const includePurchases = !merchantId && (!orderType || ["coin_purchase", "bean_purchase"].includes(orderType));
  const physicalOrderStatus = ORDER_STATUS_VALUES.has(orderStatus) ? orderStatus : "";

  if (includePhysicalOrders) {
    const physicalOrders = orderStore.listOrdersForExport({ merchantId, orderStatus: physicalOrderStatus, search, startDate, endDate });
    physicalOrders.forEach((order) => {
      if (orderType === "fridge" && order.experienceType === "body-book") return;
      if (orderType === "body_book" && order.experienceType !== "body-book") return;
      records.push({
        ...toPublicOrder(order, { includePrivate: true }),
        recordType: "order",
        orderType: order.experienceType === "body-book" ? "body_book" : "fridge"
      });
    });
  }

  if (includePurchases) {
    const searchText = String(search || "").trim().toLocaleLowerCase();
    commerceStore.listAllPaymentIntents(500).forEach((intent) => {
      if (!["coin_purchase", "bean_purchase"].includes(intent.kind)) return;
      if (orderType && intent.kind !== orderType) return;
      const purchaseStatus = getAdminPurchaseOrderStatus(intent);
      if (orderStatus && purchaseStatus !== orderStatus) return;
      if (!isWithinAdminOrderDateRange(intent.createdAt, startDate, endDate)) return;
      const account = commerceStore.readAccount(intent.accountId);
      const accountName = String(getAccountDisplayName(account) || account?.email || account?.id || "用户");
      const purchaseNo = String(intent.metadata?.purchaseNo || intent.outTradeNo || intent.id);
      const purchaseQuantity = Math.max(0, Number(intent.kind === "coin_purchase" ? intent.metadata?.coinCount : intent.metadata?.beanCount) || Number(intent.creditAmount || 0));
      if (searchText && ![purchaseNo, intent.outTradeNo, accountName, intent.accountId].some((value) => String(value || "").toLocaleLowerCase().includes(searchText))) return;
      records.push({
        ...toPublicAdminPaymentIntent(intent),
        recordType: "purchase",
        orderType: intent.kind,
        orderNo: purchaseNo,
        orderStatus: purchaseStatus,
        purchaseStatusLabel: getAdminPurchaseOrderStatusLabel(intent),
        purchaseQuantityText: `${purchaseQuantity} ${intent.kind === "coin_purchase" ? "币" : "豆"}`,
        accountName,
        canConfirmManual: purchaseStatus === "pending_payment" && intent.channel === "manual_collection"
      });
    });
  }

  return records.sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""));
}

function assertWechatPaymentConfigured({ requireOAuth = false } = {}) {
  const config = getWechatConfig();
  const missing = [];
  if (!config.appId) missing.push("WECHAT_PAY_APP_ID");
  if (!config.mchId) missing.push("WECHAT_PAY_MCH_ID");
  if (!config.apiV3Key) missing.push("WECHAT_PAY_API_V3_KEY");
  if (!config.serialNo) missing.push("WECHAT_PAY_SERIAL_NO");
  if (!config.privateKey) missing.push("WECHAT_PAY_PRIVATE_KEY");
  if (!config.notifyUrl) missing.push("WECHAT_PAY_NOTIFY_URL");
  if (requireOAuth && !config.oauthRedirectUrl) missing.push("WECHAT_OAUTH_REDIRECT_URL");
  if (missing.length) {
    throw createHttpError(503, `微信支付配置缺失：${missing.join("、")}`);
  }
  return config;
}

function assertWechatMiniProgramPaymentConfigured() {
  const config = getWechatMiniProgramPaymentConfig();
  const missing = [];
  if (!config.appId) missing.push("WECHAT_MINIPROGRAM_APP_ID");
  if (!config.mchId) missing.push("WECHAT_PAY_MCH_ID");
  if (!config.apiV3Key) missing.push("WECHAT_PAY_API_V3_KEY");
  if (!config.serialNo) missing.push("WECHAT_PAY_SERIAL_NO");
  if (!config.privateKey) missing.push("WECHAT_PAY_PRIVATE_KEY");
  if (!config.notifyUrl) missing.push("WECHAT_PAY_NOTIFY_URL");
  if (missing.length) {
    throw createHttpError(503, `小程序微信支付配置缺失：${missing.join("、")}`);
  }
  return config;
}

function isWechatBrowser(req) {
  const userAgent = String(req.headers["user-agent"] || "");
  return /MicroMessenger/i.test(userAgent);
}

function isMiniProgramRequest(req) {
  return String(req.headers["x-petpaint-client"] || "").trim().toLowerCase() === "miniprogram";
}

function getMiniProgramPaymentOpenId(req) {
  if (req.webAccount?.channel !== "web_wechat" || !String(req.webAccount?.openId || "").trim()) {
    throw createHttpError(403, "小程序内微信支付需使用微信登录账户。", "请先在“登录 / 切换账号”中使用微信登录，再完成支付。");
  }
  return String(req.webAccount.openId).trim();
}

function isLocalMockPaymentEnabled(req) {
  if (String(process.env.LOCAL_MOCK_PAYMENT || "").trim().toLowerCase() !== "true") return false;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().replace(/:\d+$/, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function getOrderPaymentOAuthStateSecret() {
  return String(process.env.WECHAT_OAUTH_STATE_SECRET || process.env.WECHAT_OAUTH_APP_SECRET || "").trim();
}

function createOrderPaymentOAuthState(order) {
  const stateSecret = getOrderPaymentOAuthStateSecret();
  if (!stateSecret) throw createHttpError(503, "微信网页授权未完成配置：缺少 WECHAT_OAUTH_STATE_SECRET 或 WECHAT_OAUTH_APP_SECRET。", "微信网页授权尚未配置完成。");
  const payload = Buffer.from(JSON.stringify({
    orderId: String(order?.id || ""),
    accountId: String(order?.accountId || ""),
    nonce: randomUUID(),
    expiresAt: Date.now() + 10 * 60 * 1000
  }), "utf-8").toString("base64url");
  const signature = createHmac("sha256", stateSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function createBeanPurchasePaymentOAuthState(intent) {
  const stateSecret = getOrderPaymentOAuthStateSecret();
  if (!stateSecret) throw createHttpError(503, "微信网页授权未完成配置：缺少 WECHAT_OAUTH_STATE_SECRET 或 WECHAT_OAUTH_APP_SECRET。", "微信网页授权尚未配置完成。");
  const payload = Buffer.from(JSON.stringify({
    intentId: String(intent?.id || ""),
    accountId: String(intent?.accountId || ""),
    nonce: randomUUID(),
    expiresAt: Date.now() + 10 * 60 * 1000
  }), "utf-8").toString("base64url");
  const signature = createHmac("sha256", stateSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyOrderPaymentOAuthState(value) {
  const [payload, signature] = String(value || "").split(".");
  const stateSecret = getOrderPaymentOAuthStateSecret();
  if (!payload || !signature || !stateSecret) throw createHttpError(400, "微信授权状态无效，请重新发起授权。", "微信授权已失效，请重试。");
  const expected = createHmac("sha256", stateSecret).update(payload).digest("base64url");
  if (!safeCompareString(signature, expected)) throw createHttpError(400, "微信授权状态校验失败。", "微信授权已失效，请重试。");
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    throw createHttpError(400, "微信授权状态格式错误。", "微信授权已失效，请重试。");
  }
  if (!Number.isFinite(Number(parsed?.expiresAt)) || Number(parsed.expiresAt) < Date.now()) {
    throw createHttpError(400, "微信授权状态已过期。", "微信授权已过期，请重试。");
  }
  const isOrderState = isSafeAccountId(parsed?.orderId);
  const isBeanPurchaseState = isSafeAccountId(parsed?.intentId);
  if ((!isOrderState && !isBeanPurchaseState) || !isSafeAccountId(parsed?.accountId)) {
    throw createHttpError(400, "微信授权状态无效，请重新发起授权。", "微信授权已失效，请重试。");
  }
  return isBeanPurchaseState
    ? { intentId: parsed.intentId, accountId: parsed.accountId }
    : { orderId: parsed.orderId, accountId: parsed.accountId };
}

function createOrderPaymentAuthorizationUrl(req, order) {
  const config = assertWechatPaymentConfigured({ requireOAuth: true });
  const state = createOrderPaymentOAuthState(order);
  const redirectUri = encodeURIComponent(config.oauthRedirectUrl);
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(config.appId)}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(state)}#wechat_redirect`;
}

function createBeanPurchasePaymentAuthorizationUrl(req, intent) {
  const config = assertWechatPaymentConfigured({ requireOAuth: true });
  const state = createBeanPurchasePaymentOAuthState(intent);
  const redirectUri = encodeURIComponent(config.oauthRedirectUrl);
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(config.appId)}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(state)}#wechat_redirect`;
}

function createCoinPurchasePaymentAuthorizationUrl(req, intent) {
  const config = assertWechatPaymentConfigured({ requireOAuth: true });
  const state = createBeanPurchasePaymentOAuthState(intent);
  const redirectUri = encodeURIComponent(config.oauthRedirectUrl);
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(config.appId)}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(state)}#wechat_redirect`;
}

async function fetchWechatOpenId(code) {
  const config = assertWechatPaymentConfigured({ requireOAuth: true });
  const oauthAppSecret = String(process.env.WECHAT_OAUTH_APP_SECRET || "").trim();
  if (!oauthAppSecret) {
    throw createHttpError(503, "微信网页授权未完成配置：缺少 WECHAT_OAUTH_APP_SECRET。");
  }
  const url = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  url.searchParams.set("appid", config.appId);
  url.searchParams.set("secret", oauthAppSecret);
  url.searchParams.set("code", String(code || ""));
  url.searchParams.set("grant_type", "authorization_code");

  const response = await fetch(url, { method: "GET" });
  const payload = await response.json();
  if (!response.ok || payload.errcode) {
    throw createHttpError(502, payload.errmsg || "获取微信用户标识失败。");
  }
  const openId = String(payload.openid || "").trim();
  if (!openId) throw createHttpError(502, "微信未返回 openid。");
  return openId;
}

function verifyWechatNotifySignature(req, bodyText) {
  const signature = String(req.get("Wechatpay-Signature") || "");
  const nonce = String(req.get("Wechatpay-Nonce") || "");
  const timestamp = String(req.get("Wechatpay-Timestamp") || "");
  const publicKeyPem = normalizePem(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY);
  if (!publicKeyPem) {
    throw createHttpError(503, "微信支付平台证书公钥未配置：WECHAT_PAY_PLATFORM_PUBLIC_KEY。");
  }
  if (!signature || !nonce || !timestamp) {
    throw createHttpError(400, "微信支付回调签名头缺失。");
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${timestamp}\n${nonce}\n${bodyText}\n`);
  verifier.end();
  const ok = verifier.verify(createPublicKey(publicKeyPem), signature, "base64");
  if (!ok) throw createHttpError(401, "微信支付回调验签失败。");
}

function buildWechatAuthorizationHeader(method, urlPath, body = "", config = assertWechatPaymentConfigured()) {
  const nonceStr = randomUUID().replace(/-/g, "");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  const signature = signer.sign(createPrivateKey(config.privateKey), "base64");
  const value = [
    `mchid="${config.mchId}"`,
    `nonce_str="${nonceStr}"`,
    `signature="${signature}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${config.serialNo}"`
  ].join(",");
  return `WECHATPAY2-SHA256-RSA2048 ${value}`;
}

async function callWechatPayApi(method, pathname, bodyObject = null, config = assertWechatPaymentConfigured()) {
  const bodyText = bodyObject ? JSON.stringify(bodyObject) : "";
  const response = await fetch(`https://api.mch.weixin.qq.com${pathname}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: buildWechatAuthorizationHeader(method, pathname, bodyText, config),
      "Content-Type": "application/json",
      "User-Agent": "PromptReferenceBoard/1.0",
      ...(config.serialNo ? { "Wechatpay-Serial": config.serialNo } : {})
    },
    body: bodyText || undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw createHttpError(502, payload.message || payload.detail || `微信支付请求失败（${response.status}）`);
  }
  return payload;
}

function signJsapiPayParams({ appId, timeStamp, nonceStr, prepayId, config = assertWechatPaymentConfigured() }) {
  const packageValue = `prepay_id=${prepayId}`;
  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(createPrivateKey(config.privateKey), "base64");
}

async function createWechatJsapiPayment({ intent, openId, description, config = assertWechatPaymentConfigured() }) {
  if (!intent?.id || !intent?.outTradeNo) throw createHttpError(500, "支付单不存在。", "支付单创建失败，请重试。");
  if (!openId) throw createHttpError(401, "缺少微信账户标识。", "请重新完成微信授权。");
  const payload = await callWechatPayApi("POST", "/v3/pay/transactions/jsapi", {
    appid: config.appId,
    mchid: config.mchId,
    description: String(description || "AI 小画订单").slice(0, 127),
    out_trade_no: intent.outTradeNo,
    time_expire: intent.expiresAt || undefined,
    notify_url: config.notifyUrl,
    amount: { total: intent.amountCents, currency: "CNY" },
    payer: { openid: openId }
  }, config);
  const prepayId = String(payload.prepay_id || "").trim();
  if (!prepayId) throw createHttpError(502, "微信支付未返回预支付标识。", "支付创建失败，请重试。");
  const nonceStr = randomUUID().replace(/-/g, "");
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const paySign = signJsapiPayParams({ appId: config.appId, timeStamp, nonceStr, prepayId, config });
  commerceStore.markPaymentPrepared(intent.id, {
    channel: "wechat_jsapi",
    eventId: prepayId,
    payload
  });
  return {
    status: "ready",
    channel: "wechat_jsapi",
    prepayId,
    jsapi: {
      appId: config.appId,
      timeStamp,
      nonceStr,
      package: `prepay_id=${prepayId}`,
      signType: "RSA",
      paySign
    }
  };
}

async function createWechatNativePayment({ intent, description, config = assertWechatPaymentConfigured() }) {
  if (!intent?.id || !intent?.outTradeNo) throw createHttpError(500, "支付单不存在。", "支付单创建失败，请重试。");
  const payload = await callWechatPayApi("POST", "/v3/pay/transactions/native", {
    appid: config.appId,
    mchid: config.mchId,
    description: String(description || "AI 小画订单").slice(0, 127),
    out_trade_no: intent.outTradeNo,
    time_expire: intent.expiresAt || undefined,
    notify_url: config.notifyUrl,
    amount: { total: intent.amountCents, currency: "CNY" }
  }, config);
  const codeUrl = String(payload.code_url || "").trim();
  if (!codeUrl) throw createHttpError(502, "微信支付未返回扫码支付地址。", "支付创建失败，请重试。");
  commerceStore.markPaymentPrepared(intent.id, {
    channel: "wechat_native",
    eventId: String(payload.prepay_id || `${intent.id}:native:${Date.now()}`),
    payload
  });
  return {
    status: "ready",
    channel: "wechat_native",
    prepayId: String(payload.prepay_id || ""),
    codeUrl
  };
}

function normalizePhoneNumber(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function validateMainlandPhone(value) {
  return /^1\d{10}$/.test(normalizePhoneNumber(value));
}

function normalizeOrderAddress(payload) {
  const mergedAddress = String(payload?.address || payload?.addressDetail || "").trim();
  return {
    receiverName: String(payload?.receiverName || "").trim(),
    receiverPhone: normalizePhoneNumber(payload?.receiverPhone || ""),
    province: String(payload?.province || "").trim(),
    city: String(payload?.city || "").trim(),
    district: String(payload?.district || "").trim(),
    addressDetail: mergedAddress,
    remark: String(payload?.remark || "").trim()
  };
}

function assertValidOrderAddress(address) {
  if (!address.receiverName) throw createHttpError(400, "请填写收件人姓名。");
  if (!validateMainlandPhone(address.receiverPhone)) throw createHttpError(400, "请填写正确的手机号。");
  if (!address.addressDetail) throw createHttpError(400, "请填写收货地址。");
}

function assertOrderOwnership(req, order, token = "") {
  if (!order) throw createHttpError(404, "订单不存在。");
  if (order.visitorId === req.visitorId) return;
  if (token && safeCompareString(token, order.publicToken)) return;
  throw createHttpError(403, "无权访问该订单。");
}

function safeCompareString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function toPublicOrder(order, options = {}) {
  if (!order) return null;
  const includePrivate = Boolean(options.includePrivate);
  const includeToken = Boolean(options.includeToken);
  const safeOrder = {
    ...order,
    paymentStatus: normalizeOrderPaymentStatus(order.paymentStatus),
    fulfillmentStatus: normalizeOrderFulfillmentStatus(order.fulfillmentStatus),
    items: Array.isArray(order.items) ? order.items : [],
    paymentEvents: Array.isArray(order.paymentEvents) ? order.paymentEvents : []
  };
  const shippingCarrier = normalizeShippingCarrierCode(safeOrder.shippingCarrier);
  return {
    id: safeOrder.id,
    orderNo: safeOrder.orderNo,
    experienceType: safeOrder.experienceType,
    bodyBookThemeName: safeOrder.bodyBookThemeName,
    orderStatus: getOrderStatus(safeOrder),
    paymentStatus: safeOrder.paymentStatus,
    fulfillmentStatus: safeOrder.fulfillmentStatus,
    itemCount: safeOrder.itemCount,
    unitPriceCents: safeOrder.unitPriceCents,
    shippingFeeCents: safeOrder.shippingFeeCents,
    subtotalCents: safeOrder.subtotalCents,
    totalCents: safeOrder.totalCents,
    beanDiscountCents: Math.max(0, Number(safeOrder.beanDiscountCents || 0)),
    coinDiscountCents: Math.max(0, Number(safeOrder.coinDiscountCents || 0)),
    payableCents: getOrderPayableCents(safeOrder),
    remark: safeOrder.remark,
    receiverName: safeOrder.receiverName,
    publicToken: includeToken ? safeOrder.publicToken : "",
    receiverPhone: includePrivate ? safeOrder.receiverPhone : maskPhone(safeOrder.receiverPhone),
    province: safeOrder.province,
    city: safeOrder.city,
    district: safeOrder.district,
    addressDetail: safeOrder.addressDetail,
    sourceMerchantId: safeOrder.sourceMerchantId,
    sourceMerchantName: safeOrder.sourceMerchantName,
    commissionRateBps: Number(safeOrder.commissionRateBps || 0),
    sourceClaimedAt: safeOrder.sourceClaimedAt,
    adminRemark: includePrivate ? safeOrder.adminRemark : "",
    lastPaymentChannel: safeOrder.lastPaymentChannel,
    lastPaymentError: safeOrder.lastPaymentError,
    expiresAt: safeOrder.expiresAt,
    paidAt: safeOrder.paidAt,
    shippedAt: safeOrder.shippedAt,
    shippingCarrier,
    shippingCarrierName: getShippingCarrierName(shippingCarrier),
    shippingTrackingNo: safeOrder.shippingTrackingNo,
    completedAt: safeOrder.completedAt,
    cancelledAt: safeOrder.cancelledAt,
    createdAt: safeOrder.createdAt,
    updatedAt: safeOrder.updatedAt,
    wechatTransactionId: includePrivate ? safeOrder.wechatTransactionId : "",
    outTradeNo: includePrivate ? safeOrder.outTradeNo : "",
    items: safeOrder.items.map((item) => ({
      orderId: item.orderId,
      jobId: item.jobId,
      styleId: item.styleId,
      styleName: item.styleName,
      imageUrl: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl,
      quantity: Math.max(1, Number(item.quantity || 1)),
      sortOrder: item.sortOrder
    })),
    paymentEvents: includePrivate ? safeOrder.paymentEvents : []
  };
}

function confirmManualOrderPayment(order) {
  if (!order) throw createHttpError(404, "订单不存在。");
  if (order.paymentStatus === "paid") return order;
  if (order.paymentStatus !== "unpaid" || order.fulfillmentStatus === "cancelled") {
    throw createHttpError(409, "当前订单无法确认收款。");
  }

  const intent = commerceStore.readPaymentIntentByOutTradeNo(order.outTradeNo);
  if (!intent || !["physical_order", "body_book_order"].includes(intent.kind) || intent.targetOrderId !== order.id || intent.accountId !== order.accountId || intent.amountCents !== getOrderPayableCents(order)) {
    throw createHttpError(409, "订单支付记录不存在，无法确认收款。");
  }
  if (intent.status === "cancelled") throw createHttpError(409, "订单支付记录已取消，无法确认收款。");

  const paidAt = new Date().toISOString();
  const transactionId = `MANUAL-${order.outTradeNo}`;
  commerceStore.settlePayment({
    outTradeNo: order.outTradeNo,
    transactionId,
    paidAt,
    payload: {
      mode: "manual_collection",
      orderId: order.id,
      orderNo: order.orderNo,
      confirmedBy: "admin"
    },
    headers: {}
  });
  return orderStore.updateOrderAndAppendEvent(order.id, {
    paymentStatus: "paid",
    fulfillmentStatus: "new",
    lastPaymentChannel: "manual_collection",
    lastPaymentError: "",
    wechatTransactionId: transactionId,
    paidAt
  }, {
    eventType: "manual_payment_confirmed",
    eventId: transactionId,
    success: true,
    payload: { mode: "manual_collection", confirmedBy: "admin" }
  });
}

function getOrderStatus(order) {
  const fulfillmentStatus = normalizeOrderFulfillmentStatus(order?.fulfillmentStatus, "new");
  const paymentStatus = normalizeOrderPaymentStatus(order?.paymentStatus, "unpaid");
  if (fulfillmentStatus === "cancelled") return "cancelled";
  if (fulfillmentStatus === "completed") return "completed";
  if (fulfillmentStatus === "shipped") return "shipped";
  if (paymentStatus === "paid") return "pending_shipment";
  if (paymentStatus === "expired") return "expired";
  return "pending_payment";
}

function getOrderStatusLabel(order) {
  const status = getOrderStatus(order);
  if (status === "pending_payment") return "待付款";
  if (status === "pending_shipment") return "待发货";
  if (status === "shipped") return "已发货";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  if (status === "expired") return "已过期";
  return status || "未知";
}

function formatOrderExportDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatOrderExportAddress(order) {
  const detail = String(order?.addressDetail || "").trim();
  const region = [order?.province, order?.city, order?.district].map((item) => String(item || "").trim()).filter(Boolean).join("");
  if (!region) return detail;
  if (!detail) return region;
  return detail.startsWith(region) ? detail : `${region}${detail}`;
}

function formatOrderAmount(value) {
  return (Number(value || 0) / 100).toFixed(2);
}

function toCsvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function formatFilenameDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

async function readInviteCodes() {
  try {
    const codes = JSON.parse(await readFile(inviteCodePath, "utf-8"));
    return Array.isArray(codes) ? codes.map(normalizeInviteCode) : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveInviteCodes(inviteCodes) {
  await writeFile(inviteCodePath, `${JSON.stringify(inviteCodes.map(normalizeInviteCode), null, 2)}\n`, "utf-8");
}

function normalizeInviteCode(inviteCode) {
  const legacyCoinBonus = inviteCode?.quotaBonus;
  return {
    id: String(inviteCode?.id || randomUUID()),
    code: String(inviteCode?.code || "").trim().toUpperCase(),
    enabled: inviteCode?.enabled !== false,
    maxRedemptions: 1,
    // `quotaBonus` was the old, single-wallet field. Keep it only so old
    // visitor records can still be read; each new redemption uses both wallets.
    quotaBonus: normalizeInviteQuotaBonus(legacyCoinBonus),
    coinBonus: normalizeInviteBonus(inviteCode?.coinBonus ?? legacyCoinBonus, 5),
    beanBonus: normalizeInviteBonus(inviteCode?.beanBonus, 10),
    fridgeMagnetItemCount: normalizeRedemptionEntitlementCount(inviteCode?.fridgeMagnetItemCount),
    bodyBookPrintCount: normalizeRedemptionEntitlementCount(inviteCode?.bodyBookPrintCount),
    redeemedCount: Math.max(0, Number(inviteCode?.redeemedCount || 0)),
    redeemedByVisitorIds: Array.isArray(inviteCode?.redeemedByVisitorIds) ? inviteCode.redeemedByVisitorIds.map(String) : [],
    redeemedByAccountIds: Array.isArray(inviteCode?.redeemedByAccountIds) ? inviteCode.redeemedByAccountIds.map(String) : [],
    createdAt: inviteCode?.createdAt || new Date().toISOString(),
    updatedAt: inviteCode?.updatedAt || new Date().toISOString()
  };
}

function toPublicInviteCode(inviteCode) {
  const safeInvite = normalizeInviteCode(inviteCode);
  return {
    id: safeInvite.id,
    code: safeInvite.code,
    enabled: safeInvite.enabled,
    maxRedemptions: safeInvite.maxRedemptions,
    coinBonus: safeInvite.coinBonus,
    beanBonus: safeInvite.beanBonus,
    fridgeMagnetItemCount: safeInvite.fridgeMagnetItemCount,
    bodyBookPrintCount: safeInvite.bodyBookPrintCount,
    redeemedCount: safeInvite.redeemedCount,
    remainingRedemptions: Math.max(0, safeInvite.maxRedemptions - safeInvite.redeemedCount),
    createdAt: safeInvite.createdAt,
    updatedAt: safeInvite.updatedAt
  };
}

function normalizeRedemptionEntitlementCount(value) {
  const normalized = Math.trunc(Number(value || 0));
  return Number.isFinite(normalized) ? Math.min(Math.max(normalized, 0), 999) : 0;
}

async function createInviteCodes(count, prefix = "", coinBonus = 5, beanBonus = 10, fridgeMagnetItemCount = 0, bodyBookPrintCount = 0) {
  const inviteCodes = await readInviteCodes();
  const now = new Date().toISOString();
  const created = Array.from({ length: count }, () => normalizeInviteCode({
    id: randomUUID(),
    code: generateInviteCode(prefix),
    enabled: true,
    maxRedemptions: INVITE_DEFAULT_MAX_REDEMPTIONS,
    coinBonus,
    beanBonus,
    fridgeMagnetItemCount,
    bodyBookPrintCount,
    redeemedCount: 0,
    redeemedByVisitorIds: [],
    redeemedByAccountIds: [],
    createdAt: now,
    updatedAt: now
  }));
  await saveInviteCodes(inviteCodes.concat(created));
  return created;
}

function generateInviteCode(prefix = "") {
  const base = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return prefix ? `${prefix}-${base}` : base;
}

async function updateInviteCode(id, patch) {
  const inviteCodes = await readInviteCodes();
  const index = inviteCodes.findIndex((item) => item.id === id);
  if (index < 0) return null;
  inviteCodes[index] = normalizeInviteCode({
    ...inviteCodes[index],
    enabled: patch.enabled === undefined ? inviteCodes[index].enabled : Boolean(patch.enabled),
    updatedAt: new Date().toISOString()
  });
  await saveInviteCodes(inviteCodes);
  return inviteCodes[index];
}

async function redeemInviteCode(req, code) {
  const inviteCodes = await readInviteCodes();
  const normalizedCode = String(code || "").trim().toUpperCase();
  const invite = inviteCodes.find((item) => item.code === normalizedCode);
  if (!invite || !invite.enabled) {
    throw createHttpError(400, "兑换码无效或已停用。");
  }
  if (invite.redeemedCount >= invite.maxRedemptions) {
    throw createHttpError(400, "兑换码已被使用。");
  }
  if (invite.redeemedByAccountIds.includes(String(req.webAccount?.id || ""))) {
    throw createHttpError(400, "你已兑换过这个兑换码。");
  }

  invite.redeemedCount += 1;
  invite.redeemedByVisitorIds = invite.redeemedByVisitorIds.concat(req.visitorId);
  invite.redeemedByAccountIds = invite.redeemedByAccountIds.concat(String(req.webAccount.id));
  invite.updatedAt = new Date().toISOString();
  await saveInviteCodes(inviteCodes);
  return {
    id: invite.id,
    coinBonus: invite.coinBonus,
    beanBonus: invite.beanBonus,
    fridgeMagnetItemCount: invite.fridgeMagnetItemCount,
    bodyBookPrintCount: invite.bodyBookPrintCount
  };
}

async function disableInviteCode(id) {
  return updateInviteCode(id, { enabled: false });
}

async function upgradeVisitorByInvite(req, quotaBonus = VISITOR_INVITE_BONUS) {
  const visitor = await getVisitorState(req);
  return saveVisitorState({
    ...visitor,
    tier: "anonymous",
    quotaLimit: Math.max(0, Number(visitor.quotaLimit || 0)) + normalizeInviteQuotaBonus(quotaBonus),
    invitedAt: null,
    updatedAt: new Date().toISOString()
  });
}

function enforceVisitorQuota(visitor, cost) {
  const remaining = Math.max(0, Number(visitor.quotaLimit || 0) - Number(visitor.quotaUsed || 0));
  if (remaining < cost) {
    throw createHttpError(403, visitor.contactMessage || DEFAULT_CONTACT_MESSAGE);
  }
}

async function consumeVisitorQuota(visitorId, cost) {
  const current = await readVisitorState(visitorId);
  if (!current) return;
  await saveVisitorState({
    ...current,
    quotaUsed: Math.max(0, Number(current.quotaUsed || 0)) + Math.max(0, Number(cost || 0)),
    updatedAt: new Date().toISOString()
  });
}

async function consumeVisitorQuotaForDrawCardSession(visitorId, sessionId, cost) {
  const current = await readVisitorState(visitorId);
  if (!current) return "missing_visitor";

  const chargedSessionIds = Array.isArray(current.chargedDrawCardSessionIds)
    ? current.chargedDrawCardSessionIds.map((value) => String(value || "")).filter(Boolean)
    : [];

  if (chargedSessionIds.includes(sessionId)) {
    return "already_charged";
  }

  await saveVisitorState({
    ...current,
    quotaUsed: Math.max(0, Number(current.quotaUsed || 0)) + Math.max(0, Number(cost || 0)),
    chargedDrawCardSessionIds: chargedSessionIds.concat(sessionId),
    updatedAt: new Date().toISOString()
  });
  return "charged";
}

async function estimateDrawCardQuotaCost(options = {}) {
  if (normalizePublicExperienceType(options?.experienceType) !== "draw-card") return 1;
  const selectedCount = parseSelectedStyleIds(options?.selectedStyleIds).length;
  if (selectedCount > 0) return normalizeDrawCardCount(selectedCount, DRAW_CARD_MIN_STYLE_COUNT);
  return normalizeDrawCardCount(options?.requestedDrawCount);
}

async function enforceVisitorRunningJobLimit(visitorId, config = getPublicExperienceConfig(DEFAULT_PUBLIC_EXPERIENCE_TYPE)) {
  const jobs = await listImageJobs();
  const running = jobs.filter((job) => job.visibility === "public" && job.ownerVisitorId === visitorId && ["queued", "running"].includes(job.status));
  if (running.length >= VISITOR_RUNNING_JOB_LIMIT) {
    throw createHttpError(409, config?.runningLimitMessage || "当前已有进行中的公开生成，请等待这一轮完成。");
  }
}

async function verifyAdminCredentials(username, password) {
  const expectedUsername = String(process.env.ADMIN_USERNAME || "").trim();
  const expectedPassword = String(process.env.ADMIN_PASSWORD || "");
  if (!expectedUsername || !expectedPassword) {
    throw createHttpError(503, "后台账号尚未配置。");
  }
  if (!safeCompare(username, expectedUsername) || !safeCompare(password, expectedPassword)) {
    throw createHttpError(401, "账号或密码错误。");
  }
}

function safeCompare(left, right) {
  const leftHash = createHash("sha256").update(String(left || "")).digest();
  const rightHash = createHash("sha256").update(String(right || "")).digest();
  return timingSafeEqual(leftHash, rightHash);
}

async function createAdminSession() {
  const now = Date.now();
  const session = {
    sessionId: randomUUID(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ADMIN_SESSION_TTL_MS).toISOString()
  };
  await mkdir(adminSessionRoot, { recursive: true });
  await writeFile(getAdminSessionPath(session.sessionId), `${JSON.stringify(session, null, 2)}\n`, "utf-8");
  return session;
}

async function readAdminSession(sessionId) {
  if (!isSafeAdminSessionId(sessionId)) return null;
  try {
    const session = JSON.parse(await readFile(getAdminSessionPath(sessionId), "utf-8"));
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await deleteAdminSession(sessionId);
      return null;
    }
    return session;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function deleteAdminSession(sessionId) {
  if (!isSafeAdminSessionId(sessionId)) return;
  await rm(getAdminSessionPath(sessionId), { force: true });
}

function toPublicAdminSession(session) {
  return {
    sessionId: String(session?.sessionId || ""),
    expiresAt: session?.expiresAt || null
  };
}

function assertVisitorOwnsSession(req, session, config = getPublicExperienceConfig(session?.experienceType)) {
  if (!accountOwnsPublicRecord(req.webAccount, session)) {
    throw createHttpError(403, `无权访问该${config?.label || "公开"}记录。`);
  }
}

function assertCanToggleLike(req, job) {
  if (job.visibility !== "public" || !accountOwnsPublicRecord(req.webAccount, job)) {
    throw createHttpError(403, "无权操作该结果。");
  }
}

function assertCanDownloadClipOriginal(req, job) {
  if (!job) {
    throw createHttpError(404, "卡夹图片不存在。");
  }
  if (
    job.visibility !== "public" ||
    !accountOwnsPublicRecord(req.webAccount, job) ||
    job.status !== "succeeded"
  ) {
    throw createHttpError(403, "无权下载该原图。");
  }
}

function toPublicClipItem(job) {
  const result = normalizeJobResult(job.result);
  return {
    jobId: String(job.jobId || ""),
    experienceType: normalizePublicExperienceType(job.experienceType),
    styleId: String(job.styleId || ""),
    styleName: String(job.styleName || ""),
    imageUrl: String(result?.previewUrl || result?.thumbnailUrl || ""),
    thumbnailUrl: String(result?.thumbnailUrl || result?.previewUrl || ""),
    isLiked: Boolean(job.isLiked),
    likedAt: job.likedAt || null
  };
}

async function listAdminUserClipItems(accountId) {
  const visitorIds = new Set(commerceStore.listVisitorIds(accountId));
  const jobs = await listImageJobs();
  return jobs
    .filter((job) => isAdminUserClipItem(accountId, job, visitorIds))
    .sort((a, b) => String(b.likedAt || b.updatedAt || b.createdAt || "").localeCompare(String(a.likedAt || a.updatedAt || a.createdAt || "")))
    .map((job) => {
      const item = toPublicClipItem(job);
      return {
        ...item,
        createdAt: job.createdAt || null,
        completedAt: job.completedAt || null
      };
    });
}

function isAdminUserClipItem(accountId, job, visitorIds = null) {
  const ownedVisitorIds = visitorIds || new Set(commerceStore.listVisitorIds(accountId));
  return Boolean(
    job &&
      job.visibility === "public" &&
      job.status === "succeeded" &&
      job.isLiked &&
      (String(job.ownerAccountId || "") ? String(job.ownerAccountId) === String(accountId) : ownedVisitorIds.has(job.ownerVisitorId))
  );
}

async function permanentlyDeleteAdminUser(account) {
  const accountId = String(account?.id || "");
  if (!accountId || !account?.isRegistered) throw createHttpError(404, "用户不存在。");

  const visitorIds = [...new Set(commerceStore.listVisitorIds(accountId))];
  const ownedVisitorIds = new Set(visitorIds);
  const ownsRecord = (record) => {
    const ownerAccountId = String(record?.ownerAccountId || "");
    return ownerAccountId ? ownerAccountId === accountId : ownedVisitorIds.has(String(record?.ownerVisitorId || ""));
  };
  const [jobs, drawCardSessions, bodyBookSessions, visitSessions] = await Promise.all([
    listImageJobs(),
    listDrawCardSessions(),
    listBodyBookSessions(),
    listVisitSessions()
  ]);
  const ownedJobs = jobs.filter(ownsRecord);
  const ownedDrawCardSessions = drawCardSessions.filter(ownsRecord);
  const ownedBodyBookSessions = bodyBookSessions.filter(ownsRecord);
  const ownedVisitSessions = visitSessions.filter((session) => ownedVisitorIds.has(String(session?.visitorId || "")));
  const orderIds = orderStore.deleteOrdersForAccount({ accountId, visitorIds });

  await Promise.all(orderIds.map(async (orderId) => {
    if (!isSafeImageJobId(orderId)) return;
    await Promise.all([
      rm(path.join(orderAssetPublicRoot, orderId), { recursive: true, force: true }),
      rm(path.join(orderOriginalArchiveRoot, orderId), { recursive: true, force: true })
    ]);
  }));

  await Promise.all(ownedJobs.map(async (job) => {
    const current = await readImageJob(job.jobId);
    if (!current) return;
    if (["queued", "running"].includes(current.status)) {
      activeImageJobs.get(current.jobId)?.abortController?.abort?.();
      await saveImageJob({
        ...current,
        status: "cancelled",
        message: "用户账户已删除，任务已停止。",
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      });
    }
    await deleteImageJob(current);
  }));

  await Promise.all([
    ...ownedDrawCardSessions.map((session) => rm(getDrawCardSessionPath(session.sessionId), { force: true })),
    ...ownedBodyBookSessions.flatMap((session) => [
      rm(getBodyBookSessionPath(session.sessionId), { force: true }),
      rm(path.join(bodyBookSessionRoot, session.sessionId), { recursive: true, force: true })
    ]),
    ...ownedVisitSessions.map((session) => rm(getVisitSessionPath(session.sessionId), { force: true })),
    ...visitorIds.map((visitorId) => deleteVisitorStateArtifacts(visitorId)),
    deleteTemporaryReferencesForVisitors(ownedVisitorIds),
    deleteAccountAvatarFile(account.wechatAvatarUrl)
  ]);

  const deleted = commerceStore.permanentlyDeleteRegisteredAccount(accountId);
  if (!deleted) throw createHttpError(404, "用户不存在。");
  return {
    deletedOrderCount: orderIds.length,
    deletedImageCount: ownedJobs.length,
    deletedProjectCount: ownedDrawCardSessions.length + ownedBodyBookSessions.length
  };
}

async function deleteVisitorStateArtifacts(visitorId) {
  if (!isSafeVisitorId(visitorId)) return;
  await mkdir(visitorStateRoot, { recursive: true });
  const prefix = `${visitorId}.`;
  const entries = await readdir(visitorStateRoot, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => rm(path.join(visitorStateRoot, entry.name), { force: true })));
}

async function deleteTemporaryReferencesForVisitors(visitorIds) {
  if (!visitorIds?.size) return;
  await mkdir(tempReferenceRoot, { recursive: true });
  const entries = await readdir(tempReferenceRoot, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      const metadata = JSON.parse(await readFile(path.join(tempReferenceRoot, entry.name, "metadata.json"), "utf-8"));
      if (visitorIds.has(String(metadata?.ownerVisitorId || ""))) {
        await rm(path.join(tempReferenceRoot, entry.name), { recursive: true, force: true });
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }));
}

async function deleteAccountAvatarFile(avatarUrl) {
  const match = String(avatarUrl || "").match(/^\/account-avatars\/([0-9a-f-]+\.(?:jpg|png|webp))$/i);
  if (!match) return;
  await rm(path.join(accountAvatarPublicRoot, match[1]), { force: true });
}

function toPublicDrawCardStyle(style) {
  const galleryImage = String(style?.galleryImage || style?.image || "");
  return {
    id: String(style?.id || ""),
    title: normalizeStyleTitle(style?.title, formatStyleName(style)),
    name: formatStyleName(style),
    tags: Array.isArray(style?.tags) ? style.tags.filter(Boolean) : [],
    subjectType: normalizeStyleSubjectType(style?.subjectType, style),
    image: String(style?.image || ""),
    galleryImage,
    imageUpdatedAt: style?.imageUpdatedAt || null,
    personGalleryImage: String(style?.personGalleryImage || style?.personImage || galleryImage),
    personImageUpdatedAt: style?.personImageUpdatedAt || style?.imageUpdatedAt || null,
    petGalleryImage: String(style?.petGalleryImage || style?.petImage || galleryImage),
    petImageUpdatedAt: style?.petImageUpdatedAt || style?.imageUpdatedAt || null
  };
}

function summarizeTelemetryPhases(telemetry) {
  const safeTelemetry = telemetry && typeof telemetry === "object" ? telemetry : {};
  const client = safeTelemetry.client && typeof safeTelemetry.client === "object" ? safeTelemetry.client : {};
  const server = safeTelemetry.server && typeof safeTelemetry.server === "object" ? safeTelemetry.server : {};
  return [
    { key: "client_prepare", label: "本地压图", valueMs: normalizeTelemetryNumber(client.prepareReferenceMs) },
    { key: "upload_parse", label: "上传解析", valueMs: normalizeTelemetryNumber(server.uploadParseMs) },
    { key: "session_create", label: "建会话", valueMs: normalizeTelemetryNumber(server.sessionCreateMs) },
    { key: "reference_persist", label: "参考图落盘", valueMs: normalizeTelemetryNumber(server.totalReferencePersistMs) },
    { key: "reference_thumbnail", label: "参考图缩略图", valueMs: normalizeTelemetryNumber(server.totalReferenceThumbnailMs) },
    { key: "final_total", label: "整轮总耗时", valueMs: normalizeTelemetryNumber(server.finalElapsedMs) }
  ].filter((item) => item.valueMs !== null);
}

function toPublicAdminDrawCardSession(session, publicJobs = []) {
  const current = normalizeDrawCardSession(session);
  const phases = summarizeTelemetryPhases(current.telemetry);
  const config = getPublicExperienceConfig(current.experienceType);
  return {
    sessionId: current.sessionId,
    traceId: current.traceId,
    experienceType: current.experienceType,
    experienceLabel: config.label,
    ownerVisitorId: current.ownerVisitorId,
    status: current.status,
    message: current.message,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    completedAt: current.completedAt,
    failedReason: current.failedReason,
    styleCount: current.items.length,
    requestedDrawCount: current.requestedDrawCount,
    requestedSubjectType: current.requestedSubjectType,
    jobSummary: current.telemetry.jobs,
    telemetry: current.telemetry,
    phases,
    charged: Boolean(current.quotaChargedAt),
    quotaChargedAt: current.quotaChargedAt,
    quotaChargedCount: current.quotaChargedCount,
    items: current.items,
    jobs: publicJobs
  };
}

async function sendAdminJobImage(res, job, options = {}) {
  const file = await resolveJobImageFile(job);
  if (!file) throw createHttpError(404, "高清图不存在。");
  const mimeType = mimeForExtension(path.extname(file).toLowerCase()) || "application/octet-stream";
  if (options.asDownload) {
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(file)}"`);
  }
  res.type(mimeType);
  res.sendFile(file);
}

async function sendPublicClipOriginalImage(res, job, resolvedFile = "") {
  const file = resolvedFile || await resolveJobImageFile(job);
  if (!file) throw createHttpError(404, "原图不存在。");
  const mimeType = mimeForExtension(path.extname(file).toLowerCase()) || "application/octet-stream";
  res.setHeader("Content-Disposition", `inline; filename="${path.basename(file)}"`);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type(mimeType);
  res.sendFile(file);
}

async function sendBodyBookOriginalImage(res, page, file, { inline = false } = {}) {
  const extension = path.extname(file).toLowerCase() || ".png";
  const safeKey = String(page?.key || "page").replace(/[^a-z0-9_-]/gi, "-") || "page";
  const filename = `my-first-book-${safeKey}${extension}`;
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type(mimeForExtension(extension) || "application/octet-stream");
  res.sendFile(file);
}

async function sendAdminReferenceImage(res, job, index) {
  const references = Array.isArray(job.originalReferences) ? [...job.originalReferences].sort((left, right) => Number(left.order || 0) - Number(right.order || 0)) : [];
  const reference = references[index];
  if (!reference) throw createHttpError(404, "参考图不存在。");
  const file = getJobReferenceFilePath(job.jobId, reference.url);
  if (!(await fileExists(file))) throw createHttpError(404, "参考图不存在。");
  res.type(reference.mimeType || mimeForExtension(path.extname(file).toLowerCase()) || "application/octet-stream");
  res.sendFile(file);
}

async function readPublicExperienceSessionReference(session) {
  const sessionItems = Array.isArray(session?.items) ? [...session.items].sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0)) : [];
  const jobId = String(sessionItems.find((item) => item?.jobId)?.jobId || "");
  if (!jobId) throw createHttpError(404, "该任务未找到可用参考图。", "该任务未找到可用参考图。");

  const job = await readImageJob(jobId);
  const references = Array.isArray(job?.originalReferences) ? [...job.originalReferences].sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0)) : [];
  // 风格自身若带参考图会排在前面，用户上传的照片始终位于最后。
  const reference = references[references.length - 1];
  if (!reference) throw createHttpError(404, "该任务未找到可用参考图。", "该任务未找到可用参考图。");

  const file = getJobReferenceFilePath(jobId, reference.url);
  if (!(await fileExists(file))) throw createHttpError(404, "该任务参考图已不可用。", "该任务参考图已不可用。");
  return {
    file,
    mimeType: String(reference.mimeType || mimeForExtension(path.extname(file).toLowerCase()) || "application/octet-stream")
  };
}

async function resolveJobImageFile(job) {
  const imageUrl = String(job?.result?.imageUrl || "");
  if (!imageUrl) return "";
  if (imageUrl.startsWith("/generated-images/")) {
    const filename = path.basename(imageUrl);
    const fullPath = path.join(generatedImageRoot, filename);
    return (await fileExists(fullPath)) ? fullPath : "";
  }
  const publicAssetPath = resolvePublicAssetFilePath(imageUrl);
  if (publicAssetPath && await fileExists(publicAssetPath)) return publicAssetPath;
  return "";
}

async function resolveBodyBookPageImageFile(page) {
  const jobId = String(page?.jobId || "");
  if (jobId) {
    const job = await readImageJob(jobId);
    const file = await resolveJobImageFile(job);
    if (file) return file;
  }
  const publicAssetPath = resolvePublicAssetFilePath(page?.result?.imageUrl);
  return publicAssetPath && await fileExists(publicAssetPath) ? publicAssetPath : "";
}

function getJobReferenceFilePath(jobId, url) {
  return path.join(jobReferenceRoot, String(jobId), path.basename(String(url || "")));
}

async function removeStyleFromGroups(styleId) {
  const groups = await readStyleGroups();
  const nextGroups = groups.map((group) => ({
    ...group,
    styleIds: group.styleIds.filter((currentId) => currentId !== styleId)
  }));
  await saveStyleGroups(nextGroups);
}

async function createDrawCardSession(file, visitor, options = {}) {
  const config = getPublicExperienceConfig(options?.experienceType);
  const traceId = String(options?.traceId || "").trim() || randomUUID();
  const requestStartedAtMs = normalizeTelemetryNumber(options?.requestStartedAtMs) || nowMs();
  const clientMetrics = options?.clientMetrics && typeof options.clientMetrics === "object" ? options.clientMetrics : {};
  const sessionCreateStartedAtMs = nowMs();
  const [groups, styles] = await Promise.all([readStyleGroups(), readStyles()]);
  const requestedStyleIds = config.experienceType === "draw-card" ? parseSelectedStyleIds(options?.selectedStyleIds) : [];
  const requestedDrawCount = config.experienceType === "draw-card" ? normalizeDrawCardCount(options?.requestedDrawCount) : 1;
  const requestedSubjectType = config.experienceType === "draw-card" ? normalizeUserSelectedSubject(options?.requestedSubjectType) : "";
  if (requestedStyleIds.length > DRAW_CARD_MAX_STYLE_COUNT) {
    const error = new Error("Too many selected styles");
    error.status = 400;
    error.publicMessage = `最多选择 ${DRAW_CARD_MAX_STYLE_COUNT} 种风格。`;
    throw error;
  }
  if (config.experienceType === "draw-card" && requestedStyleIds.length === 0 && !requestedSubjectType) {
    const error = new Error("Missing draw card subject type");
    error.status = 400;
    error.publicMessage = "请选择照片主体类型。";
    throw error;
  }

  const usesManualSelectedStyles = config.experienceType === "draw-card" && requestedStyleIds.length > 0;
  const usesAllStylesForExperience = config.experienceType === "draw-card" && !usesManualSelectedStyles;
  const group = usesAllStylesForExperience
    ? {
        id: "all-styles-random",
        name: "全部风格随机",
        size: DRAW_CARD_DEFAULT_SIZE
      }
    : usesManualSelectedStyles
      ? {
          id: "manual-selected-styles",
          name: "自选风格",
          size: DRAW_CARD_DEFAULT_SIZE
        }
    : groups.find((item) => String(item.name || "").trim() === config.styleGroupName);
  if (!group) {
    const error = new Error(`${config.label} group not found`);
    error.status = 503;
    error.publicMessage = config.unavailableMessage;
    throw error;
  }

  const styleMap = new Map(styles.map((style) => [style.id, style]));
  const sourceStyles = usesAllStylesForExperience
    ? styles.slice()
    : usesManualSelectedStyles
      ? requestedStyleIds.map((styleId) => styleMap.get(styleId)).filter(Boolean)
      : (group.styleIds || []).map((styleId) => styleMap.get(styleId)).filter(Boolean);
  if (usesManualSelectedStyles && sourceStyles.length !== requestedStyleIds.length) {
    const error = new Error("Selected styles are invalid");
    error.status = 400;
    error.publicMessage = "所选风格不存在，或已被删除。";
    throw error;
  }
  if (usesManualSelectedStyles && filterDrawCardEligibleStyles(sourceStyles).length !== sourceStyles.length) {
    const error = new Error("Selected styles are not available for draw card");
    error.status = 400;
    error.publicMessage = "所选风格当前不可用于抽卡，请重新选择。";
    throw error;
  }
  if (!sourceStyles.length) {
    const error = new Error(`${config.label} styles are empty`);
    error.status = 503;
    error.publicMessage = config.unavailableMessage;
    throw error;
  }

  const subjectClassification = usesManualSelectedStyles || usesAllStylesForExperience
    ? {
        subject: usesAllStylesForExperience ? requestedSubjectType : SUBJECT_UNKNOWN,
        confidence: null,
        providerId: "",
        provider: "",
        model: "",
        durationMs: null,
        reason: usesAllStylesForExperience ? "user_selected" : "manual_selection"
      }
    : await classifyUploadedSubject(file, {
        traceId,
        providerId: options?.subjectClassifierProviderId
      });
  const matchedStyles = usesManualSelectedStyles
    ? sourceStyles
    : usesAllStylesForExperience
      ? selectStylesForUserSubject(sourceStyles, requestedSubjectType)
      : selectStylesForDetectedSubject(sourceStyles, subjectClassification.subject);
  const drawCardEligibleStyles = usesAllStylesForExperience ? filterDrawCardEligibleStyles(matchedStyles) : matchedStyles;
  const selectedStyles = usesManualSelectedStyles
    ? sourceStyles
    : usesAllStylesForExperience
      ? sampleWeightedStyles(drawCardEligibleStyles, requestedDrawCount)
      : matchedStyles;
  const originalStyleCount = sourceStyles.length;
  const matchedStyleCount = matchedStyles.length;
  const drawCardEligibleStyleCount = drawCardEligibleStyles.length;
  const filteredStyleCount = selectedStyles.length;
  if (!selectedStyles.length) {
    const error = new Error(`${config.label} styles are empty after filtering`);
    error.status = 503;
    error.publicMessage = config.unavailableMessage;
    throw error;
  }
  const styleSource = usesManualSelectedStyles ? "manual_selection" : usesAllStylesForExperience ? "all_styles" : "group";

  const providers = getImageProviders();
  const settings = await readAppSettings();
  const provider = resolveImageProvider("", providers, settings);
  if (!provider) {
    const error = new Error("No image providers configured");
    error.status = 503;
    error.publicMessage = config.unavailableMessage;
    throw error;
  }

  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const ownerVisitorId = String(visitor?.visitorId || "");
  const ownerAccountId = String(options?.accountId || "");
  if (!ownerAccountId) throw createHttpError(401, "缺少网页账户。", "请先完成微信授权。");
  const uploadedBytes = Number(file.size || file.buffer?.length || 0);
  const sharedReferenceFiles = [
    {
      originalname: file.originalname || "draw-card-reference",
      mimetype: file.mimetype,
      size: Number(file.size || file.buffer?.length || 0),
      buffer: Buffer.from(file.buffer)
    }
  ];
  const providerChain = getProviderFallbackChain("", providers, settings);
  const preparedJobs = [];
  const sessionItems = [];
  let chargedJobIds = [];
  let totalReferencePersistMs = 0;
  let totalReferenceThumbnailMs = 0;
  let totalReferenceBytes = 0;

  logDrawCardTelemetry("session_create_started", {
    traceId,
    sessionId,
    visitorId: ownerVisitorId,
    subject: subjectClassification.subject,
    subjectConfidence: subjectClassification.confidence,
    subjectProviderId: subjectClassification.providerId,
    styleSource,
    requestedStyleCount: requestedStyleIds.length,
    requestedDrawCount,
    requestedSubjectType,
    originalStyleCount,
    matchedStyleCount,
    drawCardEligibleStyleCount,
    styleCount: filteredStyleCount,
    uploadedBytes,
    uploadParseMs: elapsedMs(requestStartedAtMs)
  });

  try {
    for (const [order, style] of selectedStyles.entries()) {
      const prompt = String(style.prompt || "").trim();
      const styleStartedAtMs = nowMs();
      const referenceFiles = await buildBatchReferenceFiles(style, sharedReferenceFiles);
      const jobId = randomUUID();
      const styleName = formatStyleName(style);
      const persistedReferenceResult = await persistImageJobReferences(jobId, referenceFiles, {
        includeMetrics: true,
        telemetry: {
          traceId,
          sessionId,
          jobId,
          styleId: String(style.id || ""),
          styleName,
          order
        }
      });
      const originalReferences = persistedReferenceResult.references;
      totalReferencePersistMs += Number(persistedReferenceResult.metrics?.persistMs || 0);
      totalReferenceThumbnailMs += Number(persistedReferenceResult.metrics?.thumbnailMs || 0);
      totalReferenceBytes += Number(persistedReferenceResult.metrics?.totalBytes || 0);
      const job = {
        jobId,
        experienceType: config.experienceType,
        status: "queued",
        message: "任务已提交，等待生成。",
        result: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        prompt: buildPublicExperiencePrompt(prompt, config),
        size: group.size,
        referenceCount: referenceFiles.length,
        originalReferences,
        styleId: String(style.id || ""),
        styleName,
        styleGroupId: group.id,
        styleGroupName: group.name,
        provider: {
          id: provider.id,
          name: provider.name,
          model: provider.model
        },
        mode: referenceFiles.length ? "edit" : "generation",
        ownerVisitorId,
        ownerAccountId,
        visibility: "public",
        telemetry: {
          traceId,
          sessionId,
          styleId: String(style.id || ""),
          styleName,
          order,
          providerCallMs: null,
          persistResultMs: null,
          totalJobMs: null
        }
      };

      preparedJobs.push({
        job,
        runArgs: {
          jobId,
          body: {
            size: group.size,
            quality: "medium",
            output_format: "png",
            background: config.experienceType === "fridge-magnet" ? "opaque" : "auto",
            moderation: "auto",
            styleId: style.id,
            styleName,
            styleGroupId: group.id,
            styleGroupName: group.name
          },
          files: referenceFiles.map(cloneReferenceFile),
          outputFormat: "png",
          prompt: buildPublicExperiencePrompt(prompt, config),
          provider,
          providers: providerChain,
          telemetry: {
            traceId,
            sessionId,
            visitorId: ownerVisitorId,
            styleId: String(style.id || ""),
            styleName,
            order
          }
        }
      });
      sessionItems.push({
        order,
        jobId,
        styleId: String(style.id || ""),
        styleName
      });

      logDrawCardTelemetry("style_job_prepared", {
        traceId,
        sessionId,
        jobId,
        styleId: String(style.id || ""),
        styleName,
        order,
        referenceCount: referenceFiles.length,
        stylePrepareMs: elapsedMs(styleStartedAtMs),
        referencePersistMs: Number(persistedReferenceResult.metrics?.persistMs || 0),
        referenceThumbnailMs: Number(persistedReferenceResult.metrics?.thumbnailMs || 0)
      });
    }

    await Promise.all(preparedJobs.map((item) => saveImageJob(item.job)));
    if (preparedJobs.length) {
      const charge = commerceStore.debitCreditsForGenerationJobs({
        accountId: ownerAccountId,
        jobIds: preparedJobs.map((item) => item.job.jobId),
        reason: "image_generation"
      });
      chargedJobIds = charge.chargedJobIds;
    }

    const session = await saveDrawCardSession({
      sessionId,
      traceId,
      experienceType: config.experienceType,
      ownerVisitorId,
      ownerAccountId,
      status: "queued",
      message: config.waitingMessage,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      failedReason: "",
      quotaChargedAt: chargedJobIds.length ? new Date().toISOString() : null,
      quotaChargedCount: chargedJobIds.length,
      chargedJobIds,
      refundedJobIds: [],
      requestedDrawCount: usesAllStylesForExperience ? requestedDrawCount : selectedStyles.length,
      requestedSubjectType,
      telemetry: {
        client: {
          prepareReferenceMs: clientMetrics.prepareReferenceMs,
          originalBytes: clientMetrics.originalBytes,
          uploadedBytes: clientMetrics.uploadedBytes || uploadedBytes,
          originalWidth: clientMetrics.originalWidth,
          originalHeight: clientMetrics.originalHeight,
          uploadedWidth: clientMetrics.uploadedWidth,
          uploadedHeight: clientMetrics.uploadedHeight,
          wasCompressed: Boolean(clientMetrics.wasCompressed)
        },
        server: {
          uploadParseMs: elapsedMs(requestStartedAtMs),
          sessionCreateMs: elapsedMs(sessionCreateStartedAtMs),
          requestAcceptedMs: elapsedMs(requestStartedAtMs),
          subject: subjectClassification.subject,
          subjectConfidence: subjectClassification.confidence,
          subjectProviderId: subjectClassification.providerId,
          subjectProvider: subjectClassification.provider,
          subjectModel: subjectClassification.model,
          subjectClassificationMs: normalizeTelemetryNumber(subjectClassification.durationMs),
          styleSource,
          requestedDrawCount,
          requestedSubjectType,
          originalStyleCount,
          matchedStyleCount,
          drawCardEligibleStyleCount,
          filteredStyleCount,
          totalReferencePersistMs,
          totalReferenceThumbnailMs,
          totalReferenceBytes,
          finalStatus: "queued",
          finalElapsedMs: null,
          quotaChargeStatus: chargedJobIds.length ? "charged_on_submit" : "not_charged",
          charged: chargedJobIds.length > 0,
          quotaChargedCount: chargedJobIds.length
        },
        jobs: summarizeDrawCardJobStatuses(sessionItems.map((item) => ({ status: item.status || "queued" })))
      },
      results: [],
      items: sessionItems
    });

    logDrawCardTelemetry("session_created", {
      traceId,
      sessionId,
      visitorId: ownerVisitorId,
      subject: subjectClassification.subject,
      subjectConfidence: subjectClassification.confidence,
      subjectProviderId: subjectClassification.providerId,
      styleSource,
      requestedDrawCount,
      requestedSubjectType,
      originalStyleCount,
      matchedStyleCount,
      drawCardEligibleStyleCount,
      styleCount: filteredStyleCount,
      sessionCreateMs: elapsedMs(sessionCreateStartedAtMs),
      requestAcceptedMs: elapsedMs(requestStartedAtMs),
      totalReferencePersistMs,
      totalReferenceThumbnailMs,
      totalReferenceBytes
    });

    preparedJobs.forEach((item) => {
      runImageJob(item.runArgs).catch((error) => {
        console.error("Draw card image job failed.", error);
      });
    });

    return session;
  } catch (error) {
    if (chargedJobIds.length) {
      try {
        commerceStore.refundCreditsForGenerationJobs({
          accountId: ownerAccountId,
          jobIds: chargedJobIds,
          reason: "image_generation_submit_refund"
        });
      } catch (refundError) {
        console.error("Failed to refund draw card submission charge.", refundError);
      }
    }
    await Promise.all(
      preparedJobs.map(async (item) => {
        await deleteJobReferences(item.job);
        await rm(getImageJobPath(item.job.jobId), { force: true });
      })
    );
    await rm(getDrawCardSessionPath(sessionId), { force: true });
    logDrawCardTelemetry("session_create_failed", {
      traceId,
      sessionId,
      visitorId: ownerVisitorId,
      elapsedMs: elapsedMs(sessionCreateStartedAtMs),
      message: error.publicMessage || error.message || "unknown error"
    });
    throw error;
  }
}

async function readDrawCardSession(sessionId) {
  if (!isSafeDrawCardSessionId(sessionId)) return null;
  try {
    const rawText = await readFile(getDrawCardSessionPath(sessionId), "utf-8");
    try {
      return normalizeDrawCardSession(JSON.parse(rawText));
    } catch (error) {
      console.warn(`Skipping unreadable draw card session: ${sessionId}`);
      console.warn(error);
      return null;
    }
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function listDrawCardSessions() {
  await mkdir(drawCardSessionRoot, { recursive: true });
  const entries = await readdir(drawCardSessionRoot, { withFileTypes: true });
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readDrawCardSession(entry.name.replace(/\.json$/, "")))
  );
  return sessions.filter(Boolean);
}

async function readLatestAccountDrawCardSession(account, visitorId, experienceType = "") {
  if (!account?.id || !isSafeVisitorId(visitorId)) return null;
  const sessions = await listDrawCardSessions();
  const latest = sessions
    .filter(
      (session) =>
        accountOwnsPublicRecord(account, session) &&
        (!experienceType || normalizePublicExperienceType(session.experienceType) === normalizePublicExperienceType(experienceType))
    )
    .sort((left, right) =>
      String(right.updatedAt || right.completedAt || right.createdAt || "").localeCompare(
        String(left.updatedAt || left.completedAt || left.createdAt || "")
      )
    )[0];

  if (!latest) return null;
  if (!["queued", "running", "succeeded", "partial"].includes(String(latest.status || ""))) return null;
  return latest;
}

async function saveDrawCardSession(session) {
  await mkdir(drawCardSessionRoot, { recursive: true });
  const safeSession = normalizeDrawCardSession(session);
  await writeFile(getDrawCardSessionPath(safeSession.sessionId), `${JSON.stringify(safeSession, null, 2)}\n`, "utf-8");
  return safeSession;
}

async function withDrawCardSessionSyncLock(sessionId, task) {
  const key = String(sessionId || "");
  const previous = drawCardSessionSyncLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  drawCardSessionSyncLocks.set(key, current);
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (drawCardSessionSyncLocks.get(key) === current) {
      drawCardSessionSyncLocks.delete(key);
    }
  }
}

async function synchronizeDrawCardSession(session) {
  const normalizedSession = normalizeDrawCardSession(session);
  const config = getPublicExperienceConfig(normalizedSession.experienceType);
  return withDrawCardSessionSyncLock(normalizedSession.sessionId, async () => {
    const current = (await readDrawCardSession(normalizedSession.sessionId)) || normalizedSession;
    const jobs = await Promise.all(current.items.map((item) => readImageJob(item.jobId)));
    const normalizedItems = current.items.map((item, index) => {
      const job = jobs[index];
      const imageUrl = String(job?.result?.previewUrl || job?.result?.thumbnailUrl || job?.result?.imageUrl || "");
      const thumbnailUrl = String(job?.result?.thumbnailUrl || job?.result?.previewUrl || job?.result?.imageUrl || "");
      const originalImageUrl = String(job?.result?.originalImageUrl || "");
      const previewUrl = String(job?.result?.previewUrl || job?.result?.thumbnailUrl || job?.result?.imageUrl || "");
      const status = String(job?.status || "failed");
      return {
        ...item,
        status,
        result: status === "succeeded"
          ? {
              imageUrl,
              thumbnailUrl,
              originalImageUrl,
              previewUrl,
              isLiked: Boolean(job?.isLiked),
              likedAt: job?.likedAt || null
            }
          : null,
        errorMessage: ["failed", "cancelled"].includes(status)
          ? String(job?.message || (status === "cancelled" ? "任务已停止。" : "生成失败。"))
          : ""
      };
    });

    let nextStatus = "queued";
    let nextMessage = config.waitingMessage;
    let completedAt = null;
    let failedReason = "";
    const results = normalizedItems
      .filter((item) => item.status === "succeeded" && item.result)
      .map((item) => ({
        order: item.order,
        jobId: item.jobId,
        styleId: item.styleId,
        styleName: item.styleName,
        imageUrl: String(item.result?.imageUrl || item.result?.previewUrl || ""),
        thumbnailUrl: String(item.result?.thumbnailUrl || item.result?.imageUrl || ""),
        originalImageUrl: String(item.result?.originalImageUrl || ""),
        previewUrl: String(item.result?.previewUrl || item.result?.imageUrl || ""),
        isLiked: Boolean(item.result?.isLiked),
        likedAt: item.result?.likedAt || null
      }))
      .sort((a, b) => a.order - b.order);
    const summary = summarizeDrawCardJobStatuses(normalizedItems);
    const hasQueued = summary.queued > 0;
    const hasRunning = summary.running > 0;
    const successCount = summary.succeeded;
    const failedCount = summary.failed + summary.cancelled;
    const hasPending = hasQueued || hasRunning;
    const chargedJobIds = new Set(current.chargedJobIds || []);
    const refundedJobIds = new Set(current.refundedJobIds || []);
    const failedJobIds = normalizedItems
      .filter((item) => ["failed", "cancelled"].includes(item.status) && chargedJobIds.has(item.jobId) && !refundedJobIds.has(item.jobId))
      .map((item) => item.jobId);
    let billingError = "";
    if (failedJobIds.length) {
      try {
        const refund = commerceStore.refundCreditsForGenerationJobs({
          accountId: current.ownerAccountId,
          jobIds: failedJobIds,
          reason: "image_generation_refund"
        });
        refund.refundedJobIds.forEach((jobId) => refundedJobIds.add(jobId));
      } catch (error) {
        billingError = error.publicMessage || error.message || "币退款失败，请联系客服。";
      }
    }
    const quotaChargedAt = current.quotaChargedAt || null;
    const quotaChargedCount = Math.max(0, chargedJobIds.size - refundedJobIds.size);
    const quotaChargeStatus = billingError
      ? "refund_failed"
      : refundedJobIds.size > 0
        ? "partially_refunded"
        : chargedJobIds.size > 0
          ? "charged_on_submit"
          : "not_charged";

    if (jobs.length && successCount === jobs.length) {
      nextStatus = "succeeded";
      nextMessage = config.successMessage;
      completedAt = current.completedAt || new Date().toISOString();
    } else if (hasPending) {
      nextStatus = hasRunning ? "running" : "queued";
      nextMessage = config.waitingMessage;
    } else if (successCount > 0 && failedCount > 0) {
      nextStatus = "partial";
      nextMessage = config.partialMessage;
      completedAt = current.completedAt || new Date().toISOString();
    } else if (failedCount > 0 && successCount === 0) {
      nextStatus = "failed";
      nextMessage = config.failureMessage;
      completedAt = current.completedAt || new Date().toISOString();
      failedReason = config.failureMessage;
    } else if (jobs.some((job) => job?.status === "running")) {
      nextStatus = "running";
      nextMessage = config.waitingMessage;
    } else {
      nextStatus = "queued";
      nextMessage = config.waitingMessage;
    }

    const nextTelemetry = {
      client: {
        ...(current.telemetry?.client || {})
      },
      server: {
        ...(current.telemetry?.server || {}),
        finalStatus: nextStatus,
        finalElapsedMs: completedAt && current.createdAt
          ? Math.max(0, Math.round(new Date(completedAt).getTime() - new Date(current.createdAt).getTime()))
          : current.telemetry?.server?.finalElapsedMs || null,
        quotaChargeStatus,
        charged: quotaChargedCount > 0,
        quotaChargedCount
      },
      jobs: summarizeDrawCardJobStatuses(normalizedItems)
    };

    logDrawCardTelemetry("session_status_updated", {
      traceId: current.traceId,
      sessionId: current.sessionId,
      visitorId: current.ownerVisitorId,
      status: nextStatus,
      failedReason,
      quotaChargeStatus: nextTelemetry.server.quotaChargeStatus,
      charged: nextTelemetry.server.charged,
      quotaChargedCount,
      jobSummary: nextTelemetry.jobs
    });

    return saveDrawCardSession({
      ...current,
      experienceType: config.experienceType,
      status: nextStatus,
      message: nextMessage,
      updatedAt: new Date().toISOString(),
      completedAt,
      failedReason,
      quotaChargedAt,
      quotaChargedCount,
      chargedJobIds: [...chargedJobIds],
      refundedJobIds: [...refundedJobIds],
      billingError,
      telemetry: nextTelemetry,
      results,
      items: normalizedItems
    });
  });
}

async function synchronizeDrawCardSessionByJobId(jobId) {
  if (!isSafeImageJobId(jobId)) return null;
  const sessions = await listDrawCardSessions();
  const session = sessions.find((current) => current.items.some((item) => item.jobId === jobId));
  if (!session) return null;
  return synchronizeDrawCardSession(session);
}

async function cancelDrawCardSiblingJobs(jobs) {
  const cancellableJobs = jobs.filter((job) => job && ["queued", "running"].includes(job.status));
  await Promise.all(
    cancellableJobs.map(async (job) => {
      activeImageJobs.get(job.jobId)?.abortController.abort();
      await saveImageJob({
        ...job,
        status: "cancelled",
        message: "任务已停止。",
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      });
    })
  );
}

function normalizeDrawCardSession(session) {
  const telemetry = session?.telemetry && typeof session.telemetry === "object" ? session.telemetry : {};
  const telemetryClient = telemetry.client && typeof telemetry.client === "object" ? telemetry.client : {};
  const telemetryServer = telemetry.server && typeof telemetry.server === "object" ? telemetry.server : {};
  const config = getPublicExperienceConfig(session?.experienceType);
  const existingItemCount = Array.isArray(session?.items) ? session.items.length : 0;
  const requestedDrawCount = config.experienceType === "draw-card"
    ? normalizeDrawCardCount(session?.requestedDrawCount ?? telemetryServer.requestedDrawCount, existingItemCount || DRAW_CARD_DEFAULT_STYLE_COUNT)
    : Number(session?.requestedDrawCount || 0);
  const requestedSubjectType = config.experienceType === "draw-card"
    ? normalizeUserSelectedSubject(session?.requestedSubjectType || telemetryServer.requestedSubjectType)
    : "";
  const rawQuotaChargedCount = Number(session?.quotaChargedCount ?? telemetryServer.quotaChargedCount);
  const legacyQuotaChargedCount = Number.isFinite(rawQuotaChargedCount)
    ? Math.max(0, Math.round(rawQuotaChargedCount))
    : session?.quotaChargedAt
      ? 1
      : 0;
  const chargedJobIds = Array.isArray(session?.chargedJobIds) ? session.chargedJobIds.map(String).filter(Boolean) : [];
  const refundedJobIds = Array.isArray(session?.refundedJobIds) ? session.refundedJobIds.map(String).filter(Boolean) : [];
  const quotaChargedCount = chargedJobIds.length
    ? Math.max(0, chargedJobIds.length - new Set(refundedJobIds).size)
    : legacyQuotaChargedCount;
  const normalizedResults = Array.isArray(session?.results)
    ? session.results
        .map((result, index) => ({
          order: Number(result?.order ?? index),
          jobId: String(result?.jobId || ""),
          styleId: String(result?.styleId || ""),
          styleName: String(result?.styleName || ""),
          imageUrl: String(result?.imageUrl || result?.previewUrl || ""),
          thumbnailUrl: String(result?.thumbnailUrl || ""),
          originalImageUrl: String(result?.originalImageUrl || ""),
          previewUrl: String(result?.previewUrl || result?.thumbnailUrl || result?.imageUrl || ""),
          isLiked: Boolean(result?.isLiked),
          likedAt: result?.likedAt || null
        }))
        .sort((a, b) => a.order - b.order)
    : [];
  const resultByJobId = new Map(normalizedResults.map((result) => [result.jobId, result]));
  const normalizedItems = Array.isArray(session?.items)
    ? session.items
        .map((item, index) => {
          const fallbackResult = resultByJobId.get(String(item?.jobId || "")) || null;
          const itemResult = item?.result && typeof item.result === "object" ? item.result : fallbackResult;
          return {
            order: Number(item?.order ?? index),
            jobId: String(item?.jobId || ""),
            styleId: String(item?.styleId || ""),
            styleName: String(item?.styleName || ""),
            status: String(item?.status || (itemResult ? "succeeded" : "queued")),
            result: itemResult
              ? {
                  imageUrl: String(itemResult.imageUrl || itemResult.previewUrl || ""),
                  thumbnailUrl: String(itemResult.thumbnailUrl || itemResult.imageUrl || ""),
                  originalImageUrl: String(itemResult.originalImageUrl || ""),
                  previewUrl: String(itemResult.previewUrl || itemResult.thumbnailUrl || itemResult.imageUrl || ""),
                  isLiked: Boolean(itemResult.isLiked),
                  likedAt: itemResult.likedAt || null
                }
              : null,
            errorMessage: String(item?.errorMessage || "")
          };
        })
        .sort((a, b) => a.order - b.order)
    : [];
  const summary = summarizeDrawCardJobStatuses(normalizedItems);
  return {
    sessionId: String(session?.sessionId || ""),
    traceId: String(session?.traceId || ""),
    experienceType: config.experienceType,
    ownerVisitorId: String(session?.ownerVisitorId || ""),
    ownerAccountId: String(session?.ownerAccountId || ""),
    status: String(session?.status || "queued"),
    message: String(session?.message || config.waitingMessage),
    createdAt: session?.createdAt || null,
    updatedAt: session?.updatedAt || null,
    completedAt: session?.completedAt || null,
    failedReason: String(session?.failedReason || ""),
    quotaChargedAt: session?.quotaChargedAt || null,
    quotaChargedCount,
    chargedJobIds,
    refundedJobIds,
    billingError: String(session?.billingError || ""),
    requestedDrawCount,
    requestedSubjectType,
    telemetry: {
      client: {
        prepareReferenceMs: normalizeTelemetryNumber(telemetryClient.prepareReferenceMs),
        originalBytes: normalizeTelemetryNumber(telemetryClient.originalBytes),
        uploadedBytes: normalizeTelemetryNumber(telemetryClient.uploadedBytes),
        originalWidth: normalizeTelemetryNumber(telemetryClient.originalWidth),
        originalHeight: normalizeTelemetryNumber(telemetryClient.originalHeight),
        uploadedWidth: normalizeTelemetryNumber(telemetryClient.uploadedWidth),
        uploadedHeight: normalizeTelemetryNumber(telemetryClient.uploadedHeight),
        wasCompressed: Boolean(telemetryClient.wasCompressed)
      },
      server: {
        uploadParseMs: normalizeTelemetryNumber(telemetryServer.uploadParseMs),
        sessionCreateMs: normalizeTelemetryNumber(telemetryServer.sessionCreateMs),
        requestAcceptedMs: normalizeTelemetryNumber(telemetryServer.requestAcceptedMs),
        subject: normalizeDetectedSubject(telemetryServer.subject),
        subjectConfidence: clampConfidence(telemetryServer.subjectConfidence),
        subjectProviderId: String(telemetryServer.subjectProviderId || ""),
        subjectProvider: String(telemetryServer.subjectProvider || ""),
        subjectModel: String(telemetryServer.subjectModel || ""),
        subjectClassificationMs: normalizeTelemetryNumber(telemetryServer.subjectClassificationMs),
        styleSource: String(telemetryServer.styleSource || ""),
        requestedDrawCount,
        requestedSubjectType,
        originalStyleCount: normalizeTelemetryNumber(telemetryServer.originalStyleCount),
        matchedStyleCount: normalizeTelemetryNumber(telemetryServer.matchedStyleCount),
        drawCardEligibleStyleCount: normalizeTelemetryNumber(telemetryServer.drawCardEligibleStyleCount),
        filteredStyleCount: normalizeTelemetryNumber(telemetryServer.filteredStyleCount),
        totalReferencePersistMs: normalizeTelemetryNumber(telemetryServer.totalReferencePersistMs),
        totalReferenceThumbnailMs: normalizeTelemetryNumber(telemetryServer.totalReferenceThumbnailMs),
        totalReferenceBytes: normalizeTelemetryNumber(telemetryServer.totalReferenceBytes),
        finalStatus: String(telemetryServer.finalStatus || ""),
        finalElapsedMs: normalizeTelemetryNumber(telemetryServer.finalElapsedMs),
        quotaChargeStatus: String(telemetryServer.quotaChargeStatus || ""),
        charged: Boolean(telemetryServer.charged),
        quotaChargedCount
      },
      jobs: summary
    },
    charged: quotaChargedCount > 0,
    summary,
    results: normalizedResults,
    items: normalizedItems
  };
}

function toPublicDrawCardSession(session) {
  const current = normalizeDrawCardSession(session);
  return {
    sessionId: current.sessionId,
    traceId: current.traceId,
    experienceType: current.experienceType,
    status: current.status,
    message: current.message,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    completedAt: current.completedAt,
    failedReason: current.failedReason,
    charged: current.charged,
    quotaChargedAt: current.quotaChargedAt,
    quotaChargedCount: current.quotaChargedCount,
    quotaRefundedCount: current.refundedJobIds.length,
    billingError: current.billingError,
    requestedDrawCount: current.requestedDrawCount,
    requestedSubjectType: current.requestedSubjectType,
    summary: current.summary,
    telemetry: current.telemetry,
    results: current.results,
    items: current.items
  };
}

function getBookTheme(themeId) {
  return BOOK_THEME_DEFINITIONS.find((theme) => theme.id === String(themeId || "").trim().toLowerCase()) || null;
}

function toPublicBookTheme(theme, layoutVersion = getNewBodyBookLayoutVersion(theme)) {
  const pages = getBodyBookPageDefinitions(theme, layoutVersion);
  return {
    id: theme.id,
    name: theme.name,
    englishName: theme.englishName,
    title: theme.title,
    pageCount: getBodyBookPrintPageCount(theme),
    // This is the product's fixed generation allowance, not the number of
    // optional topics currently available in the picker. For example, the
    // career theme exposes more topic choices but each physical book still
    // contains exactly 17 generated pages.
    generationPageCount: getBodyBookSelectionPageCount(theme, layoutVersion),
    contents: pages
  };
}

function getBodyBookPart(partKey, themeId = "body") {
  const key = String(partKey || "").trim().toLowerCase();
  return getBookTheme(themeId)?.parts.find((part) => part.key === key) || null;
}

function buildBodyBookCoverPrompt(theme = getBookTheme("body")) {
  const profile = getBodyBookPromptProfile(theme);
  const pageBackground = theme?.id === "color" ? "a pure white (#FFFFFF) studio-paper page only" : "a clean white or warm-cream studio page";
  return `Use the uploaded baby photo as the only identity reference. Preserve the baby's facial features, skin tone, age impression, and natural hair. Do not copy the clothing, pose, props, or background from the reference photo; follow this page's theme art direction instead. Create one square 1:1 cover for a bilingual 0-3 year-old ${theme.name}. The main title should read exactly: "${theme.englishName}". The Chinese subtitle should read exactly: "${theme.title}". Beneath it, add the small English line: "A Bilingual Book for Babies" and the small Chinese line: "中英双语 · 0-3岁宝宝启蒙". Use rounded, highly legible sans-serif typography; make the English title playful with a refined natural rainbow palette, while keeping Chinese text dark and clear. Add a small pink circular badge in the upper-right that reads "0-3岁适用". Compose the baby as the clear central subject in a realistic, detailed professional baby portrait with soft warm daylight and natural skin texture. Theme scene: ${profile.coverScene}. Use ${pageBackground}, ${profile.accents} accents, ample breathing room, subtle paper texture, and a few neat cutout-style elements with fine white outlines. DK children's encyclopedia style: premium early-learning editorial layout, white-background cutout-object collage composition, realistic baby photography blended with restrained children's illustration, bright but gentle, clean and modern. Do not create a busy room, scenic background, deep depth, extra people, watermark, border, illegible decorative text, collage panels, or 3D animation look.`;
}

function buildBodyBookPartPrompt(part, order, theme = getBookTheme("body")) {
  if (theme?.id === "color") return buildColorBookPartPrompt(part, order, theme);
  const profile = getBodyBookPromptProfile(theme);
  const visualDirection = getBodyBookPartVisualDirection(theme?.id, part?.conceptKey || part?.colorKey || part?.key);
  const concept = getBodyBookLearningConcept(part);
  return `Use the uploaded baby photo as the only identity reference. Preserve the baby's facial features, skin tone, age impression, and natural hair. Do not copy the clothing, pose, props, or background from the reference photo; follow this page's theme art direction instead. Create one square 1:1 bilingual ${theme.name} learning card for ages 0-3. The sole learning concept is "${concept.english} / ${concept.chinese}". The image must attempt to render this heading exactly: "${concept.chinese} ${concept.english}". Include this short bilingual sentence exactly: "${part.copy}". The terms "宝宝页", "Baby Page", "${concept.chinese}宝宝页", and "${concept.english} Baby" are internal production labels: never render them anywhere in the image, title, subtitle, or decorative text. Make the requested concept immediate and unmistakable; do not introduce competing learning concepts. Theme scene: ${profile.cardScene}. Mandatory page-specific art direction: ${visualDirection} Keep the same baby recognizable, but change the outfit, body position, action, and any prop to match this learning concept. Do not reuse a generic repeated outfit, standing pose, waving pose, or the same pose from another page. Use a white or warm-cream page, ${profile.accents} accents, soft warm natural light, natural skin texture, and generous white space. Add one clear dotted arrow or visual cue pointing to the requested concept, plus only one or two small matching ${profile.icons}. Use clean black or deep-charcoal rounded sans-serif type, with the learning word larger than the supporting sentence. DK children's encyclopedia style: white-background cutout-object collage composition, realistic baby photography blended with subtle cutout illustration, thin white outlines, a soft paper texture, gentle bright color, and no harsh shadows. No extra people, no busy room, no scenic environment, no deep background, no watermark, no border, no collage panels, no unrelated objects, no unreadable decorative text, and no 3D animation look.`;
}

function getBodyBookLearningConcept(part) {
  const chinese = String(part?.chinese || "")
    .replace(/(?:宝宝页|物品页|预设页|认知页)$/u, "")
    .trim();
  const english = String(part?.english || "")
    .replace(/\s+(?:Baby|Objects|Preset|Page)$/iu, "")
    .trim();
  return {
    chinese: chinese || String(part?.chinese || "").trim(),
    english: english || String(part?.english || "").trim()
  };
}

function getBodyBookPartVisualDirection(themeId, partKey) {
  const directions = {
    body: {
      head: "Dress the baby in a soft sage-green short-sleeve bodysuit; show a three-quarter seated pose with both hands gently patting the top of their head.",
      eyes: "Dress the baby in a pale-yellow knit romper; show the baby holding soft toy binoculars at chest level and looking toward a tiny star, with eyes fully visible.",
      ears: "Dress the baby in a light-blue overall set; show the baby leaning their head slightly and cupping one ear as if listening to a tiny illustrated bell.",
      nose: "Dress the baby in a soft apricot romper; show the baby gently smelling one small flower held near the nose, with the nose unobstructed.",
      mouth: "Dress the baby in a warm-cream bib romper; show a close smiling pose blowing a tiny illustrated bubble, with the mouth clearly visible.",
      cheeks: "Dress the baby in a blush-pink knit cardigan over a cream romper; show a close seated smile with both open palms gently resting on the cheeks, keeping both cheeks fully visible.",
      chin: "Dress the baby in a soft sky-blue bib romper; show a relaxed close seated pose with one finger gently touching below the lower lip, keeping the chin fully visible and unobstructed.",
      hair: "Dress the baby in a soft lavender cardigan over a cream romper; show a close seated pose gently touching a small lock of hair with one hand, with the hair fully visible.",
      teeth: "Dress the baby in a clean mint-green cotton romper and a small towel bib; show a happy open smile while safely holding a toddler toothbrush beside the teeth.",
      arms: "Dress the baby in a short-sleeve coral romper; show both bare arms stretched wide toward two small friendly stars.",
      hands: "Dress the baby in a simple sky-blue short-sleeve top and soft shorts; show both open hands touching a textured fabric square.",
      fingers: "Dress the baby in a soft yellow romper; show one hand close to the camera with fingers gently spread around a large soft fabric flower.",
      legs: "Dress the baby in a soft coral T-shirt and short cotton bloomers; show a safe floor-seated pose with both bare legs stretched forward and gently kicking toward one small soft ball, with legs fully visible.",
      feet: "Dress the baby in a short-sleeve cotton bodysuit and contrasting soft socks; show a safe seated pose with both feet lifted toward a small ball.",
      toes: "Dress the baby in a pale aqua romper; show a safe seated pose with bare toes lightly touching a tiny soft ball, with toes clearly visible.",
      tummy: "Dress the baby in a two-piece cotton outfit with a softly lifted shirt edge; show a gentle seated giggle with one hand resting on the tummy, always modest and age-appropriate.",
      knees: "Dress the baby in soft mustard overalls with bare knees visible; show a stable crawling or kneeling play pose beside one small block."
    },
    emotion: {
      happy: "Dress the baby in a sunshine-yellow romper with a tiny smiling-sun patch; show a bright open smile while clapping both hands.",
      sad: "Dress the baby in a soft powder-blue knit romper; show a mild, non-distressing pout while gently cuddling one small cloud-shaped plush.",
      angry: "Dress the baby in a coral-red cotton overall set; show a gentle scrunched-brow expression with tiny relaxed fists, never shouting, crying, or looking distressed.",
      surprised: "Dress the baby in a lavender romper with a star patch; show wide eyes, a softly open mouth, and both hands raised near the cheeks beside one tiny pop-up star.",
      scared: "Dress the baby in a cozy mint-green hooded romper; show a mild uncertain expression while peeking from behind one friendly moon-shaped plush, never horror-themed.",
      shy: "Dress the baby in a blush-pink cardigan over a cream romper; show a small smile with the chin lowered and one hand partly covering the cheek.",
      excited: "Dress the baby in a bright teal-and-yellow sporty romper; show an energetic seated bounce with both arms lifted beside two small confetti marks.",
      calm: "Dress the baby in a soft aqua cotton sleep suit; show a relaxed cross-legged seated pose holding one small leaf, with a peaceful closed-mouth smile.",
      proud: "Dress the baby in a warm-orange overall set with a small gold-star badge; show a confident upright seated pose holding up one finished block tower.",
      sleepy: "Dress the baby in a soft lilac sleep suit; show a gentle yawn with one hand near the mouth while hugging one small cloud-shaped cushion, with a calm sleepy expression.",
      curious: "Dress the baby in a mint-green overall set; show a forward-leaning seated pose with wide attentive eyes looking through a large safe cardboard magnifying-glass prop at one small leaf.",
      upset: "Dress the baby in a soft powder-pink romper; show a mild, non-distressing lower-lip pout while gently holding one small heart-shaped cushion, never crying or showing tears.",
      expectant: "Dress the baby in a sunny-yellow cardigan over a cream romper; show an eager forward-leaning seated pose with hands lightly clasped and bright attentive eyes looking at one small wrapped surprise box.",
      bored: "Dress the baby in a pale-gray cotton romper; show a gentle resting-cheek-on-hand seated pose beside one closed picture book, with a mild neutral expression and no distress.",
      confused: "Dress the baby in a soft lavender overall set; show a gentle tilted-head seated pose with one hand slightly raised beside two small floating question-mark doodles, never distressed.",
      loving: "Dress the baby in a warm peach romper with a tiny heart patch; show a soft affectionate smile while hugging one small heart-shaped cushion, with two restrained heart doodles nearby."
    },
    transport: {
      car: "Dress the baby in a soft red driving jacket, navy shorts, and a small matching driver cap; show a floor-seated pose joyfully playing with one red toy car. Never show any real full-size car, ride-on vehicle, or driving scene.",
      bus: "Dress the baby in a sunny-yellow travel romper and a tiny soft cap; show a floor-seated pose pushing one yellow toy bus. Never show any real bus, ride-on vehicle, or bus interior.",
      train: "Dress the baby in blue-and-white conductor-inspired overalls and a soft conductor cap; show a floor-seated pose connecting two small wooden toy train carriages. Never show any real train, railway station, or ride-on train.",
      airplane: "Dress the baby in a sky-blue pilot-inspired romper and a soft aviator cap; show the baby holding and looking up at one small toy passenger airplane. Never show any real airplane, airport, stroller, or aircraft cabin.",
      boat: "Dress the baby in a navy-and-white sailor romper and a soft sailor hat; show a seated pose floating one small toy sailboat in a shallow blue play-water tray. Never show any real boat, open water, or life jacket.",
      bicycle: "Dress the baby in a mint-green helmet and a sporty romper; show a seated pose rolling one small toy bicycle across a simple play mat. Never show a real adult bicycle, child seat, or ride-on bicycle.",
      truck: "Dress the baby in an orange utility vest over a cream romper and a soft cap; show a floor-seated pose loading two soft blocks into one toy dump truck. Never show any real full-size truck, construction site, or ride-on vehicle.",
      taxi: "Dress the baby in a bright-yellow city-travel jacket and a small matching cap; show the baby safely buckled into a rear child seat inside a real full-size yellow taxi, with the taxi body clearly visible. Never generate a toy or ride-on taxi.",
      ambulance: "Dress the baby in a white-and-red helper romper with a tiny heart badge; show a floor-seated pose gently playing with one toy ambulance and a small toy bandage kit. Never show a real ambulance, hospital scene, or ride-on vehicle.",
      metro: "Dress the baby in a bright blue travel jacket and a soft cap; show the baby safely seated beside a real metro train window, with the full-size metro carriage, doors, and wheels clearly visible. Never generate a toy or illustrated metro.",
      ship: "Dress the baby in a navy sailor romper and a soft sailor hat; show the baby safely seated with a life jacket on a real full-size passenger ship deck, with the real hull and cabin clearly visible. Never generate a toy ship.",
      helicopter: "Dress the baby in a sky-blue pilot-inspired romper and a soft aviator cap; show the baby safely seated in an airport stroller near a real full-size helicopter, with real rotor blades, cockpit, and landing skids clearly visible. Never generate a toy or cartoon helicopter.",
      "fire-truck": "Dress the baby in a red helper jacket and a soft firefighter hat; show the baby safely seated in a child safety seat beside a real full-size red fire truck, with the cab, ladder, and wheels clearly visible. Never generate a toy fire truck.",
      "school-bus": "Dress the baby in a yellow travel jacket and a small backpack; show the baby safely seated in a real full-size school bus child seat by a window, with the real yellow bus body clearly visible. Never generate a toy or cartoon school bus.",
      tractor: "Dress the baby in soft green overalls and a sun hat; show the baby safely seated in a child stroller beside a real full-size tractor, with the large rear wheel and front loader clearly visible. Never generate a toy tractor.",
      "cable-car": "Dress the baby in a warm red travel jacket and a soft knit beanie; show the baby safely secured in a stroller inside a real full-size cable-car cabin, with the real cabin windows, suspension arm, and cable clearly visible. Never generate a toy, miniature, or cartoon cable car."
    },
    animal: {
      cat: "Dress the baby in a soft gray-and-white kitten romper with plush cat ears and a tiny tail; show a playful seated pawing pose beside a calm, real domestic shorthaired cat photographed in full detail. The cat must have natural fur, eyes, paws, and whiskers; never use a plush, toy, cartoon, illustrated, or CGI cat.",
      dog: "Dress the baby in a warm-brown puppy romper with floppy plush ears; show the baby holding a soft toy bone at a safe distance from a calm, real small dog photographed in full detail. The dog must have natural fur and anatomy; never use a plush, toy, cartoon, illustrated, or CGI dog.",
      rabbit: "Dress the baby in a cream bunny romper with long plush ears and a small pom-pom tail; show a gentle crouching hop pose beside a calm, real rabbit photographed in full detail, with natural fur and long ears. Never use a toy or illustrated rabbit.",
      horse: "Dress the baby in a chestnut-brown riding-inspired romper and a soft helmet; show a seated pose beside a separate full-bodied photograph cutout of a calm, real horse at a safe visual distance. The horse must have natural coat, mane, hooves, and anatomy; never use a toy or illustration.",
      cow: "Dress the baby in a black-and-white spotted romper with soft cow ears; show a gentle seated pose beside a separate full-bodied photograph cutout of a calm, real dairy cow at a safe visual distance. The cow must have natural coat texture and anatomy; never use a plush, toy, cartoon, illustrated, or CGI cow.",
      duck: "Dress the baby in a sunny-yellow duck romper with a small orange beak hood; show a gentle arms-out waddling pose beside a real duck photographed in full detail, with natural feathers, beak, and webbed feet. Never use a toy or illustrated duck.",
      goldfish: "Dress the baby in a soft orange fish-inspired romper; show a seated pose looking toward a clear glass bowl containing one real goldfish with natural scales and fins. Never use a toy, cartoon, illustrated, or CGI fish.",
      turtle: "Dress the baby in a leaf-green turtle romper with a soft shell detail; show a seated reaching pose beside a real turtle photographed in full detail, with natural shell plates, eyes, and legs. Never use a toy or illustrated turtle.",
      monkey: "Dress the baby in a warm-brown monkey romper with round soft ears; show a playful seated pose beside a separate full-bodied photograph cutout of a real monkey at a safe visual distance. The monkey must have natural fur and anatomy; never use a plush, toy, cartoon, illustrated, or CGI monkey.",
      bear: "Dress the baby in a honey-brown bear romper with round plush ears; show a seated cuddle pose beside a separate, full-bodied photograph cutout of a real bear at a safe visual distance. The bear must have natural fur and anatomy; never use a plush, toy, cartoon, illustrated, or CGI bear.",
      lion: "Dress the baby in a golden-yellow lion romper with a soft felt mane hood; show a cheerful little roar pose beside a separate, full-bodied photograph cutout of a real lion at a safe visual distance. The lion must have natural fur, mane, and anatomy; never use a toy or illustration.",
      elephant: "Dress the baby in a pale-gray elephant romper with floppy ears and a soft fabric trunk hood; show the baby reaching toward a separate, full-bodied photograph cutout of a real elephant at a safe visual distance. The elephant must have natural skin texture, trunk, and anatomy; never use a toy or illustration.",
      giraffe: "Dress the baby in a yellow-and-brown spotted giraffe romper with small plush ossicones; show the baby stretching both arms high toward a separate, full-bodied photograph cutout of a real giraffe at a safe visual distance. The giraffe must have natural coat pattern and anatomy; never use a toy or illustration.",
      penguin: "Dress the baby in a black-and-white penguin romper with a tiny orange beak hood; show a balanced waddling pose beside a real penguin photographed in full detail. The penguin must have natural feathers, flippers, and anatomy; never use a plush, toy, cartoon, illustrated, or CGI penguin.",
      butterfly: "Dress the baby in a pastel butterfly romper with soft colorful wings; show a gentle arms-open fluttering pose while looking at a real butterfly macro photograph with natural wing detail. Never use a toy, cartoon, or illustrated butterfly.",
      sheep: "Dress the baby in a warm-cream lamb-inspired romper with soft floppy ears; show a gentle seated pose beside a separate full-bodied photograph cutout of one calm real sheep at a safe visual distance. The sheep must have natural wool, face, hooves, and anatomy; never use a plush, toy, cartoon, illustrated, or CGI sheep."
    },
    daily: {
      "wake-up": "Dress the baby in soft striped pajamas; show the baby sitting up and stretching both arms beside one tiny illustrated sun and a folded blanket.",
      "brush-teeth": "Dress the baby in a clean mint-green cotton romper with a small towel bib; show the baby safely holding a toddler toothbrush near the mouth, with a tiny cup beside it.",
      eat: "Dress the baby in a warm-cream romper and a colorful bib; show the baby seated in a simple high chair, holding a toddler spoon toward one small bowl.",
      "wash-hands": "Dress the baby in a rolled-sleeve sky-blue top and soft shorts; show both hands under a small illustrated faucet with soap bubbles, no realistic bathroom scene.",
      play: "Dress the baby in a bright primary-color play romper; show a floor-seated pose stacking two or three chunky blocks.",
      read: "Dress the baby in a cozy rust-orange cardigan over a cream romper; show a cross-legged seated pose turning the page of one large picture book.",
      "tidy-up": "Dress the baby in denim-look overalls and a soft yellow T-shirt; show the baby placing one block into a small toy basket.",
      "wash-face": "Dress the baby in a soft peach cotton romper and a small towel bib; show the baby gently patting one cheek with a warm washcloth beside a tiny bowl of water, with no realistic bathroom scene.",
      "get-dressed": "Dress the baby in a simple cream bodysuit; show a seated pose lifting one arm into a bright cardigan, with one folded shirt as the only extra clothing item.",
      "put-on-shoes": "Dress the baby in a soft blue top and shorts; show a safe seated pose holding one small toddler shoe near a bare foot.",
      "drink-water": "Dress the baby in a light aqua romper and a small bib; show the baby safely holding a small handled cup of water with both hands.",
      "say-hello": "Dress the baby in a cheerful yellow cardigan over a cream romper; show a friendly standing-supported or seated wave beside one tiny speech bubble that says Hello.",
      bath: "Dress the baby in a hooded towel wrap with a duck-shaped towel hood; show a safe seated splash pose in a simplified illustrated baby tub with only a rubber duck.",
      sleep: "Dress the baby in a soft moon-and-star sleep suit; show a curled, peaceful side-lying pose hugging one small moon plush, with no realistic bedroom.",
      "comb-hair": "Dress the baby in a pale-yellow cotton romper with a small bib; show a safe seated pose gently brushing their own hair with one soft toddler hairbrush, keeping the hair clearly visible and using no realistic bathroom scene.",
      "go-for-a-walk": "Dress the baby in a light denim jacket, soft leggings, and toddler sneakers; show a safe standing-supported or early-walking pose taking a few small steps along one simple dotted path, carrying one tiny fabric backpack and with no realistic street scene."
    }
  };

  const fallback = "Dress the baby in a theme-appropriate soft outfit and show one clearly different, safe, age-appropriate action that directly teaches the requested concept.";
  return directions[String(themeId || "").toLowerCase()]?.[String(partKey || "").toLowerCase()] || fallback;
}

function buildColorBookPartPrompt(part, order, theme = getBookTheme("color")) {
  const details = getColorBookVisualDetails(part?.colorKey || part?.key);
  const concept = getBodyBookLearningConcept(part);
  const colorChinese = concept.chinese;
  const colorEnglish = concept.english;
  return `Use the uploaded baby photo as the only identity reference. Strictly preserve the baby's facial features, age impression, skin tone, natural hair, and Asian baby appearance. Do not copy the reference clothing, pose, props, or background. Create one square 1:1 INNER PAGE (not a cover) for a 0-3-year-old bilingual color-learning picture book. The only learning concept is "${colorEnglish} / ${colorChinese}".

Composition: make the baby the central half-body subject, recognizably the same child from the reference. Dress the baby in a clearly ${details.colorName} ${details.outfit} and a coordinated ${details.headwear}. The baby should naturally hold, touch, or look at one clear ${details.colorName} learning object. The requested color must be visually dominant and unmistakable.

Use a bright, clean full-page ${details.colorName} background. Give the baby a neat thick white cutout outline. At the top, include one large hand-drawn speech bubble with the exact Chinese text: "我们一起来认识${colorChinese}！" The color word "${colorChinese}" must use ${details.colorName} lettering or a contrasting shade of the same color family; the remaining text is dark brown. Use large rounded, highly legible Chinese type. The only Chinese text allowed anywhere on this page is exactly "我们一起来认识${colorChinese}！" Never include the words "宝宝页", "物品页", "内页", or any page-type label. Add only three to five small matching doodles or sticker-like objects from this family: ${details.objects}. Keep them far from the baby's face and leave generous breathing room.

Style: warm, high-saturation but gentle early-learning picture-book cover-style illustration; realistic detailed baby photography blended with restrained children's doodle illustration, subtle paper texture, soft warm daylight, natural skin texture, clean layout. No page number, no English title, no extra people, no room, no landscape, no deep background, no watermark, no border, no collage panels, no unrelated color as a focal point, no unreadable decorative text, and no 3D animation look.`;
}

function buildColorObjectPagePrompt(part) {
  const details = getColorBookVisualDetails(part?.colorKey || part?.key);
  return `Create one square 1:1 static bilingual object-recognition page for a 0-3-year-old color book. Theme: ${part.chinese} / ${part.english}. Use a ${details.colorName} paper-texture outer background and a warm-cream rounded rectangle card with a hand-stitched ${details.colorName} dashed border. At the top render exactly: "这是${part.chinese}！" and "${part.english}!" in large rounded, highly legible ${details.colorName} lettering. Show six simple, separated, easy-to-recognize ${details.colorName} objects in a tidy 3 by 2 grid: ${details.objects}. Each object must have a white sticker outline and a Chinese-and-English name label beneath it. Bright, soft, handmade cut-paper learning-card style; low contrast shadows; no baby, no people, no page number, no watermark, no border outside the card, and no unrelated colors as focal points.`;
}

function getColorBookVisualDetails(colorKey) {
  const details = {
    red: { colorName: "red", outfit: "soft cotton romper or hoodie", headwear: "matching red fruit- or ladybug-inspired knit hat", objects: "a red apple, strawberry, cherry, ladybug, red balloon, and red toy car" },
    orange: { colorName: "orange", outfit: "soft orange romper or hoodie", headwear: "matching orange fox- or citrus-inspired knit hat", objects: "an orange, tangerine, carrot, pumpkin, orange fox toy, and orange ball" },
    yellow: { colorName: "yellow", outfit: "soft yellow romper or hoodie", headwear: "matching yellow bee- or chick-inspired knit hat", objects: "a yellow duck, sun, banana, lemon, star, and little chick" },
    green: { colorName: "green", outfit: "soft green romper or hoodie", headwear: "matching green frog- or leaf-inspired knit hat", objects: "a green apple, pear, broccoli, leaf, friendly frog toy, and small cactus" },
    blue: { colorName: "blue", outfit: "soft blue romper or hoodie", headwear: "matching blue whale- or cloud-inspired knit hat", objects: "a blue whale toy, blue fish, blue balloon, blue car, blue rain cloud, and blue building block" },
    purple: { colorName: "purple", outfit: "soft purple romper or hoodie", headwear: "matching purple grape- or butterfly-inspired knit hat", objects: "a bunch of grapes, plum, eggplant, purple butterfly, purple flower, and purple toy block" },
    pink: { colorName: "pink", outfit: "soft pink romper or hoodie", headwear: "matching pink bunny- or flower-inspired knit hat", objects: "a pink flower, strawberry, flamingo toy, pink balloon, pink bunny toy, and pink heart" },
    brown: { colorName: "brown", outfit: "soft warm-brown corduroy romper", headwear: "matching brown bear- or acorn-inspired knit hat", objects: "a brown teddy bear, acorn, chocolate biscuit, brown puppy toy, wooden block, and brown leaf" },
    gray: { colorName: "gray", outfit: "soft dove-gray cotton romper", headwear: "matching gray elephant- or cloud-inspired knit hat", objects: "a gray elephant toy, gray cloud, pebble, gray mouse toy, gray building block, and gray rain boot" },
    black: { colorName: "black", outfit: "soft black romper or hoodie with subtle white piping", headwear: "matching black cat-inspired knit hat", objects: "a little black cat, black hat, black toy car, black shoe, black umbrella, and black crayon" },
    white: { colorName: "white", outfit: "soft white textured romper with light warm-gray piping", headwear: "matching white bunny- or cloud-inspired knit hat", objects: "a white rabbit toy, sheep, cloud, moon, daisy, and white building block, each edged so it remains visible on white" }
  };
  return details[String(colorKey || "").toLowerCase()] || { colorName: "requested", outfit: "soft cotton romper", headwear: "matching playful knit hat", objects: "five or six clear, everyday learning objects in the requested color" };
}

function getBodyBookPromptProfile(theme) {
  return BODY_BOOK_PROMPT_PROFILES[theme?.id] || BODY_BOOK_PROMPT_PROFILES.body;
}

async function createBodyBookSession(file, visitor, accountId, theme) {
  const { provider, providers } = await getBodyBookGenerationConfig();

  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const reference = await persistBodyBookReference(sessionId, file);
  const session = await saveBodyBookSession({
    sessionId,
    experienceType: "body-book",
    themeId: theme.id,
    ownerAccountId: String(accountId || ""),
    ownerVisitorId: String(visitor?.visitorId || ""),
    stage: "cover_generating",
    status: "queued",
    message: "正在生成认知书封面。",
    createdAt: now,
    updatedAt: now,
    coverConfirmedAt: null,
    reference,
    chargedJobIds: [],
    refundedJobIds: [],
    billingError: "",
    cover: { key: "cover", title: "封面 Cover", order: 0, version: 1, jobId: "", status: "queued", result: null, errorMessage: "", historyJobIds: [] },
    cards: theme.parts.map((part, index) => ({
      ...part,
      order: index + 1,
      version: 0,
      jobId: "",
      status: "not_started",
      result: null,
      errorMessage: "",
      historyJobIds: []
    }))
  });
  const queued = await createBodyBookImageJob(session, {
    key: "cover",
    title: "封面 Cover",
    order: 0,
    version: 1,
    prompt: buildBodyBookCoverPrompt(theme),
    bookTitle: theme.englishName,
    bookSubtitle: theme.title
  }, provider, providers);
  const next = await saveBodyBookSession({
    ...session,
    cover: { ...session.cover, jobId: queued.job.jobId },
    updatedAt: new Date().toISOString()
  });
  queued.run();
  return next;
}

async function startBodyBookCards(session) {
  const { provider, providers } = await getBodyBookGenerationConfig();
  const theme = getBookTheme(session.themeId) || getBookTheme("body");
  const now = new Date().toISOString();
  const nextSession = {
    ...session,
    stage: "cards_generating",
    status: "queued",
    message: `正在生成 ${session.cards.length} 张${theme.name}认知卡。`,
    coverConfirmedAt: session.coverConfirmedAt || now,
    updatedAt: now
  };
  const queued = await Promise.all(nextSession.cards.map((card) => createBodyBookImageJob(nextSession, {
    key: card.key,
    title: `${card.english} ${card.chinese}`,
    order: card.order,
    version: 1,
    prompt: buildBodyBookPartPrompt(card, card.order, theme),
    bookTitle: theme.englishName,
    bookSubtitle: theme.name
  }, provider, providers)));
  const jobByKey = new Map(queued.map((item) => [item.key, item.job.jobId]));
  const saved = await saveBodyBookSession({
    ...nextSession,
    cards: nextSession.cards.map((card) => ({ ...card, version: 1, jobId: jobByKey.get(card.key) || "", status: "queued" }))
  });
  queued.forEach((item) => item.run());
  return saved;
}

async function regenerateBodyBookCard(session, part, options = {}) {
  const { provider, providers } = await getBodyBookGenerationConfig();
  const theme = getBookTheme(session.themeId) || getBookTheme("body");
  const card = session.cards.find((item) => item.key === part.key);
  const version = Math.max(0, Number(card?.version || 0)) + 1;
  const prompt = normalizeBodyBookPrompt(options.prompt, card?.prompt || buildBodyBookPartPrompt(part, Number(card?.order || 1), theme));
  const reference = options.referenceFile
    ? await persistBodyBookReference(session.sessionId, options.referenceFile, `card-${part.key}-${version}`)
    : card?.reference || session.reference;
  const queued = await createBodyBookImageJob(session, {
    key: part.key,
    title: `${part.english} ${part.chinese}`,
    order: Number(card?.order || 1),
    version,
    prompt,
    bookTitle: theme.englishName,
    bookSubtitle: theme.name
  }, provider, providers, reference);
  const next = await saveBodyBookSession({
    ...session,
    stage: "cards_generating",
    status: "running",
    message: `正在重新生成${part.chinese}认知卡。`,
    cards: session.cards.map((item) => item.key === part.key
      ? { ...item, version, jobId: queued.job.jobId, status: "queued", result: null, errorMessage: "", prompt, reference, historyJobIds: [...(item.historyJobIds || []), item.jobId].filter(Boolean) }
      : item),
    updatedAt: new Date().toISOString()
  });
  queued.run();
  return next;
}

async function createBodyBookImageJob(session, slot, provider, providers, referenceMetadata = session.references || [session.reference]) {
  const references = await readBodyBookReferences(session, referenceMetadata);
  const jobId = randomUUID();
  const originalReferences = await persistImageJobReferences(jobId, references);
  const prompt = `${slot.prompt}\n\nIdentity reference rule: All uploaded reference photos are photos of the same baby. Use them only to preserve one baby's consistent facial features, skin tone, age impression, and natural hair. Do not blend them into multiple people, and do not generate more than one baby.`;
  const now = new Date().toISOString();
  const job = {
    jobId,
    experienceType: "body-book",
    status: "queued",
    message: "任务已提交，等待生成。",
    result: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    prompt,
    size: BODY_BOOK_SIZE,
    referenceCount: references.length,
    originalReferences,
    styleId: slot.key,
    styleName: slot.title,
    styleGroupId: "body-book",
    styleGroupName: (getBookTheme(session.themeId) || getBookTheme("body")).name,
    provider: { id: provider.id, name: provider.name, model: provider.model },
    mode: BODY_BOOK_MOCK_MODE ? "mock" : "edit",
    ownerVisitorId: session.ownerVisitorId,
    ownerAccountId: session.ownerAccountId,
    visibility: "public",
    telemetry: { sessionId: session.sessionId, styleId: slot.key, styleName: slot.title, order: slot.order }
  };
  await saveImageJob(job);
  return {
    key: slot.key,
    job,
    run: () => BODY_BOOK_MOCK_MODE
      ? runBodyBookMockJob({ jobId, sessionId: session.sessionId, slot })
      : runImageJob({
          jobId,
          body: { size: BODY_BOOK_SIZE, quality: "medium", output_format: "png", background: "opaque", moderation: "auto" },
          files: references.map((reference) => ({ ...reference, buffer: Buffer.from(reference.buffer) })),
          outputFormat: "png",
          prompt,
          provider,
          providers,
          telemetry: { sessionId: session.sessionId, visitorId: session.ownerVisitorId, styleId: slot.key, styleName: slot.title, order: slot.order }
        }).catch((error) => console.error("Body book image job failed.", error))
  };
}

async function getBodyBookGenerationConfig() {
  if (BODY_BOOK_MOCK_MODE) {
    return { provider: BODY_BOOK_MOCK_PROVIDER, providers: [] };
  }
  const availableProviders = getImageProviders();
  const settings = await readAppSettings();
  const provider = resolveImageProvider("", availableProviders, settings);
  if (!provider) throw createHttpError(503, "暂无可用的生图服务，请稍后再试。");
  return { provider, providers: getProviderFallbackChain("", availableProviders, settings) };
}

async function runBodyBookMockJob({ jobId, sessionId, slot }) {
  let job = await readImageJob(jobId);
  if (!job || job.status === "cancelled") return;
  await saveImageJob({
    ...job,
    status: "running",
    message: "开发模拟：正在准备示例图片。",
    updatedAt: new Date().toISOString()
  });

  // Stagger completion so the page exercises its per-image polling and refresh states.
  await new Promise((resolve) => setTimeout(resolve, 600 + Math.max(0, Number(slot?.order || 0)) * 420));
  job = await readImageJob(jobId);
  if (!job || job.status === "cancelled") return;
  const result = await createBodyBookMockResult(jobId, slot);
  await saveImageJob({
    ...job,
    status: "succeeded",
    message: "开发模拟：示例图片已准备好。",
    result,
    provider: BODY_BOOK_MOCK_PROVIDER,
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  });
  await synchronizeBodyBookSessionByJobId(jobId);
}

async function createBodyBookMockResult(jobId, slot) {
  const isCover = slot?.key === "cover";
  const heading = isCover ? String(slot?.bookTitle || "My First Book") : String(slot?.title || "Learning Card");
  const subheading = String(slot?.bookSubtitle || (isCover ? "我的第一本认知书" : "开发模拟"));
  const filename = `${jobId}.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#f7f4eb"/>
  <rect x="58" y="58" width="908" height="908" rx="20" fill="#fffdf8" stroke="#c7d4c9" stroke-width="4"/>
  <text x="110" y="148" fill="#315d50" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="3">BABY BODY BOOK</text>
  <text x="110" y="222" fill="#273d37" font-family="Georgia, serif" font-size="64" font-weight="700">${escapeBodyBookMockText(heading)}</text>
  <text x="110" y="270" fill="#5e766e" font-family="Arial, sans-serif" font-size="28">${escapeBodyBookMockText(subheading)}</text>
  <circle cx="512" cy="540" r="192" fill="#d9e7d5"/>
  <circle cx="512" cy="483" r="104" fill="#f3c9ad"/>
  <path d="M420 472c15-104 154-125 191 1-42-34-141-31-191-1z" fill="#455f4f"/>
  <circle cx="474" cy="493" r="10" fill="#36443c"/><circle cx="550" cy="493" r="10" fill="#36443c"/>
  <path d="M476 548q36 30 72 0" fill="none" stroke="#b76761" stroke-width="10" stroke-linecap="round"/>
  <path d="M403 745c27-126 190-126 218 0" fill="#96b79f"/>
  <path d="M250 700c90-70 150-80 204-74" fill="none" stroke="#8ea88d" stroke-width="8" stroke-dasharray="12 14"/>
  <circle cx="240" cy="708" r="42" fill="#f4c36d"/>
  <rect x="110" y="850" width="804" height="54" rx="12" fill="#edf3eb"/>
  <text x="140" y="886" fill="#416455" font-family="Arial, sans-serif" font-size="22">Development placeholder · No image API request</text>
</svg>`;
  await mkdir(generatedImageRoot, { recursive: true });
  await writeFile(path.join(generatedImageRoot, filename), svg, "utf-8");
  const imageUrl = `/generated-images/${filename}`;
  return {
    imageDataUrl: "",
    imageUrl,
    mimeType: "image/svg+xml",
    previewUrl: imageUrl,
    thumbnailUrl: imageUrl,
    originalImageUrl: "",
    provider: BODY_BOOK_MOCK_PROVIDER,
    mode: "mock"
  };
}

function escapeBodyBookMockText(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function normalizeBodyBookPrompt(value, fallback) {
  const prompt = String(value || "").trim();
  return (prompt || String(fallback || "").trim()).slice(0, 6000);
}

async function legacySynchronizeBodyBookSession(session) {
  const sessionId = String(session?.sessionId || "");
  return withBodyBookSessionSyncLock(sessionId, async () => {
    const current = (await readBodyBookSession(sessionId)) || session;
    const cover = await hydrateBodyBookItem(current.cover);
    const cards = await Promise.all((current.cards || []).map(hydrateBodyBookItem));
    const chargedJobIds = new Set(current.chargedJobIds || []);
    const refundedJobIds = new Set(current.refundedJobIds || []);
    const failedJobIds = [cover, ...cards]
      .filter((item) => ["failed", "cancelled"].includes(item.status) && chargedJobIds.has(item.jobId) && !refundedJobIds.has(item.jobId))
      .map((item) => item.jobId);
    let billingError = "";
    if (BODY_BOOK_BILLING_ENABLED && failedJobIds.length) {
      try {
        const refund = commerceStore.refundBeansForGenerationJobs({
          accountId: current.ownerAccountId,
          jobIds: failedJobIds,
          reason: "body_book_generation_refund"
        });
        refund.refundedJobIds.forEach((jobId) => refundedJobIds.add(jobId));
      } catch (error) {
        billingError = error.publicMessage || error.message || "豆豆退款失败，请联系客服。";
      }
    }
    const cardSummary = summarizeBodyBookItems(cards);
    let stage = current.stage;
    let status = current.status;
    let message = current.message;
    if (cover.status === "failed" || cover.status === "cancelled") {
      stage = "cover_failed";
      status = "failed";
      message = cover.errorMessage || "封面生成失败，请换张照片重新开始。";
    } else if (["queued", "running"].includes(cover.status)) {
      stage = "cover_generating";
      status = cover.status;
      message = "正在生成认知书封面。";
    } else if (!current.coverConfirmedAt) {
      stage = "cover_review";
      status = "succeeded";
      message = `封面已生成，请确认后继续制作 ${current.cards.length} 张认知卡。`;
    } else if (cardSummary.pending > 0 || cardSummary.notStarted > 0) {
      stage = "cards_generating";
      status = cardSummary.running > 0 ? "running" : "queued";
      message = `正在生成认知卡（${cardSummary.succeeded}/${current.cards.length}）。`;
    } else if (cardSummary.failed > 0) {
      stage = "cards_partial";
      status = "partial";
      message = "部分认知卡生成失败，可单独重新生成。";
    } else {
      stage = "complete";
      status = "succeeded";
      message = "宝宝身体认知书已制作完成。";
    }
    return saveBodyBookSession({
      ...current,
      cover,
      cards,
      stage,
      status,
      message,
      chargedJobIds: [...chargedJobIds],
      refundedJobIds: [...refundedJobIds],
      billingError,
      updatedAt: new Date().toISOString(),
      completedAt: stage === "complete" || stage === "cards_partial" || stage === "cover_failed" ? current.completedAt || new Date().toISOString() : null
    });
  });
}

async function hydrateBodyBookItem(item) {
  if (!item?.jobId) return { ...item, status: item?.status || "not_started", result: item?.result || null, errorMessage: item?.errorMessage || "" };
  const job = await readImageJob(item.jobId);
  const status = String(job?.status || "failed");
  return {
    ...item,
    status,
    prompt: String(job?.prompt || item?.prompt || ""),
    result: status === "succeeded" ? normalizeJobResult(job?.result) : null,
    errorMessage: ["failed", "cancelled"].includes(status) ? String(job?.message || "生成失败，请重试。") : ""
  };
}

function summarizeBodyBookItems(items) {
  return (items || []).reduce((summary, item) => {
    summary.total += 1;
    if (item.status === "succeeded") summary.succeeded += 1;
    else if (item.status === "running") { summary.running += 1; summary.pending += 1; }
    else if (item.status === "queued") { summary.queued += 1; summary.pending += 1; }
    else if (item.status === "not_started") summary.notStarted += 1;
    else summary.failed += 1;
    return summary;
  }, { total: 0, succeeded: 0, running: 0, queued: 0, pending: 0, notStarted: 0, failed: 0 });
}

function legacyNormalizeBodyBookSession(session) {
  const cardsByKey = new Map(Array.isArray(session?.cards) ? session.cards.map((item) => [String(item?.key || ""), item]) : []);
  return {
    sessionId: String(session?.sessionId || ""),
    experienceType: "body-book",
    themeId: getBookTheme(session?.themeId)?.id || "body",
    ownerAccountId: String(session?.ownerAccountId || ""),
    ownerVisitorId: String(session?.ownerVisitorId || ""),
    stage: String(session?.stage || "cover_generating"),
    status: String(session?.status || "queued"),
    message: String(session?.message || "正在生成认知书封面。"),
    createdAt: session?.createdAt || null,
    updatedAt: session?.updatedAt || null,
    completedAt: session?.completedAt || null,
    savedAt: session?.savedAt || null,
    coverConfirmedAt: session?.coverConfirmedAt || null,
    reference: session?.reference && typeof session.reference === "object" ? session.reference : {},
    chargedJobIds: Array.isArray(session?.chargedJobIds) ? session.chargedJobIds.map(String).filter(Boolean) : [],
    billingError: String(session?.billingError || ""),
    cover: normalizeBodyBookItem(session?.cover, { key: "cover", title: "封面 Cover", order: 0 }),
    cards: (getBookTheme(session?.themeId)?.parts || BODY_BOOK_PARTS).map((part, index) => normalizeBodyBookItem(cardsByKey.get(part.key), { ...part, order: index + 1 }))
  };
}

function normalizeBodyBookItem(item, defaults) {
  return {
    ...defaults,
    ...(item || {}),
    key: String(item?.key || defaults.key),
    title: String(item?.title || defaults.title || `${defaults.english || ""} ${defaults.chinese || ""}`.trim()),
    order: Number(item?.order ?? defaults.order),
    version: Math.max(0, Number(item?.version || 0)),
    jobId: String(item?.jobId || ""),
    status: String(item?.status || (item?.jobId ? "queued" : "not_started")),
    prompt: normalizeBodyBookPrompt(item?.prompt, defaults.key === "cover" ? buildBodyBookCoverPrompt() : buildBodyBookPartPrompt(defaults, Number(item?.order ?? defaults.order))),
    reference: item?.reference && typeof item.reference === "object" ? item.reference : null,
    result: item?.result ? normalizeJobResult(item.result) : null,
    errorMessage: String(item?.errorMessage || ""),
    historyJobIds: Array.isArray(item?.historyJobIds) ? item.historyJobIds.map(String).filter(Boolean) : []
  };
}

function legacyToPublicBodyBookSession(session) {
  const current = normalizeBodyBookSession(session);
  return {
    sessionId: current.sessionId,
    experienceType: current.experienceType,
    theme: toPublicBookTheme(getBookTheme(current.themeId) || getBookTheme("body"), current.layoutVersion),
    stage: current.stage,
    status: current.status,
    message: current.message,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    completedAt: current.completedAt,
    savedAt: current.savedAt,
    coverConfirmedAt: current.coverConfirmedAt,
    billingError: current.billingError,
    chargedCount: current.chargedJobIds.length,
    mockMode: BODY_BOOK_MOCK_MODE,
    billingEnabled: BODY_BOOK_BILLING_ENABLED,
    referenceUrl: `/api/body-book/sessions/${encodeURIComponent(current.sessionId)}/reference`,
    cover: current.cover,
    cards: current.cards.map((card) => ({
      ...card,
      referenceUrl: `/api/body-book/sessions/${encodeURIComponent(current.sessionId)}/cards/${encodeURIComponent(card.key)}/reference`
    })),
    summary: { coverSucceeded: current.cover.status === "succeeded", cards: summarizeBodyBookItems(current.cards) }
  };
}

function legacyToPublicBodyBookLibraryItem(session) {
  const current = normalizeBodyBookSession(session);
  const theme = getBookTheme(current.themeId) || getBookTheme("body");
  return {
    sessionId: current.sessionId,
    savedAt: current.savedAt || null,
    theme: toPublicBookTheme(theme, current.layoutVersion),
    title: theme.englishName,
    cover: current.cover,
    cards: current.cards,
    mockMode: BODY_BOOK_MOCK_MODE
  };
}

async function saveBodyBookSession(session) {
  await mkdir(bodyBookSessionRoot, { recursive: true });
  const safeSession = normalizeBodyBookSession(session);
  await writeFile(getBodyBookSessionPath(safeSession.sessionId), `${JSON.stringify(safeSession, null, 2)}\n`, "utf-8");
  return safeSession;
}

async function legacyDeleteBodyBookSession(session) {
  const current = normalizeBodyBookSession(session);
  if (!current.savedAt || !isSafeImageJobId(current.sessionId)) {
    throw createHttpError(409, "仅可删除已保存的认知书。");
  }
  const jobIds = [...new Set([current.cover, ...(current.cards || [])].map((item) => item?.jobId).filter(isSafeImageJobId))];
  await Promise.all(jobIds.map(async (jobId) => {
    const job = await readImageJob(jobId);
    if (job) await deleteImageJob(job);
  }));
  await rm(getBodyBookSessionPath(current.sessionId), { force: true });
  await rm(path.join(bodyBookSessionRoot, current.sessionId), { recursive: true, force: true });
}

async function readBodyBookSession(sessionId) {
  if (!isSafeImageJobId(sessionId)) return null;
  try {
    return normalizeBodyBookSession(JSON.parse(await readFile(getBodyBookSessionPath(sessionId), "utf-8")));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function listBodyBookSessions() {
  await mkdir(bodyBookSessionRoot, { recursive: true });
  const entries = await readdir(bodyBookSessionRoot, { withFileTypes: true });
  const sessions = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => readBodyBookSession(entry.name.replace(/\.json$/, ""))));
  return sessions.filter(Boolean);
}

async function readLatestBodyBookSession(accountId) {
  const sessions = await listBodyBookSessions();
  return sessions.filter((session) => session.ownerAccountId === String(accountId || "")).sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))[0] || null;
}

async function assertNoRunningBodyBookSession(accountId) {
  const latest = await readLatestBodyBookSession(accountId);
  const current = latest ? await synchronizeBodyBookSession(latest) : null;
  if (current && ["cover_generating", "cards_generating"].includes(current.stage)) {
    throw createHttpError(409, "当前已有一本正在制作的认知书，请等待完成。", "当前已有一本正在制作的认知书，请等待完成。");
  }
}

function assertWebAccountOwnsBodyBookSession(req, session) {
  if (!req.webAccount?.id || String(session?.ownerAccountId || "") !== req.webAccount.id) {
    throw createHttpError(403, "无权访问这本认知书。");
  }
}

async function persistBodyBookReference(sessionId, file, key = "reference") {
  const extension = extensionForMime(file.mimetype);
  const filename = `${String(key || "reference").replace(/[^a-z0-9-]/gi, "-")}.${extension}`;
  const directory = path.join(bodyBookSessionRoot, sessionId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), file.buffer);
  return { filename, mimeType: file.mimetype, size: Number(file.size || file.buffer?.length || 0), originalName: String(file.originalname || filename) };
}

function normalizeBodyBookReferences(references, fallback = null) {
  const values = Array.isArray(references) ? references : fallback ? [fallback] : [];
  return values
    .filter((reference) => reference && typeof reference === "object" && String(reference.filename || ""))
    .slice(0, BODY_BOOK_MAX_REFERENCE_COUNT);
}

async function persistBodyBookReferences(sessionId, files, keyPrefix = "reference") {
  const safeFiles = (Array.isArray(files) ? files : [files])
    .filter(Boolean)
    .slice(0, BODY_BOOK_MAX_REFERENCE_COUNT);
  return Promise.all(safeFiles.map((file, index) => persistBodyBookReference(sessionId, file, `${keyPrefix}-${index + 1}`)));
}

async function readBodyBookReference(session, referenceMetadata = session?.reference) {
  const filename = path.basename(String(referenceMetadata?.filename || ""));
  if (!filename || !isSafeImageJobId(session?.sessionId)) throw createHttpError(500, "认知书参考图不存在，请换图重新开始。");
  const buffer = await readFile(path.join(bodyBookSessionRoot, session.sessionId, filename));
  return { originalname: String(referenceMetadata.originalName || filename), mimetype: String(referenceMetadata.mimeType || "image/jpeg"), size: buffer.length, buffer };
}

async function sendBodyBookReferenceThumbnail(res, reference) {
  try {
    const sharp = await loadSharpModule();
    const thumbnail = await sharp(reference.buffer)
      .rotate()
      .resize({ width: REFERENCE_THUMBNAIL_MAX_EDGE, height: REFERENCE_THUMBNAIL_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    res.type("image/webp").send(thumbnail);
  } catch {
    res.set("Cache-Control", "private, max-age=31536000, immutable");
    res.type(reference.mimetype).send(reference.buffer);
  }
}

async function readBodyBookReferences(session, references = session?.references) {
  const normalized = normalizeBodyBookReferences(references, session?.reference);
  if (!normalized.length) throw createHttpError(500, "认知书参考图不存在，请换图重新开始。");
  return Promise.all(normalized.map((reference) => readBodyBookReference(session, reference)));
}

async function withBodyBookSessionSyncLock(sessionId, task) {
  const key = String(sessionId || "");
  const previous = bodyBookSessionSyncLocks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  bodyBookSessionSyncLocks.set(key, current);
  try {
    return await current;
  } finally {
    if (bodyBookSessionSyncLocks.get(key) === current) bodyBookSessionSyncLocks.delete(key);
  }
}

async function legacySynchronizeBodyBookSessionByJobId(jobId) {
  if (!isSafeImageJobId(jobId)) return null;
  const sessions = await listBodyBookSessions();
  const session = sessions.find((item) => item.cover?.jobId === jobId || item.cards?.some((card) => card.jobId === jobId));
  return session ? synchronizeBodyBookSession(session) : null;
}

// Body-book projects use one selected-page collection. The declarations below
// intentionally supersede the original fixed cover/cards workflow above while
// keeping existing JSON files readable during the rollout.
function getNewBodyBookLayoutVersion(theme) {
  return PAIRED_PRESET_BOOK_THEME_IDS.has(String(theme?.id || "").toLowerCase())
    ? PAIRED_PRESET_LAYOUT_VERSION
    : LEGACY_BODY_BOOK_LAYOUT_VERSION;
}

function getBodyBookLayoutVersion(theme, layoutVersion = "") {
  if (layoutVersion === PAIRED_PRESET_LAYOUT_VERSION && PAIRED_PRESET_BOOK_THEME_IDS.has(String(theme?.id || "").toLowerCase())) {
    return PAIRED_PRESET_LAYOUT_VERSION;
  }
  // Colour books shipped with this paired structure before layout versions were
  // persisted, so retain their existing behaviour for every historical project.
  if (String(theme?.id || "") === "color") return PAIRED_PRESET_LAYOUT_VERSION;
  return LEGACY_BODY_BOOK_LAYOUT_VERSION;
}

function getPairedPresetBookParts(theme) {
  return (PAIRED_PRESET_BOOK_PARTS[String(theme?.id || "").toLowerCase()] || [])
    .map(([key, chinese, english, copy]) => ({ key, chinese, english, copy }));
}

function getBodyBookPageDefinitions(theme = getBookTheme("body"), layoutVersion = getNewBodyBookLayoutVersion(theme)) {
  const resolved = theme || getBookTheme("body");
  const pairedLayout = getBodyBookLayoutVersion(resolved, layoutVersion) === PAIRED_PRESET_LAYOUT_VERSION;
  if (resolved?.id === "color" || pairedLayout) {
    const parts = resolved.id === "color" ? resolved.parts || [] : getPairedPresetBookParts(resolved);
    const innerPages = parts.flatMap((part, index) => {
      const babyOrder = index * 2 + 1;
      return [
        {
          ...part,
          key: `${part.key}-baby`,
          conceptKey: part.key,
          colorKey: resolved.id === "color" ? part.key : "",
          pageType: "baby",
          chinese: part.chinese,
          english: part.english,
          title: `${part.chinese} ${part.english}`,
          order: babyOrder
        },
        {
          ...part,
          key: `${part.key}-objects`,
          conceptKey: part.key,
          colorKey: resolved.id === "color" ? part.key : "",
          pageType: "objects",
          isBuiltIn: true,
          isRequired: true,
          chinese: part.chinese,
          english: part.english,
          title: `${part.chinese}认知页 ${part.english}`,
          order: babyOrder + 1
        }
      ];
    });
    return [
      { key: "cover", chinese: "封面", english: "Cover", title: "封面 Cover", order: 0, pageType: "cover", isRequired: true },
      ...innerPages,
      { key: "back-cover", chinese: "封底", english: "Back Cover", title: "封底 Back Cover", order: 17, pageType: "back-cover", isBuiltIn: true, isRequired: true }
    ];
  }
  return [
    { key: "cover", chinese: "封面", english: "Cover", title: "封面 Cover", order: 0, pageType: "cover", isRequired: true },
    ...(resolved?.parts || []).map((part, index) => ({ ...part, title: `${part.chinese} ${part.english}`, order: index + 1 }))
  ];
}

function getBodyBookPageDefinition(theme, key, layoutVersion) {
  const normalizedKey = String(key || "").trim().toLowerCase();
  return getBodyBookPageDefinitions(theme, layoutVersion).find((page) => page.key === normalizedKey) || null;
}

function getBodyBookSelectablePageDefinitions(theme, layoutVersion) {
  return getBodyBookPageDefinitions(theme, layoutVersion)
    .filter((page) => !page.isBuiltIn && page.pageType !== "back-cover");
}

function getBodyBookPrintPageCount(_theme) {
  return 17;
}

function getBodyBookSelectionPageCount(theme, layoutVersion) {
  const resolved = getBookTheme(theme?.id || theme);
  return getBodyBookLayoutVersion(resolved, layoutVersion) === PAIRED_PRESET_LAYOUT_VERSION ? 9 : 17;
}

function ensureBodyBookCoverKey(keys, theme, layoutVersion) {
  const selected = new Set(keys || []);
  selected.add("cover");
  return getBodyBookSelectablePageDefinitions(theme, layoutVersion).map((page) => page.key).filter((key) => selected.has(key));
}

function parseBodyBookPageKeys(value, theme, layoutVersion) {
  let keys = value;
  if (typeof value === "string") {
    try { keys = JSON.parse(value); } catch { keys = []; }
  }
  const requested = new Set(Array.isArray(keys) ? keys.map((key) => String(key || "").trim().toLowerCase()).filter(Boolean) : []);
  return getBodyBookSelectablePageDefinitions(theme, layoutVersion).map((page) => page.key).filter((key) => requested.has(key));
}

function parseBodyBookPagePrompts(value, theme, layoutVersion) {
  let prompts = value;
  if (typeof value === "string") {
    try { prompts = JSON.parse(value); } catch { prompts = {}; }
  }
  if (!prompts || typeof prompts !== "object" || Array.isArray(prompts)) return {};
  const validKeys = new Set(getBodyBookSelectablePageDefinitions(theme, layoutVersion).map((page) => page.key));
  return Object.fromEntries(Object.entries(prompts)
    .filter(([key, prompt]) => validKeys.has(String(key).toLowerCase()) && typeof prompt === "string")
    .map(([key, prompt]) => [String(key).toLowerCase(), String(prompt).slice(0, 6000)]));
}

function createBodyBookPage(definition, theme, references, current = {}) {
  const prompt = definition.key === "cover"
    ? buildBodyBookCoverPrompt(theme)
    : definition.pageType === "objects"
      ? buildBuiltInPresetBookPagePrompt(definition, theme)
      : buildBodyBookPartPrompt(definition, definition.order, theme);
  if (definition.isBuiltIn) {
    return {
      ...definition,
      key: definition.key,
      title: definition.title,
      order: definition.order,
      version: 1,
      jobId: "",
      status: "succeeded",
      prompt,
      hasCustomPrompt: false,
      reference: null,
      result: getBuiltInPresetBookPageResult(definition, theme),
      errorMessage: "",
      historyJobIds: []
    };
  }
  const currentReferences = normalizeBodyBookReferences(current?.references, current?.reference);
  const pageReferences = currentReferences.length ? currentReferences : normalizeBodyBookReferences(references);
  const concept = getBodyBookLearningConcept(definition);
  return {
    ...definition,
    ...current,
    key: definition.key,
    chinese: concept.chinese,
    english: concept.english,
    title: definition.title,
    order: definition.order,
    isRequired: Boolean(definition.isRequired),
    version: Math.max(0, Number(current?.version || 0)),
    jobId: String(current?.jobId || ""),
    status: String(current?.status || (current?.jobId ? "queued" : "not_started")),
    // Automatic prompts are regenerated from the current safe template. This
    // also repairs older projects that persisted internal page labels such as
    // “汽车宝宝页 / Car Baby” before those labels were separated from content.
    prompt: normalizeBodyBookPrompt(current?.hasCustomPrompt ? current?.prompt : prompt, prompt),
    hasCustomPrompt: Boolean(current?.hasCustomPrompt),
    references: pageReferences,
    reference: pageReferences[0] || null,
    result: current?.result ? normalizeJobResult(current.result) : null,
    errorMessage: String(current?.errorMessage || ""),
    historyJobIds: Array.isArray(current?.historyJobIds) ? current.historyJobIds.map(String).filter(Boolean) : []
  };
}

function getBuiltInPresetBookPageResult(definition, theme) {
  const isBackCover = definition?.pageType === "back-cover";
  const isColorBook = String(theme?.id || "") === "color";
  const filename = isBackCover ? "back-cover.svg" : `${definition?.conceptKey || definition?.colorKey || "red"}-objects.png`;
  const imageUrl = isBackCover || isColorBook
    ? `/body-book-color-pages/${filename}`
    : `/body-book-preset-pages/${String(theme?.id || "body")}-${String(definition?.conceptKey || "item")}.png`;
  const thumbnailUrl = isBackCover
    ? imageUrl
    : isColorBook
      ? `/body-book-color-pages/thumbnails/${definition?.colorKey || "red"}-objects.webp`
      : imageUrl;
  return {
    imageDataUrl: "",
    imageUrl,
    previewUrl: imageUrl,
    thumbnailUrl,
    originalImageUrl: imageUrl,
    mimeType: isBackCover ? "image/svg+xml" : "image/png",
    provider: isColorBook ? "built-in-color-pages" : "built-in-preset-pages",
    mode: "built-in"
  };
}

function buildBuiltInPresetBookPagePrompt(definition, theme) {
  if (String(theme?.id || "") === "color") return buildColorObjectPagePrompt(definition);
  return `Built-in static preset page for ${theme?.name || "认知书"}: ${definition?.chinese || ""} / ${definition?.english || ""}.`;
}

// Editable project pages deliberately exclude paired preset artwork. The
// artwork is supplied by the product and is inserted only in the print order.
function getBodyBookPrintPages(session) {
  const theme = getBookTheme(session?.themeId) || getBookTheme("body");
  const layoutVersion = getBodyBookLayoutVersion(theme, session?.layoutVersion);
  const projectPages = Array.isArray(session?.pages) ? session.pages : [];
  const byKey = new Map(projectPages.map((page) => [String(page?.key || "").toLowerCase(), page]));
  const reference = session?.reference && typeof session.reference === "object" ? session.reference : {};
  const references = normalizeBodyBookReferences(session?.references, reference);

  if (layoutVersion !== PAIRED_PRESET_LAYOUT_VERSION) {
    return projectPages
      .filter((page) => page.pageType !== "back-cover")
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  }

  return getBodyBookPageDefinitions(theme, layoutVersion)
    .filter((definition) => definition.pageType !== "back-cover")
    .flatMap((definition) => {
      if (definition.pageType === "objects") {
        const babyKey = `${definition.conceptKey || definition.colorKey}-baby`;
        return byKey.has(babyKey) ? [createBodyBookPage(definition, theme, references)] : [];
      }
      const existing = byKey.get(definition.key);
      return existing ? [createBodyBookPage(definition, theme, references, existing)] : [];
    });
}

async function createBodyBookProject({ files, pageReferenceFiles = new Map(), pagePrompts = {}, visitor, accountId, theme, layoutVersion = getNewBodyBookLayoutVersion(theme), contentKeys, generationKeys }) {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const references = await persistBodyBookReferences(sessionId, files, "reference");
  const reference = references[0];
  const selectedKeys = ensureBodyBookCoverKey(parseBodyBookPageKeys(contentKeys, theme, layoutVersion), theme, layoutVersion);
  const pageReferences = new Map(await Promise.all(selectedKeys.map(async (key) => {
    const pageFiles = pageReferenceFiles.get(key);
    const pageReferences = pageFiles?.length
      ? await persistBodyBookReferences(sessionId, pageFiles, `page-${key}`)
      : references;
    return [key, pageReferences];
  })));
  const session = await saveBodyBookSession({
    schemaVersion: 2,
    sessionId,
    experienceType: "body-book",
    themeId: theme.id,
    layoutVersion,
    ownerAccountId: String(accountId || ""),
    ownerVisitorId: String(visitor?.visitorId || ""),
    stage: "ready",
    status: "idle",
    message: "请选择页面并开始生成。",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    savedAt: null,
    reference: references[0] || reference,
    references,
    chargedJobIds: [],
    billingError: "",
    pages: selectedKeys.map((key) => createBodyBookPage(
      getBodyBookPageDefinition(theme, key, layoutVersion),
      theme,
      pageReferences.get(key) || references,
      { prompt: pagePrompts[key], hasCustomPrompt: Boolean(String(pagePrompts[key] || "").trim()) }
    ))
  });
  return generateBodyBookPages(session, generationKeys);
}

async function updateBodyBookProjectPages(session, contentKeys) {
  const current = normalizeBodyBookSession(session);
  const theme = getBookTheme(current.themeId) || getBookTheme("body");
  const selectedKeys = ensureBodyBookCoverKey(parseBodyBookPageKeys(contentKeys, theme, current.layoutVersion), theme, current.layoutVersion);
  const selected = new Set(selectedKeys);
  const removed = current.pages.filter((page) => !selected.has(page.key));
  await discardBodyBookPages(removed);
  const byKey = new Map(current.pages.map((page) => [page.key, page]));
  return saveBodyBookSession({
    ...current,
    pages: selectedKeys.map((key) => createBodyBookPage(getBodyBookPageDefinition(theme, key, current.layoutVersion), theme, current.references, byKey.get(key))),
    updatedAt: new Date().toISOString(),
    message: "内容已更新，可继续生成。"
  });
}

async function replaceBodyBookProjectReference(session, file, referenceIndex = null) {
  const current = normalizeBodyBookSession(session);
  const references = [...current.references];
  const isAppend = referenceIndex === null || referenceIndex === undefined || referenceIndex === "";
  const index = isAppend ? references.length : Number(referenceIndex);
  if (!Number.isInteger(index) || index < 0 || index > references.length || (!isAppend && index >= references.length)) {
    throw createHttpError(400, "参考图序号无效。"
    );
  }
  if (isAppend && references.length >= BODY_BOOK_MAX_REFERENCE_COUNT) {
    throw createHttpError(400, `最多上传 ${BODY_BOOK_MAX_REFERENCE_COUNT} 张宝宝照片。`);
  }
  const nextReference = await persistBodyBookReference(current.sessionId, file, `reference-${index + 1}-${Date.now()}`);
  if (isAppend) references.push(nextReference);
  else references[index] = nextReference;
  const reference = references[0];
  return saveBodyBookSession({
    ...current,
    reference,
    references,
    pages: current.pages.map((page) => page.isBuiltIn ? page : { ...page, reference, references: [...references] }),
    updatedAt: new Date().toISOString(),
    message: "已更新所有页面的参考图。"
  });
}

async function deleteBodyBookProjectReference(session, referenceIndex) {
  const current = normalizeBodyBookSession(session);
  const references = [...current.references];
  const index = Number(referenceIndex);
  if (!Number.isInteger(index) || index < 0 || index >= references.length) {
    throw createHttpError(400, "参考图序号无效。");
  }
  references.splice(index, 1);
  const reference = references[0] || null;
  return saveBodyBookSession({
    ...current,
    reference,
    references,
    pages: current.pages.map((page) => page.isBuiltIn ? page : { ...page, reference, references: [...references] }),
    updatedAt: new Date().toISOString(),
    message: references.length ? "已更新所有页面的参考图。" : "已删除全部参考图，请重新上传宝宝照片。"
  });
}

async function replaceBodyBookPageReference(session, pageKey, file, referenceIndex = null) {
  const current = normalizeBodyBookSession(session);
  const page = current.pages.find((item) => item.key === String(pageKey || "").toLowerCase());
  if (!page) throw createHttpError(404, "找不到该认知书页面。");
  if (page.isBuiltIn) throw createHttpError(409, "项目内置认知页不需要替换参考图。");
  const references = [...normalizeBodyBookReferences(page.references, page.reference)];
  const isAppend = referenceIndex === null || referenceIndex === undefined || referenceIndex === "";
  const index = isAppend ? references.length : Number(referenceIndex);
  if (!Number.isInteger(index) || index < 0 || index > references.length || (!isAppend && index >= references.length)) throw createHttpError(400, "参考图序号无效。");
  if (isAppend && references.length >= BODY_BOOK_MAX_REFERENCE_COUNT) throw createHttpError(400, `每页最多上传 ${BODY_BOOK_MAX_REFERENCE_COUNT} 张宝宝照片。`);
  const nextReference = await persistBodyBookReference(current.sessionId, file, `page-${page.key}-${index + 1}-${Date.now()}`);
  if (isAppend) references.push(nextReference);
  else references[index] = nextReference;
  const reference = references[0];
  return saveBodyBookSession({
    ...current,
    pages: current.pages.map((item) => item.key === page.key ? { ...item, reference, references } : item),
    updatedAt: new Date().toISOString(),
    message: `已更新${page.chinese || page.title}的参考图。`
  });
}

async function deleteBodyBookPageReference(session, pageKey, referenceIndex) {
  const current = normalizeBodyBookSession(session);
  const page = current.pages.find((item) => item.key === String(pageKey || "").toLowerCase());
  if (!page || page.isBuiltIn) throw createHttpError(404, "找不到可编辑的认知书页面。");
  const references = [...normalizeBodyBookReferences(page.references, page.reference)];
  const index = Number(referenceIndex);
  if (!Number.isInteger(index) || index < 0 || index >= references.length) throw createHttpError(400, "参考图序号无效。");
  if (references.length <= 1) throw createHttpError(409, "每页至少保留 1 张宝宝照片。"
  );
  references.splice(index, 1);
  return saveBodyBookSession({
    ...current,
    pages: current.pages.map((item) => item.key === page.key ? { ...item, reference: references[0], references } : item),
    updatedAt: new Date().toISOString(),
    message: `已更新${page.chinese || page.title}的参考图。`
  });
}

async function generateBodyBookPages(session, pageKeys, pagePrompts = {}) {
  const current = normalizeBodyBookSession(session);
  const theme = getBookTheme(current.themeId) || getBookTheme("body");
  const requested = new Set(parseBodyBookPageKeys(pageKeys, theme, current.layoutVersion));
  const pages = current.pages.filter((page) => requested.has(page.key) && !page.isBuiltIn && !["queued", "running"].includes(page.status));
  if (!pages.length) return current;
  const { provider, providers } = await getBodyBookGenerationConfig();
  const queued = await Promise.all(pages.map(async (page) => {
    const version = Math.max(0, Number(page.version || 0)) + 1;
    const fallbackPrompt = page.key === "cover"
      ? buildBodyBookCoverPrompt(theme)
      : buildBodyBookPartPrompt(page, page.order, theme);
    const requestedPrompt = pagePrompts && typeof pagePrompts === "object" ? pagePrompts[page.key] : "";
    const hasRequestedPrompt = Boolean(String(requestedPrompt || "").trim());
    const prompt = hasRequestedPrompt
      ? normalizeBodyBookPrompt(requestedPrompt, fallbackPrompt)
      : page.hasCustomPrompt
        ? normalizeBodyBookPrompt(page.prompt, fallbackPrompt)
        : fallbackPrompt;
    const slot = {
      key: page.key,
      title: page.title,
      order: page.order,
      version,
      prompt,
      bookTitle: theme.englishName,
      bookSubtitle: page.key === "cover" ? theme.title : theme.name
    };
    const entry = await createBodyBookImageJob(current, slot, provider, providers, page.references || current.references);
    return { key: page.key, version, prompt, hasCustomPrompt: hasRequestedPrompt || page.hasCustomPrompt, jobId: entry.job.jobId, run: entry.run };
  }));
  const byKey = new Map(queued.map((entry) => [entry.key, entry]));
  const chargedJobIds = BODY_BOOK_BILLING_ENABLED
    ? commerceStore.debitBeansForGenerationJobs({
        accountId: current.ownerAccountId,
        jobIds: queued.map((entry) => entry.jobId),
        reason: "body_book_generation"
      }).chargedJobIds
    : [];
  let next;
  try {
    next = await saveBodyBookSession({
    ...current,
    pages: current.pages.map((page) => {
      const entry = byKey.get(page.key);
      return !entry ? page : {
        ...page,
        version: entry.version,
        jobId: entry.jobId,
        status: "queued",
        result: null,
        errorMessage: "",
        prompt: entry.prompt,
        hasCustomPrompt: entry.hasCustomPrompt,
        historyJobIds: [...(page.historyJobIds || []), page.jobId].filter(Boolean)
      };
    }),
    stage: "generating",
    status: "queued",
    message: `正在生成 ${queued.length} 张图片。`,
    chargedJobIds: [...new Set([...(current.chargedJobIds || []), ...chargedJobIds])],
    refundedJobIds: current.refundedJobIds || [],
    billingError: "",
    completedAt: null,
    updatedAt: new Date().toISOString()
    });
  } catch (error) {
    if (chargedJobIds.length) {
      try {
        commerceStore.refundBeansForGenerationJobs({
          accountId: current.ownerAccountId,
          jobIds: chargedJobIds,
          reason: "body_book_generation_submit_refund"
        });
      } catch (refundError) {
        console.error("Failed to refund body book submission charge.", refundError);
      }
    }
    throw error;
  }
  queued.forEach((entry) => entry.run());
  return next;
}

async function discardBodyBookPages(pages) {
  const jobIds = [...new Set((pages || []).flatMap((page) => [page?.jobId, ...(page?.historyJobIds || [])]).filter(isSafeImageJobId))];
  await Promise.all(jobIds.map(async (jobId) => {
    const job = await readImageJob(jobId);
    if (job) await deleteImageJob(job);
  }));
}

async function synchronizeBodyBookSession(session) {
  const sessionId = String(session?.sessionId || "");
  return withBodyBookSessionSyncLock(sessionId, async () => {
    const current = normalizeBodyBookSession((await readBodyBookSession(sessionId)) || session);
    const pages = await Promise.all(current.pages.map(hydrateBodyBookItem));
    const chargedJobIds = new Set(current.chargedJobIds || []);
    const refundedJobIds = new Set(current.refundedJobIds || []);
    const failedJobIds = pages
      .filter((page) => ["failed", "cancelled"].includes(page.status) && chargedJobIds.has(page.jobId) && !refundedJobIds.has(page.jobId))
      .map((page) => page.jobId);
    let billingError = "";
    if (BODY_BOOK_BILLING_ENABLED && failedJobIds.length) {
      try {
        const refund = commerceStore.refundBeansForGenerationJobs({
          accountId: current.ownerAccountId,
          jobIds: failedJobIds,
          reason: "body_book_generation_refund"
        });
        refund.refundedJobIds.forEach((jobId) => refundedJobIds.add(jobId));
      } catch (error) {
        billingError = error.publicMessage || error.message || "豆豆退款失败，请联系客服。";
      }
    }
    const summary = summarizeBodyBookItems(pages);
    const hasSucceededPage = pages.some((page) => page.status === "succeeded" && !page.isBuiltIn);
    let stage = "ready";
    let status = "idle";
    let message = "请选择页面并开始生成。";
    if (summary.pending > 0) {
      stage = "generating";
      status = summary.running > 0 ? "running" : "queued";
      message = `正在生成图片（${summary.succeeded}/${summary.total}）。`;
    } else if (summary.total === 0) {
      message = "请添加至少一个认知书内容。";
    } else if (summary.failed > 0) {
      stage = "partial";
      status = "partial";
      message = "部分图片生成失败，可单张或批量重试。";
    } else if (hasSucceededPage) {
      stage = "ready";
      status = "succeeded";
      message = "图片已保存，可继续编辑或生成更多页面。";
    }
    const now = new Date().toISOString();
    return saveBodyBookSession({
      ...current,
      schemaVersion: 2,
      pages,
      stage,
      status,
      message,
      chargedJobIds: [...chargedJobIds],
      refundedJobIds: [...refundedJobIds],
      billingError,
      savedAt: current.savedAt || (hasSucceededPage ? now : null),
      updatedAt: now,
      completedAt: summary.pending === 0 && hasSucceededPage ? current.completedAt || now : null
    });
  });
}

function normalizeBodyBookSession(session) {
  const theme = getBookTheme(session?.themeId) || getBookTheme("body");
  const layoutVersion = getBodyBookLayoutVersion(theme, session?.layoutVersion);
  const hasProjectPages = Array.isArray(session?.pages);
  const legacyItems = hasProjectPages ? session.pages : [session?.cover, ...(Array.isArray(session?.cards) ? session.cards : [])].filter(Boolean);
  const byKey = new Map(legacyItems.map((item) => [String(item?.key || "").toLowerCase(), item]));
  if (theme.id === "color") {
    for (const part of theme.parts) {
      const legacyPage = byKey.get(part.key);
      const babyKey = `${part.key}-baby`;
      if (legacyPage && !byKey.has(babyKey)) byKey.set(babyKey, { ...legacyPage, key: babyKey, colorKey: part.key, pageType: "baby" });
    }
  }
  const selectedKeys = getBodyBookSelectablePageDefinitions(theme, layoutVersion)
    .map((page) => page.key)
    .filter((key) => byKey.has(key));
  const reference = session?.reference && typeof session.reference === "object" ? session.reference : {};
  const references = normalizeBodyBookReferences(session?.references, reference);
  return {
    schemaVersion: 2,
    sessionId: String(session?.sessionId || ""),
    experienceType: "body-book",
    themeId: theme.id,
    layoutVersion,
    ownerAccountId: String(session?.ownerAccountId || ""),
    ownerVisitorId: String(session?.ownerVisitorId || ""),
    stage: String(session?.stage || "ready"),
    status: String(session?.status || "idle"),
    message: String(session?.message || "请选择页面并开始生成。"),
    createdAt: session?.createdAt || null,
    updatedAt: session?.updatedAt || null,
    completedAt: session?.completedAt || null,
    savedAt: session?.savedAt || null,
    reference: references[0] || reference,
    references,
    chargedJobIds: Array.isArray(session?.chargedJobIds) ? session.chargedJobIds.map(String).filter(Boolean) : [],
    refundedJobIds: Array.isArray(session?.refundedJobIds) ? session.refundedJobIds.map(String).filter(Boolean) : [],
    billingError: String(session?.billingError || ""),
    pages: selectedKeys.map((key) => createBodyBookPage(getBodyBookPageDefinition(theme, key, layoutVersion), theme, references, byKey.get(key)))
  };
}

function toPublicBodyBookSession(session) {
  const current = normalizeBodyBookSession(session);
  return {
    projectId: current.sessionId,
    sessionId: current.sessionId,
    experienceType: current.experienceType,
    layoutVersion: current.layoutVersion,
    // Use the project's persisted layout. New body/transport/animal books use
    // paired-preset-v2, while existing projects must continue to expose their
    // original legacy-v1 17 editable pages.
    theme: toPublicBookTheme(getBookTheme(current.themeId) || getBookTheme("body"), current.layoutVersion),
    stage: current.stage,
    status: current.status,
    message: current.message,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    completedAt: current.completedAt,
    savedAt: current.savedAt,
    billingError: current.billingError,
    chargedCount: Math.max(0, current.chargedJobIds.length - new Set(current.refundedJobIds).size),
    refundedCount: current.refundedJobIds.length,
    mockMode: BODY_BOOK_MOCK_MODE,
    billingEnabled: BODY_BOOK_BILLING_ENABLED,
    referenceUrl: `/api/body-book/projects/${encodeURIComponent(current.sessionId)}/reference`,
    referenceUrls: current.references.map((reference, index) => buildBodyBookReferenceUrl(current.sessionId, index, reference)),
    referenceThumbnailUrls: current.references.map((reference, index) => buildBodyBookReferenceThumbnailUrl(current.sessionId, index, reference)),
    pages: current.pages.map((page) => ({
      ...page,
      usesProjectReference: page.references?.every((reference, index) => String(reference?.filename || "") === String(current.references[index]?.filename || "")),
      referenceUrl: `/api/body-book/projects/${encodeURIComponent(current.sessionId)}/pages/${encodeURIComponent(page.key)}/reference`,
      referenceUrls: (page.references || []).map((reference, index) => buildBodyBookReferenceUrl(current.sessionId, index, reference, page.key)),
      referenceThumbnailUrls: (page.references || []).map((reference, index) => buildBodyBookReferenceThumbnailUrl(current.sessionId, index, reference, page.key))
    })),
    printPreviewPages: getBodyBookPrintPages(current),
    summary: summarizeBodyBookItems(current.pages)
  };
}

function buildBodyBookReferenceUrl(sessionId, referenceIndex, reference, pageKey = "") {
  const base = pageKey
    ? `/api/body-book/projects/${encodeURIComponent(sessionId)}/pages/${encodeURIComponent(pageKey)}/reference/${referenceIndex}`
    : `/api/body-book/projects/${encodeURIComponent(sessionId)}/reference/${referenceIndex}`;
  return `${base}?v=${encodeURIComponent(String(reference?.filename || referenceIndex))}`;
}

function buildBodyBookReferenceThumbnailUrl(sessionId, referenceIndex, reference, pageKey = "") {
  const base = pageKey
    ? `/api/body-book/projects/${encodeURIComponent(sessionId)}/pages/${encodeURIComponent(pageKey)}/reference/${referenceIndex}/thumbnail`
    : `/api/body-book/projects/${encodeURIComponent(sessionId)}/reference/${referenceIndex}/thumbnail`;
  return `${base}?v=${encodeURIComponent(String(reference?.filename || referenceIndex))}`;
}

function toPublicBodyBookLibraryItem(session) {
  const current = normalizeBodyBookSession(session);
  const theme = getBookTheme(current.themeId) || getBookTheme("body");
  const thumbnailPage = current.pages.find((page) => page.key === "cover" && page.status === "succeeded" && page.result?.imageUrl)
    || current.pages.find((page) => page.status === "succeeded" && !page.isBuiltIn && page.result?.imageUrl)
    || current.pages.find((page) => page.status === "succeeded" && page.result?.imageUrl)
    || null;
  return {
    projectId: current.sessionId,
    sessionId: current.sessionId,
    savedAt: current.savedAt || null,
    updatedAt: current.updatedAt || null,
    theme: toPublicBookTheme(theme, current.layoutVersion),
    title: theme.name,
    thumbnail: thumbnailPage?.result?.thumbnailUrl || thumbnailPage?.result?.previewUrl || thumbnailPage?.result?.imageUrl || "",
    pages: current.pages,
    mockMode: BODY_BOOK_MOCK_MODE
  };
}

async function deleteBodyBookSession(session) {
  const current = normalizeBodyBookSession(session);
  if (!isSafeImageJobId(current.sessionId)) throw createHttpError(409, "认知书工程标识无效。");
  await discardBodyBookPages(current.pages);
  await rm(getBodyBookSessionPath(current.sessionId), { force: true });
  await rm(path.join(bodyBookSessionRoot, current.sessionId), { recursive: true, force: true });
}

async function synchronizeBodyBookSessionByJobId(jobId) {
  if (!isSafeImageJobId(jobId)) return null;
  const sessions = await listBodyBookSessions();
  const session = sessions.find((item) => item.pages?.some((page) => page.jobId === jobId));
  return session ? synchronizeBodyBookSession(session) : null;
}

async function prepareImageJobStorage() {
  await mkdir(imageJobRoot, { recursive: true });
  await mkdir(drawCardSessionRoot, { recursive: true });
  await mkdir(bodyBookSessionRoot, { recursive: true });
  await mkdir(visitSessionRoot, { recursive: true });
  await mkdir(tempReferenceRoot, { recursive: true });
  await mkdir(visitorStateRoot, { recursive: true });
  await mkdir(adminSessionRoot, { recursive: true });
  await mkdir(generatedImageRoot, { recursive: true });
  await mkdir(generatedPreviewRoot, { recursive: true });
  await mkdir(generatedThumbnailRoot, { recursive: true });
  await mkdir(jobReferenceRoot, { recursive: true });
  await mkdir(jobReferenceThumbnailRoot, { recursive: true });

  const entries = await readdir(imageJobRoot, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const job = await readImageJob(entry.name.replace(/\.json$/, ""));
        if (!job || !["queued", "running"].includes(job.status)) return;
        await saveImageJob({
          ...job,
          status: "failed",
          message: "服务重启，任务已中断，请重新生成。",
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        });
      })
  );
}

async function createTemporaryReference(file, ownerVisitorId = "") {
  const referenceId = randomUUID();
  const dir = path.join(tempReferenceRoot, referenceId);
  const extension = extensionForMime(file.mimetype);
  const filename = `reference.${extension}`;
  const metadata = {
    referenceId,
    name: file.originalname || `reference.${extension}`,
    mimeType: file.mimetype,
    size: Number(file.size || file.buffer?.length || 0),
    filename,
    ownerVisitorId: String(ownerVisitorId || ""),
    createdAt: new Date().toISOString()
  };

  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), file.buffer);
  await writeFile(path.join(dir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf-8");

  return metadata;
}

async function collectReferenceFiles(uploadedFiles, referenceIds) {
  if (!referenceIds.length) return uploadedFiles;
  const temporaryFiles = await Promise.all(referenceIds.map(readTemporaryReference));
  return [...temporaryFiles, ...uploadedFiles];
}

function parseReferenceIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  const text = String(value).trim();
  if (!text) return [];

  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readTemporaryReference(referenceId) {
  if (!isSafeReferenceId(referenceId)) {
    const error = new Error("Reference not found");
    error.status = 400;
    error.publicMessage = "Reference image is missing or expired.";
    throw error;
  }

  const dir = path.join(tempReferenceRoot, String(referenceId));
  const metadataPath = path.join(dir, "metadata.json");
  let metadata;

  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf-8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      const nextError = new Error("Reference not found");
      nextError.status = 400;
      nextError.publicMessage = "Reference image is missing or expired.";
      throw nextError;
    }
    throw error;
  }

  const buffer = await readFile(path.join(dir, metadata.filename));
  return {
    originalname: metadata.name,
    mimetype: metadata.mimeType,
    size: metadata.size,
    buffer
  };
}

async function deleteTemporaryReferences(referenceIds) {
  if (!referenceIds?.length) return;
  await Promise.all(referenceIds.map((referenceId) => deleteTemporaryReference(referenceId)));
}

async function deleteTemporaryReference(referenceId) {
  if (!isSafeReferenceId(referenceId)) return;
  await rm(path.join(tempReferenceRoot, String(referenceId)), { recursive: true, force: true });
}

async function runImageJob({ jobId, body, files, outputFormat, prompt, provider, providers, telemetry = null }) {
  let job = await readImageJob(jobId);
  if (!job) return;
  if (job.status === "cancelled") return;
  const abortController = new AbortController();
  activeImageJobs.set(jobId, { abortController });
  const jobRunStartedAtMs = nowMs();

  logDrawCardTelemetry("job_started", {
    traceId: telemetry?.traceId || "",
    sessionId: telemetry?.sessionId || "",
    visitorId: telemetry?.visitorId || "",
    jobId,
    styleId: telemetry?.styleId || "",
    styleName: telemetry?.styleName || "",
    order: normalizeTelemetryNumber(telemetry?.order),
    referenceCount: Array.isArray(files) ? files.length : 0,
    mode: Array.isArray(files) && files.length ? "edit" : "generation",
    providerId: provider?.id || "",
    providerModel: provider?.model || "",
    requestedProviderIdRaw: String(telemetry?.requestedProviderIdRaw || "")
  });

  job = await saveImageJob({
    ...job,
    status: "running",
    message: "正在生成图片。",
    telemetry: {
      ...(job.telemetry || {}),
      traceId: telemetry?.traceId || job.telemetry?.traceId || "",
      sessionId: telemetry?.sessionId || job.telemetry?.sessionId || "",
      styleId: telemetry?.styleId || job.telemetry?.styleId || "",
      styleName: telemetry?.styleName || job.telemetry?.styleName || "",
      order: normalizeTelemetryNumber(telemetry?.order ?? job.telemetry?.order),
      requestedProviderIdRaw: String(telemetry?.requestedProviderIdRaw || job.telemetry?.requestedProviderIdRaw || ""),
      requestedProvider: job.telemetry?.requestedProvider || toTelemetryProvider(provider),
      providerChain: job.telemetry?.providerChain?.length ? job.telemetry.providerChain : toTelemetryProviderList(providers),
      attempts: job.telemetry?.attempts || [],
      finalProvider: job.telemetry?.finalProvider || null,
      finalError: "",
      providerCallMs: null,
      persistResultMs: null,
      totalJobMs: null
    },
    updatedAt: new Date().toISOString()
  });

  try {
    const providerCallStartedAtMs = nowMs();
    const execution = await executeImageJobWithFailover({
      body,
      files,
      outputFormat,
      prompt,
      provider,
      providers,
      signal: abortController.signal,
      telemetry
    });
    const providerCallMs = elapsedMs(providerCallStartedAtMs);
    const result = execution.result;
    const latestJob = await readImageJob(jobId);
    if (!latestJob || latestJob.status === "cancelled") return;
    const persistResultStartedAtMs = nowMs();
    const publicResult = await persistImageJobResult(jobId, result, outputFormat);
    const persistResultMs = elapsedMs(persistResultStartedAtMs);
    await saveImageJob({
      ...latestJob,
      status: "succeeded",
      message: "生成完成。",
      result: {
        ...publicResult,
        provider: execution.provider
      },
      provider: execution.provider,
      telemetry: {
        ...(latestJob.telemetry || {}),
        traceId: telemetry?.traceId || latestJob.telemetry?.traceId || "",
        sessionId: telemetry?.sessionId || latestJob.telemetry?.sessionId || "",
        styleId: telemetry?.styleId || latestJob.telemetry?.styleId || "",
        styleName: telemetry?.styleName || latestJob.telemetry?.styleName || "",
        order: normalizeTelemetryNumber(telemetry?.order ?? latestJob.telemetry?.order),
        requestedProviderIdRaw: String(telemetry?.requestedProviderIdRaw || latestJob.telemetry?.requestedProviderIdRaw || ""),
        requestedProvider: latestJob.telemetry?.requestedProvider || toTelemetryProvider(provider),
        providerChain: latestJob.telemetry?.providerChain?.length ? latestJob.telemetry.providerChain : toTelemetryProviderList(providers),
        attempts: toTelemetryProviderAttempts(execution.attempts),
        finalProvider: toTelemetryProvider(execution.provider),
        finalError: "",
        providerCallMs,
        persistResultMs,
        totalJobMs: elapsedMs(jobRunStartedAtMs)
      },
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
    logDrawCardTelemetry("job_succeeded", {
      traceId: telemetry?.traceId || "",
      sessionId: telemetry?.sessionId || "",
      visitorId: telemetry?.visitorId || "",
      jobId,
      styleId: telemetry?.styleId || "",
      styleName: telemetry?.styleName || "",
      order: normalizeTelemetryNumber(telemetry?.order),
      providerId: execution.provider?.id || provider?.id || "",
      providerModel: execution.provider?.model || provider?.model || "",
      requestedProviderIdRaw: String(telemetry?.requestedProviderIdRaw || ""),
      attemptCount: Array.isArray(execution.attempts) ? execution.attempts.length : 0,
      providerCallMs,
      persistResultMs,
      totalJobMs: elapsedMs(jobRunStartedAtMs)
    });
    await synchronizeDrawCardSessionByJobId(jobId);
    await synchronizeBodyBookSessionByJobId(jobId);
  } catch (error) {
    const latestJob = await readImageJob(jobId);
    if (!latestJob || latestJob.status === "cancelled") return;
    await saveImageJob({
      ...latestJob,
      status: "failed",
      message: error.name === "AbortError" ? "任务已停止。" : error.publicMessage || error.message || "生图失败，请稍后再试。",
      result: null,
      telemetry: {
        ...(latestJob.telemetry || {}),
        traceId: telemetry?.traceId || latestJob.telemetry?.traceId || "",
        sessionId: telemetry?.sessionId || latestJob.telemetry?.sessionId || "",
        styleId: telemetry?.styleId || latestJob.telemetry?.styleId || "",
        styleName: telemetry?.styleName || latestJob.telemetry?.styleName || "",
        order: normalizeTelemetryNumber(telemetry?.order ?? latestJob.telemetry?.order),
        requestedProviderIdRaw: String(telemetry?.requestedProviderIdRaw || latestJob.telemetry?.requestedProviderIdRaw || ""),
        requestedProvider: latestJob.telemetry?.requestedProvider || toTelemetryProvider(provider),
        providerChain: latestJob.telemetry?.providerChain?.length ? latestJob.telemetry.providerChain : toTelemetryProviderList(providers),
        attempts: toTelemetryProviderAttempts(error.imageProviderAttempts || latestJob.telemetry?.attempts),
        finalProvider: null,
        finalError: normalizeTelemetryText(error.message || error.publicMessage || "unknown error", 180),
        providerCallMs: latestJob.telemetry?.providerCallMs ?? null,
        persistResultMs: latestJob.telemetry?.persistResultMs ?? null,
        totalJobMs: elapsedMs(jobRunStartedAtMs)
      },
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
    logDrawCardTelemetry("job_failed", {
      traceId: telemetry?.traceId || "",
      sessionId: telemetry?.sessionId || "",
      visitorId: telemetry?.visitorId || "",
      jobId,
      styleId: telemetry?.styleId || "",
      styleName: telemetry?.styleName || "",
      order: normalizeTelemetryNumber(telemetry?.order),
      providerId: provider?.id || "",
      providerModel: provider?.model || "",
      requestedProviderIdRaw: String(telemetry?.requestedProviderIdRaw || ""),
      attemptCount: Array.isArray(error.imageProviderAttempts) ? error.imageProviderAttempts.length : 0,
      totalJobMs: elapsedMs(jobRunStartedAtMs),
      message: error.message || error.publicMessage || "unknown error"
    });
    await synchronizeDrawCardSessionByJobId(jobId);
    await synchronizeBodyBookSessionByJobId(jobId);
  } finally {
    activeImageJobs.delete(jobId);
  }
}

async function persistImageJobResult(jobId, result, outputFormat) {
  if (!result.imageDataUrl) return persistRemoteImageJobResult(jobId, result, outputFormat);

  const match = result.imageDataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return persistRemoteImageJobResult(jobId, result, outputFormat);

  const extension = extensionForMime(match[1] || `image/${outputFormat}`);
  const filename = `${jobId}.${extension}`;
  const bytes = Buffer.from(match[2], "base64");
  await mkdir(generatedImageRoot, { recursive: true });
  await writeFile(path.join(generatedImageRoot, filename), bytes);
  const preview = await createPublicPreview(jobId, bytes);
  const thumbnail = await createGeneratedImageThumbnail(jobId, bytes);

  return {
    ...result,
    imageDataUrl: "",
    imageUrl: `/generated-images/${filename}`,
    mimeType: match[1],
    previewUrl: preview?.url || thumbnail?.url || "",
    previewWidth: preview?.width || null,
    previewHeight: preview?.height || null,
    thumbnailUrl: thumbnail?.url || "",
    thumbnailWidth: thumbnail?.width || null,
    thumbnailHeight: thumbnail?.height || null
  };
}

async function persistRemoteImageJobResult(jobId, result, outputFormat) {
  if (!result.imageUrl || !/^https?:\/\//i.test(result.imageUrl)) return result;

  const response = await fetch(result.imageUrl);
  if (!response.ok) return result;

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || result.mimeType || `image/${outputFormat}`;
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return result;

  const extension = extensionForMime(contentType);
  const filename = `${jobId}.${extension}`;
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(generatedImageRoot, { recursive: true });
  await writeFile(path.join(generatedImageRoot, filename), bytes);
  const preview = await createPublicPreview(jobId, bytes);
  const thumbnail = await createGeneratedImageThumbnail(jobId, bytes);

  return {
    ...result,
    imageDataUrl: "",
    imageUrl: `/generated-images/${filename}`,
    mimeType: contentType,
    originalImageUrl: result.imageUrl,
    previewUrl: preview?.url || thumbnail?.url || "",
    previewWidth: preview?.width || null,
    previewHeight: preview?.height || null,
    thumbnailUrl: thumbnail?.url || "",
    thumbnailWidth: thumbnail?.width || null,
    thumbnailHeight: thumbnail?.height || null
  };
}

async function readImageJob(jobId) {
  if (!isSafeImageJobId(jobId)) return null;
  try {
    return JSON.parse(await readFile(getImageJobPath(jobId), "utf-8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function listImageJobs() {
  await mkdir(imageJobRoot, { recursive: true });
  const entries = await readdir(imageJobRoot, { withFileTypes: true });
  const jobs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readImageJob(entry.name.replace(/\.json$/, "")))
  );
  return jobs.filter(Boolean);
}

// A registration upgrades the current browser-guest row in place, so its
// wallet and body books already keep the same account ID. Older image-job
// files did not persist ownerAccountId, however; stamp them during upgrade so
// the browser visitor ID can no longer expose them after an account switch.
async function migrateGuestAssetsToRegisteredAccount({ accountId, visitorId }) {
  const safeAccountId = String(accountId || "");
  const safeVisitorId = String(visitorId || "");
  if (!safeAccountId || !safeVisitorId) return;
  const jobs = await listImageJobs();
  const legacyGuestJobs = jobs.filter((job) =>
    job.visibility === "public" &&
    String(job.ownerVisitorId || "") === safeVisitorId &&
    !String(job.ownerAccountId || "")
  );
  await Promise.all(legacyGuestJobs.map((job) => saveImageJob({ ...job, ownerAccountId: safeAccountId })));

  const sessions = await listDrawCardSessions();
  const legacyGuestSessions = sessions.filter((session) =>
    String(session.ownerVisitorId || "") === safeVisitorId &&
    !String(session.ownerAccountId || "")
  );
  await Promise.all(legacyGuestSessions.map((session) => saveDrawCardSession({ ...session, ownerAccountId: safeAccountId })));

  const bodyBookSessions = await listBodyBookSessions();
  const legacyBodyBookSessions = bodyBookSessions.filter((session) =>
    String(session.ownerVisitorId || "") === safeVisitorId &&
    !String(session.ownerAccountId || "")
  );
  await Promise.all(legacyBodyBookSessions.map((session) => saveBodyBookSession({ ...session, ownerAccountId: safeAccountId })));
}

async function getMergeableGuestAssets({ guestAccount, visitorId }) {
  if (!guestAccount?.id || guestAccount.isRegistered || !visitorId) {
    return { clipCount: 0, projectCount: 0, savedBookCount: 0, hasAssets: false };
  }
  const guestAccountId = String(guestAccount.id);
  const safeVisitorId = String(visitorId);
  const [jobs, books] = await Promise.all([listImageJobs(), listBodyBookSessions()]);
  const clipCount = jobs.filter((job) =>
    job.visibility === "public" &&
    job.isLiked &&
    (String(job.ownerAccountId || "") === guestAccountId || (!String(job.ownerAccountId || "") && String(job.ownerVisitorId || "") === safeVisitorId))
  ).length;
  const projectCount = books.filter((book) =>
    (String(book.ownerAccountId || "") === guestAccountId || (!String(book.ownerAccountId || "") && String(book.ownerVisitorId || "") === safeVisitorId))
  ).length;
  return { clipCount, projectCount, savedBookCount: projectCount, hasAssets: clipCount > 0 || projectCount > 0 };
}

async function mergeGuestAssetsIntoAccount({ account, visitorId, mergeClip, mergeBodyBooks }) {
  const guestAccount = commerceStore.readAccountByOpenId(visitorId, "browser_guest");
  if (!guestAccount || guestAccount.id === account.id) return { mergedClipCount: 0, mergedProjectCount: 0, mergedSavedBookCount: 0 };
  const guestAccountId = String(guestAccount.id);
  const safeVisitorId = String(visitorId || "");
  let mergedClipCount = 0;
  let mergedSavedBookCount = 0;

  if (mergeClip) {
    const jobs = await listImageJobs();
    const guestClipJobs = jobs.filter((job) =>
      job.visibility === "public" &&
      job.isLiked &&
      (String(job.ownerAccountId || "") === guestAccountId || (!String(job.ownerAccountId || "") && String(job.ownerVisitorId || "") === safeVisitorId))
    );
    await Promise.all(guestClipJobs.map((job) => saveImageJob({ ...job, ownerAccountId: account.id })));
    mergedClipCount = guestClipJobs.length;
  }

  if (mergeBodyBooks) {
    const books = await listBodyBookSessions();
    const guestBooks = books.filter((book) =>
      (String(book.ownerAccountId || "") === guestAccountId || (!String(book.ownerAccountId || "") && String(book.ownerVisitorId || "") === safeVisitorId))
    );
    await Promise.all(guestBooks.map((book) => saveBodyBookSession({ ...book, ownerAccountId: account.id })));
    const bookJobIds = [...new Set(guestBooks.flatMap((book) =>
      (book.pages || []).flatMap((page) => [page?.jobId, ...(page?.historyJobIds || [])]).filter(isSafeImageJobId)
    ))];
    const bookJobs = await Promise.all(bookJobIds.map((jobId) => readImageJob(jobId)));
    await Promise.all(bookJobs
      .filter((job) => job && (
        String(job.ownerAccountId || "") === guestAccountId ||
        (!String(job.ownerAccountId || "") && String(job.ownerVisitorId || "") === safeVisitorId)
      ))
      .map((job) => saveImageJob({ ...job, ownerAccountId: account.id }))
    );
    mergedSavedBookCount = guestBooks.length;
  }

  return { mergedClipCount, mergedProjectCount: mergedSavedBookCount, mergedSavedBookCount };
}

async function queryImageJobs(options = {}) {
  const page = normalizeImageJobPage(options.page);
  const limit = normalizeImageJobLimit(options.limit);
  const status = normalizeImageJobQueryStatus(options.status);
  const search = normalizeImageJobSearch(options.search);
  const date = normalizeImageJobQueryDate(options.date);
  const likedOnly = normalizeBooleanQuery(options.likedOnly);
  const owner = normalizeImageJobOwnerFilter(options.owner);
  const [jobs, styles, accounts, visitors] = await Promise.all([
    listImageJobs(),
    readStyles(),
    Promise.resolve(commerceStore.listAdminAccounts()),
    listVisitorStates()
  ]);
  const ownerContext = buildImageJobOwnerContext(accounts, visitors);
  const stylesByPrompt = new Map();
  styles.forEach((style) => {
    const key = normalizeStylePromptMatchKey(style.prompt);
    if (!key) return;
    const matches = stylesByPrompt.get(key) || [];
    matches.push(style);
    stylesByPrompt.set(key, matches);
  });
  const jobsWithOwners = jobs.map((job) => ({ job, owner: resolveImageJobOwner(job, ownerContext) }));
  const ownerOptions = Array.from(new Map(jobsWithOwners.map(({ owner: item }) => [item.key, item])).values())
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
    .map((item) => ({ key: item.key, name: item.name, type: item.type }));
  const filteredJobs = jobsWithOwners
    .filter(({ job }) => matchesImageJobStatus(job, status))
    .filter(({ job }) => matchesImageJobLikedOnly(job, likedOnly))
    .filter(({ job }) => matchesImageJobDate(job, date))
    .filter(({ owner: item }) => !owner || item.key === owner)
    .filter(({ job, owner: item }) => matchesImageJobSearch(job, search, item))
    .sort(({ job: left }, { job: right }) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  const total = filteredJobs.length;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  return {
    jobs: filteredJobs.slice(start, start + limit).map(({ job, owner: jobOwner }) => {
      const matches = stylesByPrompt.get(normalizeStylePromptMatchKey(job.prompt)) || [];
      const matchedStyle = matches.length === 1 ? matches[0] : null;
      return {
        ...toPublicImageJob(job),
        owner: jobOwner,
        stylePreviewMatch: matchedStyle
          ? {
              id: String(matchedStyle.id || ""),
              name: formatStyleName(matchedStyle),
              subjectType: normalizeStyleSubjectType(matchedStyle.subjectType, matchedStyle)
            }
          : null
      };
    }),
    total,
    page: safePage,
    limit,
    ownerOptions
  };
}

function normalizeImageJobOwnerFilter(value) {
  const owner = String(value || "").trim();
  return owner.length <= 180 ? owner : "";
}

function buildImageJobOwnerContext(accounts, visitors) {
  const accountById = new Map();
  const accountByVisitorId = new Map();
  (Array.isArray(accounts) ? accounts : []).forEach((account) => {
    accountById.set(String(account.id || ""), account);
    const visitorIds = Array.isArray(account.visitorIds) ? account.visitorIds : [];
    visitorIds.forEach((visitorId) => {
      const current = accountByVisitorId.get(visitorId);
      if (!current || (!current.isRegistered && account.isRegistered)) accountByVisitorId.set(visitorId, account);
    });
    if (account.channel === "browser_guest" && account.openId) accountByVisitorId.set(account.openId, account);
  });
  return {
    accountById,
    accountByVisitorId,
    visitorById: new Map((Array.isArray(visitors) ? visitors : []).map((visitor) => {
      const safeVisitor = normalizeVisitorState(visitor);
      return [safeVisitor.visitorId, safeVisitor];
    }))
  };
}

function resolveImageJobOwner(job, context) {
  const accountId = String(job?.ownerAccountId || "");
  const visitorId = String(job?.ownerVisitorId || "");
  const visitorAccount = visitorId ? context.accountByVisitorId.get(visitorId) : null;
  const directAccount = accountId ? context.accountById.get(accountId) : null;
  const account = visitorAccount?.isRegistered ? visitorAccount : directAccount || visitorAccount || null;
  if (account?.isRegistered) {
    const name = getAccountDisplayName(account, account.email || `用户 ${String(account.id || "").slice(0, 8)}`);
    return { key: `registered:${account.id}`, type: "registered", accountId: String(account.id || ""), visitorId, name, email: String(account.email || "") };
  }
  const resolvedVisitorId = visitorId || String(account?.openId || "") || accountId;
  const visitor = context.visitorById.get(resolvedVisitorId);
  const shortId = String(resolvedVisitorId || "未知").slice(0, 8);
  return {
    key: `visitor:${resolvedVisitorId || "unknown"}`,
    type: "visitor",
    accountId: String(account?.id || accountId || ""),
    visitorId: resolvedVisitorId,
    name: `访客 ${shortId}`,
    email: "",
    tier: String(visitor?.tier || "")
  };
}

function normalizeStylePromptMatchKey(value) {
  return String(value || "").replace(/\r\n?/g, "\n").trim();
}

function findStylesMatchingJobPrompt(styles, prompt) {
  const key = normalizeStylePromptMatchKey(prompt);
  if (!key) return [];
  return (Array.isArray(styles) ? styles : []).filter((style) => normalizeStylePromptMatchKey(style.prompt) === key);
}

async function deleteImageJob(job) {
  activeImageJobs.delete(job.jobId);
  await deleteGeneratedImage(job);
  await deleteJobReferences(job);
  await rm(getImageJobPath(job.jobId), { force: true });
}

async function deleteGeneratedImage(job) {
  if (job?.jobId) {
    await rm(path.join(generatedPreviewRoot, `${job.jobId}.webp`), { force: true });
    await rm(path.join(generatedThumbnailRoot, `${job.jobId}.webp`), { force: true });
  }

  const imageUrl = job.result?.imageUrl;
  if (!imageUrl || !imageUrl.startsWith("/generated-images/")) return;
  const filename = path.basename(imageUrl);
  await rm(path.join(generatedImageRoot, filename), { force: true });
}

async function deleteJobReferences(job) {
  if (!job?.jobId) return;
  await rm(path.join(jobReferenceRoot, String(job.jobId)), { recursive: true, force: true });
  await rm(path.join(jobReferenceThumbnailRoot, String(job.jobId)), { recursive: true, force: true });
}

async function saveImageJob(job) {
  await mkdir(imageJobRoot, { recursive: true });
  const safeJob = toPublicImageJob(job);
  await writeFile(getImageJobPath(safeJob.jobId), `${JSON.stringify(safeJob, null, 2)}\n`);
  return safeJob;
}

async function persistImageJobReferences(jobId, referenceFiles, options = {}) {
  const includeMetrics = Boolean(options?.includeMetrics);
  const telemetry = options?.telemetry && typeof options.telemetry === "object" ? options.telemetry : null;
  if (!referenceFiles.length) {
    return includeMetrics
      ? {
          references: [],
          metrics: {
            persistMs: 0,
            thumbnailMs: 0,
            totalBytes: 0
          }
        }
      : [];
  }

  const jobDir = path.join(jobReferenceRoot, String(jobId));
  await mkdir(jobDir, { recursive: true });
  const persistStartedAtMs = nowMs();
  let totalThumbnailMs = 0;
  let totalBytes = 0;

  const references = await Promise.all(
    referenceFiles.map(async (file, index) => {
      const fileStartedAtMs = nowMs();
      const extension = extensionForMime(file.mimetype);
      const filename = `${index + 1}-${Date.now()}.${extension}`;
      await writeFile(path.join(jobDir, filename), file.buffer);
      const thumbnailStartedAtMs = nowMs();
      const thumbnail = await createReferenceThumbnail(jobId, filename, file.buffer, file.mimetype);
      const thumbnailMs = elapsedMs(thumbnailStartedAtMs);
      totalThumbnailMs += thumbnailMs;
      totalBytes += Number(file.size || file.buffer?.length || 0);
      logDrawCardTelemetry("reference_file_persisted", {
        traceId: telemetry?.traceId || "",
        sessionId: telemetry?.sessionId || "",
        jobId,
        styleId: telemetry?.styleId || "",
        styleName: telemetry?.styleName || "",
        order: normalizeTelemetryNumber(telemetry?.order),
        referenceIndex: index,
        bytes: Number(file.size || file.buffer?.length || 0),
        mimeType: file.mimetype,
        filePersistMs: elapsedMs(fileStartedAtMs),
        thumbnailMs
      });
      return {
        name: file.originalname || `reference-${index + 1}.${extension}`,
        mimeType: file.mimetype,
        order: index,
        url: `/job-references/${jobId}/${filename}`,
        thumbnailUrl: thumbnail?.url || "",
        thumbnailWidth: thumbnail?.width || null,
        thumbnailHeight: thumbnail?.height || null
      };
    })
  );

  if (!includeMetrics) {
    return references;
  }

  return {
    references,
    metrics: {
      persistMs: elapsedMs(persistStartedAtMs),
      thumbnailMs: totalThumbnailMs,
      totalBytes
    }
  };
}

async function buildBatchReferenceFiles(style, sharedReferenceFiles) {
  const styleReference = await createStyleReferenceFile(style);
  const files = styleReference
    ? [styleReference].concat(sharedReferenceFiles.map(cloneReferenceFile))
    : sharedReferenceFiles.map(cloneReferenceFile);

  if (files.length > 10) {
    const error = new Error(styleReference ? "Styles with an auto reference can use at most 9 shared reference images." : "At most 10 reference images are allowed.");
    error.status = 400;
    error.publicMessage = error.message;
    throw error;
  }

  return files;
}

async function createStyleReferenceFile(style) {
  const previewPath = getPreviewFilePath(style?.image);
  const ext = path.extname(String(previewPath || "")).toLowerCase();
  const mimeType = mimeForExtension(ext);
  let buffer = null;

  if (!style || !style.useStyleImageAsReference || !previewPath || !mimeType || mimeType === "image/svg+xml") {
    return null;
  }

  if (!(await fileExists(previewPath))) {
    return null;
  }

  buffer = await readFile(previewPath);
  return {
    originalname: `${String(style.id || "style")}-style-reference.${extensionForMime(mimeType)}`,
    mimetype: mimeType,
    size: buffer.length,
    buffer: buffer
  };
}

function cloneReferenceFile(file) {
  return {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    buffer: Buffer.from(file.buffer)
  };
}

function formatStyleName(style) {
  const title = normalizeStyleTitle(style?.title, "");
  if (title) return title;
  const tags = Array.isArray(style?.tags) ? style.tags.filter(Boolean) : [];
  return tags.length ? tags.join(" / ") : String(style?.id || "");
}

function toPublicImageJob(job) {
  const result = normalizeJobResult(job.result);
  return {
    jobId: String(job.jobId || ""),
    experienceType: normalizePublicExperienceType(job.experienceType),
    status: job.status,
    message: job.message || "",
    result,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
    completedAt: job.completedAt || null,
    prompt: String(job.prompt || ""),
    size: String(job.size || ""),
    referenceCount: Number(job.referenceCount || 0),
    originalReferences: normalizeJobReferences(job.originalReferences),
    styleId: String(job.styleId || ""),
    styleName: String(job.styleName || ""),
    styleGroupId: String(job.styleGroupId || ""),
    styleGroupName: String(job.styleGroupName || ""),
    durationSeconds: computeDurationSeconds(job),
    totalTokens: Number(result?.usage?.total_tokens || result?.usage?.totalTokens || 0),
    provider: job.provider || null,
    mode: job.mode || result?.mode || "",
    isLiked: Boolean(job.isLiked),
    likedAt: job.likedAt || null,
    ownerAccountId: String(job.ownerAccountId || ""),
    ownerVisitorId: String(job.ownerVisitorId || ""),
    visibility: String(job.visibility || "admin"),
    telemetry: normalizeJobTelemetry(job.telemetry)
  };
}

function normalizeJobTelemetry(telemetry) {
  const current = telemetry && typeof telemetry === "object" ? telemetry : {};
  return {
    traceId: String(current.traceId || ""),
    sessionId: String(current.sessionId || ""),
    styleId: String(current.styleId || ""),
    styleName: String(current.styleName || ""),
    order: normalizeTelemetryNumber(current.order),
    requestedProviderIdRaw: String(current.requestedProviderIdRaw || ""),
    requestedProvider: toTelemetryProvider(current.requestedProvider),
    providerChain: toTelemetryProviderList(current.providerChain),
    attempts: toTelemetryProviderAttempts(current.attempts),
    finalProvider: toTelemetryProvider(current.finalProvider),
    finalError: normalizeTelemetryText(current.finalError, 180),
    providerCallMs: normalizeTelemetryNumber(current.providerCallMs),
    persistResultMs: normalizeTelemetryNumber(current.persistResultMs),
    totalJobMs: normalizeTelemetryNumber(current.totalJobMs)
  };
}

function normalizeJobResult(result) {
  if (!result || typeof result !== "object") return null;
  return {
    ...result,
    imageDataUrl: String(result.imageDataUrl || ""),
    imageUrl: String(result.imageUrl || ""),
    originalImageUrl: String(result.originalImageUrl || ""),
    previewUrl: String(result.previewUrl || result.thumbnailUrl || ""),
    previewWidth: Number(result.previewWidth || 0) || null,
    previewHeight: Number(result.previewHeight || 0) || null,
    thumbnailUrl: String(result.thumbnailUrl || ""),
    thumbnailWidth: Number(result.thumbnailWidth || 0) || null,
    thumbnailHeight: Number(result.thumbnailHeight || 0) || null
  };
}

function normalizeJobReferences(references) {
  return Array.isArray(references)
    ? references.map((reference) => ({
        ...reference,
        name: String(reference?.name || ""),
        mimeType: String(reference?.mimeType || ""),
        order: Number(reference?.order || 0),
        url: String(reference?.url || ""),
        thumbnailUrl: String(reference?.thumbnailUrl || ""),
        thumbnailWidth: Number(reference?.thumbnailWidth || 0) || null,
        thumbnailHeight: Number(reference?.thumbnailHeight || 0) || null
      }))
    : [];
}

async function createGeneratedImageThumbnail(jobId, bytes) {
  return createImageThumbnail({
    buffer: bytes,
    outputRoot: generatedThumbnailRoot,
    outputName: String(jobId || ""),
    urlPrefix: "/generated-thumbnails",
    maxEdge: RESULT_THUMBNAIL_MAX_EDGE
  });
}

async function createPublicPreview(jobId, bytes) {
  const sharp = await loadSharpModule();
  if (!sharp || !bytes?.length) return null;

  try {
    const resized = await sharp(bytes, { animated: false })
      .rotate()
      .resize({
        width: PUBLIC_PREVIEW_MAX_EDGE,
        height: PUBLIC_PREVIEW_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true
      })
      .toBuffer({ resolveWithObject: true });
    const width = Number(resized.info?.width || 0) || PUBLIC_PREVIEW_MAX_EDGE;
    const height = Number(resized.info?.height || 0) || PUBLIC_PREVIEW_MAX_EDGE;
    const transformed = await sharp(resized.data, { animated: false })
      .composite([{ input: createPublicPreviewWatermark(width, height) }])
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    await mkdir(generatedPreviewRoot, { recursive: true });
    await writeFile(path.join(generatedPreviewRoot, `${jobId}.webp`), transformed.data);
    return {
      url: `/generated-previews/${jobId}.webp`,
      width: Number(transformed.info?.width || 0) || null,
      height: Number(transformed.info?.height || 0) || null,
      mimeType: "image/webp"
    };
  } catch (error) {
    console.warn("Preview generation skipped.", error?.message || error);
    return null;
  }
}

function createPublicPreviewWatermark(width, height) {
  const safeWidth = Math.max(1, Math.round(width || PUBLIC_PREVIEW_MAX_EDGE));
  const safeHeight = Math.max(1, Math.round(height || PUBLIC_PREVIEW_MAX_EDGE));
  const barHeight = Math.max(72, Math.floor(safeHeight * 0.11));
  const labelFontSize = Math.max(28, Math.floor(safeWidth * 0.04));
  const labelX = Math.max(24, Math.floor(safeWidth * 0.035));
  const labelY = safeHeight - Math.max(22, Math.floor(barHeight * 0.36));
  const patternFontSize = Math.max(20, Math.floor(safeWidth * 0.032));
  const patternWidth = Math.max(220, Math.floor(safeWidth * 0.23));
  const patternHeight = Math.max(140, Math.floor(safeHeight * 0.17));
  const watermarkOutlineScale = patternFontSize / PUBLIC_PREVIEW_WATERMARK_OUTLINE_FONT_SIZE;
  const watermarkOutlineAdvance = PUBLIC_PREVIEW_WATERMARK_OUTLINE_ADVANCE * watermarkOutlineScale;
  const watermarkOutlineY = Math.floor(patternHeight * 0.6) - PUBLIC_PREVIEW_WATERMARK_OUTLINE_BASELINE * watermarkOutlineScale;
  const watermarkOutlineOffsets = [-watermarkOutlineAdvance, 0, watermarkOutlineAdvance, watermarkOutlineAdvance * 2];
  const labelOutlineScale = labelFontSize / PUBLIC_PREVIEW_WATERMARK_OUTLINE_FONT_SIZE;
  const labelOutlineY = labelY - PUBLIC_PREVIEW_WATERMARK_OUTLINE_BASELINE * labelOutlineScale;
  const watermarkOutlinePaths = watermarkOutlineOffsets.map((offset) => `
    <path
      d="${PUBLIC_PREVIEW_WATERMARK_OUTLINE_PATH}"
      transform="translate(${offset} ${watermarkOutlineY}) scale(${watermarkOutlineScale})"
      fill="#ffffff"
      fill-opacity="0.13"
      stroke="#101114"
      stroke-opacity="0.1"
      stroke-width="${1 / watermarkOutlineScale}"
    />
  `).join("");

  return Buffer.from(`
    <svg width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="preview-diagonal-pattern" patternUnits="userSpaceOnUse" width="${patternWidth}" height="${patternHeight}" patternTransform="rotate(-28)">
          ${watermarkOutlinePaths}
        </pattern>
      </defs>
      <rect x="0" y="0" width="${safeWidth}" height="${safeHeight}" fill="url(#preview-diagonal-pattern)" />
      <rect x="0" y="${Math.max(0, safeHeight - barHeight)}" width="${safeWidth}" height="${barHeight}" fill="#08080a" fill-opacity="0.82" />
      <path
        d="${PUBLIC_PREVIEW_WATERMARK_OUTLINE_PATH}"
        transform="translate(${labelX} ${labelOutlineY}) scale(${labelOutlineScale})"
        fill="#ffffff"
        fill-opacity="1"
        stroke="#08080a"
        stroke-opacity="0.52"
        stroke-width="${1.5 / labelOutlineScale}"
      />
    </svg>
  `);
}

function getVisitorStatePath(visitorId) {
  return path.join(visitorStateRoot, `${visitorId}.json`);
}

function getAdminSessionPath(sessionId) {
  return path.join(adminSessionRoot, `${sessionId}.json`);
}

function isSafeVisitorId(visitorId) {
  return /^[a-f0-9-]{36}$/i.test(String(visitorId || ""));
}

function assertWebAccountOwnsOrder(req, order) {
  if (!order) throw createHttpError(404, "订单不存在。");
  if (!req.webAccount || !order.accountId || order.accountId !== req.webAccount.id) {
    throw createHttpError(403, "无权访问该订单。");
  }
}

function accountOwnsVisitor(account, visitorId) {
  if (!account?.id || !visitorId) return false;
  return commerceStore.listVisitorIds(account.id).includes(String(visitorId));
}

function accountOwnsPublicRecord(account, record) {
  if (!account?.id || !record) return false;
  const ownerAccountId = String(record.ownerAccountId || "");
  return ownerAccountId ? ownerAccountId === String(account.id) : accountOwnsVisitor(account, record.ownerVisitorId);
}

function isSafeAccountId(accountId) {
  return /^[a-f0-9-]{36}$/i.test(String(accountId || ""));
}

function isSafeAdminSessionId(sessionId) {
  return /^[a-f0-9-]{36}$/i.test(String(sessionId || ""));
}

async function createReferenceThumbnail(jobId, filename, bytes, mimeType) {
  if (mimeType === "image/svg+xml") return null;
  const baseName = path.basename(filename, path.extname(filename));
  return createImageThumbnail({
    buffer: bytes,
    outputRoot: path.join(jobReferenceThumbnailRoot, String(jobId)),
    outputName: baseName,
    urlPrefix: `/job-reference-thumbnails/${jobId}`,
    maxEdge: REFERENCE_THUMBNAIL_MAX_EDGE
  });
}

async function createImageThumbnail({ buffer, outputRoot, outputName, urlPrefix, maxEdge }) {
  const sharp = await loadSharpModule();
  let transformed = null;
  let outputPath = "";

  if (!sharp || !buffer?.length || !outputName || !urlPrefix) {
    return null;
  }

  try {
    transformed = await sharp(buffer, { animated: false })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });

    outputPath = path.join(outputRoot, `${outputName}.webp`);
    await mkdir(outputRoot, { recursive: true });
    await writeFile(outputPath, transformed.data);

    return {
      url: `${urlPrefix}/${outputName}.webp`,
      width: Number(transformed.info?.width || 0) || null,
      height: Number(transformed.info?.height || 0) || null,
      mimeType: "image/webp"
    };
  } catch (error) {
    console.warn("Thumbnail generation skipped.", error?.message || error);
    return null;
  }
}

async function loadSharpModule() {
  if (sharpModulePromise !== undefined) {
    return sharpModulePromise;
  }

  sharpModulePromise = import("sharp")
    .then((module) => module.default || module)
    .catch((error) => {
      console.warn("sharp is not installed. Thumbnail generation is disabled until dependencies are updated.", error?.message || error);
      return null;
    });

  return sharpModulePromise;
}

function computeDurationSeconds(job) {
  if (!job.createdAt || !job.completedAt) return null;
  const startedAt = new Date(job.createdAt).getTime();
  const completedAt = new Date(job.completedAt).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return null;
  return Math.max(0, Math.round((completedAt - startedAt) / 1000));
}

function getDrawCardSessionPath(sessionId) {
  return path.join(drawCardSessionRoot, `${sessionId}.json`);
}

function getBodyBookSessionPath(sessionId) {
  return path.join(bodyBookSessionRoot, `${sessionId}.json`);
}

function getVisitSessionPath(sessionId) {
  return path.join(visitSessionRoot, `${sessionId}.json`);
}

function getImageJobPath(jobId) {
  return path.join(imageJobRoot, `${jobId}.json`);
}

function isSafeDrawCardSessionId(sessionId) {
  return /^[a-f0-9-]{36}$/i.test(String(sessionId || ""));
}

function isSafeVisitSessionId(sessionId) {
  return /^[a-f0-9-]{36}$/i.test(String(sessionId || ""));
}

function isSafeImageJobId(jobId) {
  return /^[a-f0-9-]{36}$/i.test(String(jobId || ""));
}

function isSafeReferenceId(referenceId) {
  return /^[a-f0-9-]{36}$/i.test(String(referenceId || ""));
}

async function createImageGeneration(prompt, outputFormat, provider, body, signal) {
  const route = normalizeApiProviderRoute(provider?.route, "images");
  if (route === "responses") {
    return createResponsesImage([], prompt, outputFormat, provider, body, "generation", signal);
  }
  if (route === "chat_completions") {
    return createChatCompletionsImage([], prompt, outputFormat, provider, body, "generation", signal);
  }

  const payload = {
    model: provider.model,
    prompt,
    size: normalizeSize(body.size),
    quality: normalizeOption(body.quality, ["low", "medium", "high", "auto"], "medium"),
    n: 1,
    output_format: outputFormat,
    background: normalizeOption(body.background, ["auto", "opaque", "transparent"], "auto"),
    moderation: normalizeOption(body.moderation, ["auto", "low"], "auto")
  };

  const response = await callImageProviderApi(provider, "/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, signal);
  return formatImageResponse(response, outputFormat, "generation");
}

async function createImageEdit(files, prompt, outputFormat, provider, body, signal) {
  const route = normalizeApiProviderRoute(provider?.route, "images");
  if (route === "responses") {
    return createResponsesImage(files, prompt, outputFormat, provider, body, "edit", signal);
  }
  if (route === "chat_completions") {
    return createChatCompletionsImage(files, prompt, outputFormat, provider, body, "edit", signal);
  }

  const formData = new FormData();
  formData.append("model", provider.model);
  formData.append("prompt", prompt);
  formData.append("size", normalizeSize(body.size));
  formData.append("quality", normalizeOption(body.quality, ["low", "medium", "high", "auto"], "medium"));
  formData.append("n", "1");
  formData.append("output_format", outputFormat);
  formData.append("background", normalizeOption(body.background, ["auto", "opaque", "transparent"], "auto"));
  formData.append("moderation", normalizeOption(body.moderation, ["auto", "low"], "auto"));
  files.forEach((file, index) => {
    formData.append("image", new Blob([file.buffer], { type: file.mimetype }), file.originalname || `reference-${index + 1}.${extensionForMime(file.mimetype)}`);
  });

  const response = await callImageProviderApi(provider, "/images/edits", {
    method: "POST",
    body: formData
  }, signal);
  return formatImageResponse(response, outputFormat, "edit");
}

function mimeTypeForOutputFormat(outputFormat) {
  return outputFormat === "jpeg" ? "image/jpeg" : `image/${outputFormat}`;
}

function buildAlternateImageApiPrompt(prompt, body, hasReferences = false) {
  const basePrompt = String(prompt || "").trim();
  const instructions = [];
  const size = normalizeSize(body?.size);
  const background = normalizeOption(body?.background, ["auto", "opaque", "transparent"], "auto");
  const quality = normalizeOption(body?.quality, ["low", "medium", "high", "auto"], "medium");

  if (hasReferences) instructions.push("Use the provided reference image inputs during generation.");
  if (size !== "auto") instructions.push(`Target output size: ${size}.`);
  if (background !== "auto") instructions.push(`Background preference: ${background}.`);
  if (quality !== "auto") instructions.push(`Quality preference: ${quality}.`);
  instructions.push("Return the generated image result directly without extra narration.");

  return instructions.length ? `${basePrompt}\n\nAdditional generation instructions:\n- ${instructions.join("\n- ")}` : basePrompt;
}

function encodeReferenceFileAsDataUrl(file) {
  const mimeType = String(file?.mimetype || file?.mimeType || "image/jpeg").trim() || "image/jpeg";
  const bytes = Buffer.isBuffer(file?.buffer) ? file.buffer : Buffer.from(file?.buffer || []);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function buildResponsesInput(prompt, files, body) {
  const content = [{ type: "input_text", text: buildAlternateImageApiPrompt(prompt, body, files.length > 0) }];
  files.forEach((file) => {
    content.push({
      type: "input_image",
      image_url: encodeReferenceFileAsDataUrl(file)
    });
  });
  return [{ role: "user", content }];
}

function buildChatMessages(prompt, files, body) {
  const content = [{ type: "text", text: buildAlternateImageApiPrompt(prompt, body, files.length > 0) }];
  files.forEach((file) => {
    content.push({
      type: "image_url",
      image_url: {
        url: encodeReferenceFileAsDataUrl(file)
      }
    });
  });
  return [{ role: "user", content }];
}

async function createResponsesImage(files, prompt, outputFormat, provider, body, mode, signal) {
  const primaryPayload = {
    model: provider.model,
    stream: false,
    input: buildResponsesInput(prompt, files, body)
  };

  const primaryResponse = await callImageProviderApi(provider, "/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(primaryPayload)
  }, signal);

  try {
    return formatFlexibleImageResponse(primaryResponse, outputFormat, mode);
  } catch (error) {
    if (error.message !== "Missing image data") throw error;
  }

  const toolResponse = await callImageProviderApi(provider, "/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...primaryPayload,
      tools: [{ type: "image_generation" }]
    })
  }, signal);
  return formatFlexibleImageResponse(toolResponse, outputFormat, mode);
}

async function createChatCompletionsImage(files, prompt, outputFormat, provider, body, mode, signal) {
  const payload = {
    model: provider.model,
    stream: false,
    messages: buildChatMessages(prompt, files, body)
  };
  const response = await callImageProviderApi(provider, "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, signal);
  return formatFlexibleImageResponse(response, outputFormat, mode);
}

function resolveImageProviderEndpoint(provider, hasReferences) {
  const route = normalizeApiProviderRoute(provider?.route, "images");
  if (route === "responses") return "/responses";
  if (route === "chat_completions") return "/chat/completions";
  return hasReferences ? "/images/edits" : "/images/generations";
}

async function executeImageJobWithFailover({ body, files, outputFormat, prompt, provider, providers, signal }) {
  const providerChain = Array.isArray(providers) && providers.length ? providers : provider ? [provider] : [];
  if (!providerChain.length) {
    const error = new Error("No image providers configured");
    error.publicMessage = "暂无可用的生图服务，请稍后再试。";
    error.status = 503;
    throw error;
  }

  let lastError = null;
  const attempts = [];
  for (const currentProvider of providerChain) {
    const attemptStartedAtMs = nowMs();
    const endpoint = resolveImageProviderEndpoint(currentProvider, files.length > 0);
    const attemptProvider = {
      id: currentProvider.id,
      name: currentProvider.name,
      model: currentProvider.model
    };
    try {
      const result = files.length
        ? await createImageEdit(files, prompt, outputFormat, currentProvider, body, signal)
        : await createImageGeneration(prompt, outputFormat, currentProvider, body, signal);
      attempts.push({
        provider: attemptProvider,
        endpoint,
        status: "succeeded",
        durationMs: elapsedMs(attemptStartedAtMs),
        statusCode: 200,
        message: ""
      });
      return {
        result,
        provider: attemptProvider,
        attempts
      };
    } catch (error) {
      attempts.push({
        provider: attemptProvider,
        endpoint,
        status: error.name === "AbortError" ? "aborted" : "failed",
        durationMs: elapsedMs(attemptStartedAtMs),
        statusCode: error.status || null,
        message: error.message || error.publicMessage || ""
      });
      error.imageProviderAttempts = attempts;
      if (error.name === "AbortError") throw error;
      lastError = error;
    }
  }

  if (lastError && providerChain.length > 1 && lastError.name !== "AbortError") {
    const wrappedError = new Error(lastError.message || "Image generation failed");
    wrappedError.status = lastError.status || 502;
    wrappedError.publicMessage = appendImageFailoverSummary(lastError.publicMessage || "图片生成失败，请稍后再试。");
    wrappedError.imageProviderAttempts = attempts;
    throw wrappedError;
  }

  if (lastError) lastError.imageProviderAttempts = attempts;
  throw lastError || new Error("Image generation failed");
}

function normalizeProviderResponseCharset(contentType) {
  const raw = String(contentType || "");
  const match = raw.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  const charset = String(match?.[1] || "").trim().toLowerCase();
  if (!charset) return "utf-8";
  if (charset === "gbk" || charset === "gb2312") return "gb18030";
  return charset;
}

async function readProviderApiText(response) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) return "";
  const charset = normalizeProviderResponseCharset(response.headers.get("content-type"));
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function extractProviderApiErrorMessage(payload, text, status) {
  if (payload && typeof payload === "object") {
    const nestedMessage = payload.error?.message;
    if (nestedMessage) return String(nestedMessage).trim();
    if (payload.message) return String(payload.message).trim();
  }

  const rawText = String(text || "").trim();
  if (rawText) return rawText;
  return `接口返回 ${status}`;
}

async function callImageProviderApi(provider, endpoint, options, externalSignal) {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
  }
  const timeoutMs = normalizeTimeout(process.env.KUAIPAO_IMAGE_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await readProviderApiText(response);
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        if (response.ok) throw error;
      }
    }

    if (!response.ok) {
      const message = extractProviderApiErrorMessage(payload, text, response.status);
      const error = new Error(message);
      error.status = response.status;
      const endpointLabel =
        endpoint === "/images/edits"
          ? "参考图编辑接口"
          : endpoint === "/images/generations"
            ? "生图接口"
            : endpoint === "/responses"
              ? "Responses 接口"
              : endpoint === "/chat/completions"
                ? "Chat Completions 接口"
                : `${endpoint} 接口`;
      error.publicMessage = `${provider.name} ${endpointLabel}调用失败：${message}`;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      error.publicMessage = `生图请求超过 ${Math.round(timeoutMs / 1000)} 秒仍未完成。可以降低尺寸或质量后重试，或在 .env 中调大 KUAIPAO_IMAGE_TIMEOUT_MS。`;
      error.status = 504;
    } else if (error instanceof SyntaxError) {
      error.publicMessage = "中转接口返回了无法解析的结果。";
      error.status = 502;
    } else if (isLikelyImageProviderConnectionError(error)) {
      error.publicMessage = buildImageProviderConnectionErrorMessage(provider, endpoint);
      error.status = 502;
    }
    throw error;
  } finally {
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    clearTimeout(timeout);
  }
}

function formatImageResponse(payload, outputFormat, mode) {
  const firstImage = payload.data?.[0];
  const b64 = firstImage?.b64_json;
  const url = firstImage?.url;
  if (!b64 && !url) {
    const error = new Error("Missing image data");
    error.status = 502;
    error.publicMessage = "中转接口没有返回图片数据。";
    throw error;
  }

  const mimeType = outputFormat === "jpeg" ? "image/jpeg" : `image/${outputFormat}`;
  return {
    imageDataUrl: b64 ? `data:${mimeType};base64,${b64}` : "",
    imageUrl: url || "",
    mimeType,
    usage: payload.usage || null,
    mode
  };
}

function normalizeSize(value) {
  const size = String(value || "auto").trim();
  if (size === "auto") return "auto";
  return /^\d{2,5}x\d{2,5}$/.test(size) ? size : "auto";
}

function normalizeOption(value, allowed, fallback) {
  const item = String(value || fallback).trim();
  return allowed.includes(item) ? item : fallback;
}

function normalizeTimeout(value) {
  const timeout = Number(value || 1800000);
  if (!Number.isFinite(timeout)) return 1800000;
  return Math.min(Math.max(timeout, 60000), 3600000);
}

function getImageProviders() {
  const mergedProviders = mergeConfiguredProviders(getEnvImageProviders(), readStoredApiProvidersSync());
  return mergedProviders
    .filter((provider) => provider.enabled !== false && isUsableApiKey(provider.apiKey) && provider.baseUrl)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      route: provider.route || "images",
      visionModel: provider.visionModel || DEFAULT_SUBJECT_CLASSIFIER_MODEL
    }));
}

function getEnvImageProviders() {
  const ids = String(process.env.IMAGE_API_PROVIDERS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const providers = ids.map(readConfiguredProvider).filter(Boolean);
  const legacy = readLegacyKuaipaoProvider();
  if (legacy && !providers.some((provider) => provider.id === legacy.id)) providers.unshift(legacy);
  return providers;
}

function readConfiguredProvider(id) {
  const key = providerEnvKey(id);
  const apiKey = process.env[`IMAGE_API_${key}_KEY`];
  const baseUrl = normalizeApiProviderBaseUrl(process.env[`IMAGE_API_${key}_BASE_URL`]);
  const enabled = normalizeApiProviderEnabled(process.env[`IMAGE_API_${key}_ENABLED`], true);
  if ((!isUsableApiKey(apiKey) || !baseUrl) && enabled) return null;
  return {
    id,
    name: process.env[`IMAGE_API_${key}_NAME`] || id,
    baseUrl,
    apiKey,
    model: process.env[`IMAGE_API_${key}_MODEL`] || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    route: normalizeApiProviderRoute(process.env[`IMAGE_API_${key}_ROUTE`], "images"),
    visionModel: process.env[`IMAGE_API_${key}_VISION_MODEL`] || process.env.OPENAI_VISION_MODEL || DEFAULT_SUBJECT_CLASSIFIER_MODEL,
    enabled
  };
}

function formatFlexibleImageResponse(payload, outputFormat, mode) {
  const extracted = extractImageCandidateFromPayload(payload, outputFormat);
  if (!extracted.imageDataUrl && !extracted.imageUrl) {
    const error = new Error("Missing image data");
    error.status = 502;
    error.publicMessage = "中转接口没有返回图片数据。";
    throw error;
  }

  return {
    imageDataUrl: extracted.imageDataUrl || "",
    imageUrl: extracted.imageUrl || "",
    mimeType: extracted.mimeType || mimeTypeForOutputFormat(outputFormat),
    usage: payload.usage || null,
    mode
  };
}

function extractImageCandidateFromPayload(payload, outputFormat) {
  return (
    extractImageCandidate(payload?.data?.[0], outputFormat, "data") ||
    extractImageCandidate(payload?.output, outputFormat, "output") ||
    extractImageCandidate(payload?.choices, outputFormat, "choices") ||
    extractImageCandidate(payload, outputFormat, "payload") ||
    { imageDataUrl: "", imageUrl: "", mimeType: mimeTypeForOutputFormat(outputFormat) }
  );
}

function extractImageCandidate(value, outputFormat, keyHint = "") {
  if (!value) return null;

  if (typeof value === "string") {
    return extractImageCandidateFromString(value, outputFormat, keyHint);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageCandidate(item, outputFormat, keyHint);
      if (found) return found;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  if (typeof value.url === "string") {
    const directUrl = extractImageCandidateFromString(value.url, outputFormat, "url");
    if (directUrl) return directUrl;
  }

  if (typeof value.b64_json === "string") {
    const directB64 = extractImageCandidateFromString(value.b64_json, outputFormat, "b64_json");
    if (directB64) return directB64;
  }

  if (typeof value.result === "string" || (value.result && typeof value.result === "object")) {
    const directResult = extractImageCandidate(value.result, outputFormat, "result");
    if (directResult) return directResult;
  }

  if (typeof value.image_url === "string" || (value.image_url && typeof value.image_url === "object")) {
    const imageUrl = extractImageCandidate(value.image_url, outputFormat, "image_url");
    if (imageUrl) return imageUrl;
  }

  if (typeof value.output_text === "string") {
    const outputText = extractImageCandidateFromString(value.output_text, outputFormat, "output_text");
    if (outputText) return outputText;
  }

  if (typeof value.text === "string") {
    const textCandidate = extractImageCandidateFromString(value.text, outputFormat, "text");
    if (textCandidate) return textCandidate;
  }

  if (typeof value.content === "string" || Array.isArray(value.content)) {
    const contentCandidate = extractImageCandidate(value.content, outputFormat, "content");
    if (contentCandidate) return contentCandidate;
  }

  for (const [nextKey, nextValue] of Object.entries(value)) {
    if (["url", "b64_json", "result", "image_url", "output_text", "text", "content", "input", "messages"].includes(nextKey)) continue;
    const found = extractImageCandidate(nextValue, outputFormat, nextKey);
    if (found) return found;
  }

  return null;
}

function extractImageCandidateFromString(value, outputFormat, keyHint = "") {
  const text = String(value || "").trim();
  if (!text) return null;

  if (/^data:image\//i.test(text)) {
    return {
      imageDataUrl: text,
      imageUrl: "",
      mimeType: String(text.match(/^data:(image\/[^;]+);/i)?.[1] || mimeTypeForOutputFormat(outputFormat))
    };
  }

  if (/^https?:\/\//i.test(text)) {
    return {
      imageDataUrl: "",
      imageUrl: text,
      mimeType: mimeTypeForOutputFormat(outputFormat)
    };
  }

  const dataUrlMatch = text.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\r\n]+/i);
  if (dataUrlMatch) {
    return extractImageCandidateFromString(dataUrlMatch[0], outputFormat, "data_url");
  }

  const markdownUrlMatch = text.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
  if (markdownUrlMatch?.[1]) {
    return {
      imageDataUrl: "",
      imageUrl: markdownUrlMatch[1],
      mimeType: mimeTypeForOutputFormat(outputFormat)
    };
  }

  const plainUrlMatch = text.match(/https?:\/\/[^\s"'`<>()]+/i);
  if (plainUrlMatch?.[0]) {
    return {
      imageDataUrl: "",
      imageUrl: plainUrlMatch[0],
      mimeType: mimeTypeForOutputFormat(outputFormat)
    };
  }

  const normalizedKey = String(keyHint || "").trim().toLowerCase();
  if ((normalizedKey.includes("b64") || normalizedKey.includes("base64") || normalizedKey === "result" || normalizedKey === "data") && looksLikeBase64ImageData(text)) {
    const base64 = text.replace(/\s+/g, "");
    return {
      imageDataUrl: `data:${mimeTypeForOutputFormat(outputFormat)};base64,${base64}`,
      imageUrl: "",
      mimeType: mimeTypeForOutputFormat(outputFormat)
    };
  }

  return null;
}

function looksLikeBase64ImageData(value) {
  const text = String(value || "").replace(/\s+/g, "");
  return text.length >= 128 && text.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(text);
}

function readLegacyKuaipaoProvider() {
  const apiKey = process.env.KUAIPAO_API_KEY || process.env.OPENAI_API_KEY;
  if (!isUsableApiKey(apiKey)) return null;
  return {
    id: "kuaipao",
    name: "蹇窇",
    baseUrl: normalizeApiProviderBaseUrl(process.env.KUAIPAO_BASE_URL || "https://kuaipao.pro/v1"),
    apiKey,
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    route: "images",
    visionModel: process.env.OPENAI_VISION_MODEL || DEFAULT_SUBJECT_CLASSIFIER_MODEL,
    enabled: true
  };
}

function resolveImageProvider(requestedId, providers, settings = null) {
  if (!providers.length) return null;
  const id = normalizeImageProviderId(requestedId, providers) || getDefaultProviderId(providers, settings);
  return providers.find((provider) => provider.id === id) || providers[0];
}

function getProviderFallbackChain(requestedId, providers, settings = null) {
  const selected = resolveImageProvider(requestedId, providers, settings);
  if (!selected) return [];
  const explicitId = normalizeImageProviderId(requestedId, providers);
  if (explicitId || getImageProviderFailoverMode() === "stop") return [selected];

  return [selected]
    .concat(providers.filter((provider) => provider.id !== selected.id))
    .filter((provider, index, list) => list.findIndex((item) => item.id === provider.id) === index);
}

function getDefaultProviderId(providers, settings = null) {
  const configured = normalizeImageProviderId(process.env.IMAGE_API_PROVIDER, providers);
  if (configured && providers.some((provider) => provider.id === configured)) return configured;
  const saved = normalizeImageProviderId(settings?.defaultImageProviderId, providers);
  if (saved) return saved;
  return providers[0]?.id || "";
}

function isLikelyImageProviderConnectionError(error) {
  if (!error || error.name === "AbortError" || error instanceof SyntaxError) return false;
  const message = String(error.message || "").toLowerCase();
  const causeCode = String(error.cause?.code || "").toUpperCase();
  return (
    error instanceof TypeError ||
    message === "fetch failed" ||
    message.includes("econn") ||
    message.includes("network") ||
    message.includes("socket") ||
    message.includes("timed out") ||
    causeCode === "ECONNREFUSED" ||
    causeCode === "ECONNRESET" ||
    causeCode === "ENOTFOUND" ||
    causeCode === "EAI_AGAIN" ||
    causeCode === "ETIMEDOUT" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    causeCode === "UND_ERR_HEADERS_TIMEOUT" ||
    causeCode === "UND_ERR_SOCKET"
  );
}

function buildImageProviderConnectionErrorMessage(provider, endpoint) {
  const label =
    endpoint === "/images/edits"
      ? "参考图编辑接口"
      : endpoint === "/images/generations"
        ? "生图接口"
        : endpoint === "/responses"
          ? "Responses 接口"
          : endpoint === "/chat/completions"
            ? "Chat Completions 接口"
            : `${endpoint} 接口`;
  return `${provider.name} ${label}连接失败，请检查网络、接口地址和密钥配置，或稍后再试。`;
}

function appendImageFailoverSummary(message) {
  const base = String(message || "").trim() || "图片生成失败，请稍后再试。";
  if (base.includes("已尝试切换备用供应商")) return base;
  return `${base} 已尝试切换备用供应商，但当前配置的供应商都未成功响应。`;
}

function providerEnvKey(id) {
  return String(id || "").trim().replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

function isUsableApiKey(apiKey) {
  return Boolean(
    apiKey &&
      apiKey !== "your_openai_api_key_here" &&
      apiKey !== "your_kuaipao_api_key_here" &&
      apiKey !== "your_kuaipao_nano2_api_key_here" &&
      apiKey !== "your_duckcoding_api_key_here"
  );
}

async function saveStyles(styles) {
  const storedStyles = styles.map((style) => ({
    id: String(style?.id || "").trim(),
    title: normalizeStyleTitle(style?.title, normalizeTags(style?.tags).join(" / ") || style?.id),
    tags: normalizeTags(style?.tags),
    subjectType: normalizeStyleSubjectType(style?.subjectType, style),
    drawCardEnabled: normalizeDrawCardEnabled(style?.drawCardEnabled, true),
    drawCardWeight: normalizeDrawCardWeight(style?.drawCardWeight),
    image: String(style?.image || "/style-previews/default/cover.svg").trim() || "/style-previews/default/cover.svg",
    imageUpdatedAt: style?.imageUpdatedAt || null,
    personImage: String(style?.personImage || "").trim(),
    personImageUpdatedAt: style?.personImageUpdatedAt || null,
    personThumbnailImage: String(style?.personThumbnailImage || "").trim(),
    petImage: String(style?.petImage || "").trim(),
    petImageUpdatedAt: style?.petImageUpdatedAt || null,
    petThumbnailImage: String(style?.petThumbnailImage || "").trim(),
    prompt: String(style?.prompt || ""),
    useStyleImageAsReference: Boolean(style?.useStyleImageAsReference)
  }));
  await writeFile(dataPath, `${JSON.stringify(storedStyles, null, 2)}\n`, "utf-8");
  await syncMiniProgram(storedStyles);
}

async function syncMiniProgram(styles) {
  await mkdir(path.dirname(miniDataPath), { recursive: true });
  await mkdir(miniImageRoot, { recursive: true });
  const miniStyles = await Promise.all(
    styles.map(async (style, index) => {
      const miniImage = await ensureMiniImage(style, getStyleGalleryImage(style));
      return {
        id: style.id,
        sort: index,
        title: normalizeStyleTitle(style.title, normalizeTags(style.tags).join(" / ") || style.id),
        tags: normalizeTags(style.tags),
        subjectType: normalizeStyleSubjectType(style.subjectType, style),
        drawCardEnabled: normalizeDrawCardEnabled(style.drawCardEnabled, true),
        drawCardWeight: normalizeDrawCardWeight(style.drawCardWeight),
        image: miniImage,
        prompt: String(style.prompt || ""),
        useStyleImageAsReference: Boolean(style.useStyleImageAsReference)
      };
    })
  );
  const js = `const styles = ${JSON.stringify(miniStyles, null, 2)};\n\nmodule.exports = {\n  styles\n};\n`;
  await writeFile(miniDataPath, js, "utf-8");
}

async function ensureMiniImage(style, image = style.image) {
  const previewPath = getPreviewFilePath(image);
  if (!previewPath) {
    await deleteMiniImage(style.id);
    return "";
  }

  const ext = path.extname(previewPath).toLowerCase();
  const mimeType = mimeForExtension(ext);
  if (!mimeType || !(await fileExists(previewPath))) {
    await deleteMiniImage(style.id);
    return "";
  }

  if (mimeType === "image/svg+xml") {
    const targetPath = path.join(miniImageRoot, `${style.id}.svg`);
    await rm(path.join(miniImageRoot, `${style.id}.jpg`), { force: true });
    if (await shouldUpdateMiniImage(previewPath, targetPath)) {
      await mkdir(miniImageRoot, { recursive: true });
      await copyFile(previewPath, targetPath);
    }
    return `/images-small/${style.id}.svg`;
  }

  const targetPath = path.join(miniImageRoot, `${style.id}.jpg`);
  await rm(path.join(miniImageRoot, `${style.id}.svg`), { force: true });
  if (!(await shouldCompressMiniImage(previewPath, targetPath))) return `/images-small/${style.id}.jpg`;

  await compressMiniImage(style.id, previewPath, mimeType);
  return `/images-small/${style.id}.jpg`;
}

async function getWebGalleryImage(style) {
  const safeId = String(style?.id || "").trim();
  const originalImage = getStyleGalleryImage(style);

  // For universal styles with a distinct person effect image, its generated
  // thumbnail is already the smallest gallery asset. Legacy universal styles
  // without one keep using the existing mini-image cache below.
  if (hasDistinctPersonGalleryImage(style)) {
    return originalImage;
  }

  if (!safeId) {
    return originalImage;
  }

  if (await fileExists(path.join(miniImageRoot, `${safeId}.jpg`))) {
    return `/images-small/${safeId}.jpg`;
  }

  if (await fileExists(path.join(miniImageRoot, `${safeId}.svg`))) {
    return `/images-small/${safeId}.svg`;
  }

  return originalImage;
}

function getStyleGalleryImage(style) {
  const image = hasDistinctPersonGalleryImage(style)
    ? style?.personThumbnailImage || style?.personImage || style?.image
    : style?.image;
  return String(image || "").trim() || "/style-previews/default/cover.svg";
}

function hasDistinctPersonGalleryImage(style) {
  if (normalizeStyleSubjectType(style?.subjectType, style) !== SUBJECT_BOTH) return false;
  const personImage = String(style?.personImage || "").trim();
  const image = String(style?.image || "").trim();
  return Boolean(personImage && personImage !== image);
}

function getStyleVariantImageFields(variant) {
  const fields = {
    person: {
      image: "personImage",
      updatedAt: "personImageUpdatedAt",
      thumbnailImage: "personThumbnailImage",
      filename: "cover-person"
    },
    pet: {
      image: "petImage",
      updatedAt: "petImageUpdatedAt",
      thumbnailImage: "petThumbnailImage",
      filename: "cover-pet"
    }
  };
  return fields[String(variant || "").trim()] || null;
}

async function saveStyleVariantImage(style, variant, bytes, mimeType) {
  const fields = getStyleVariantImageFields(variant);
  if (!fields) throw new Error("UNSUPPORTED_IMAGE_TYPE");

  const ext = extensionForMime(mimeType);
  const styleId = String(style?.id || "").trim();
  if (!styleId || !bytes?.length) throw new Error("UNSUPPORTED_IMAGE_TYPE");

  const dir = path.join(previewRoot, styleId);
  const filename = `${fields.filename}.${ext}`;
  const imageUrl = `/style-previews/${styleId}/${filename}`;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);

  const thumbnail = mimeType === "image/svg+xml"
    ? null
    : await createImageThumbnail({
        buffer: bytes,
        outputRoot: dir,
        outputName: `${fields.filename}-thumbnail`,
        urlPrefix: `/style-previews/${styleId}`,
        maxEdge: RESULT_THUMBNAIL_MAX_EDGE
      });
  const updatedAt = new Date().toISOString();
  style[fields.image] = imageUrl;
  style[fields.updatedAt] = updatedAt;
  style[fields.thumbnailImage] = String(thumbnail?.url || imageUrl);
  return style;
}

async function shouldCompressMiniImage(sourcePath, targetPath) {
  return shouldUpdateMiniImage(sourcePath, targetPath);
}

async function shouldUpdateMiniImage(sourcePath, targetPath) {
  if (!(await fileExists(targetPath))) return true;
  const [sourceInfo, targetInfo] = await Promise.all([stat(sourcePath), stat(targetPath)]);
  return sourceInfo.mtimeMs > targetInfo.mtimeMs;
}

async function compressMiniImage(styleId, sourcePath, mimeType) {
  if (mimeType === "image/svg+xml") return;
  const targetPath = path.join(miniImageRoot, `${styleId}.jpg`);
  await mkdir(miniImageRoot, { recursive: true });
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    miniCompressScript,
    "-Source",
    sourcePath,
    "-Target",
    targetPath
  ]);
}

function getPreviewFilePath(imagePath) {
  const normalized = String(imagePath || "");
  const relative = normalized.replace(/^\/+/, "");

  if (!normalized) return "";
  if (normalized.startsWith("/style-previews/")) return path.join(rootDir, "public", relative);
  if (normalized.startsWith("/images-small/")) return path.join(rootDir, "wechat-miniprogram", "miniprogram", relative);
  return "";
}

async function deleteMiniImage(styleId) {
  await rm(path.join(miniImageRoot, `${styleId}.jpg`), { force: true });
  await rm(path.join(miniImageRoot, `${styleId}.svg`), { force: true });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeTags(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,锛屻€乗n]/);
  return [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))];
}

function normalizeStyleTitle(value, fallback = "") {
  const title = String(value || "").trim().replace(/\s+/g, " ");
  if (title) return title.slice(0, 40);
  return String(fallback || "").trim().replace(/\s+/g, " ").slice(0, 40);
}

function extensionForMime(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
}

function mimeForExtension(ext) {
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "";
}

function loadLocalEnv() {
  if (!existsSync(localEnvPath)) return;

  const lines = readFileSync(localEnvPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
