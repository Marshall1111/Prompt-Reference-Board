const experiencePage = require("../../utils/experience-page");

Page(experiencePage.createExperiencePage({
  experienceType: "draw-card",
  themeClass: "theme-draw",
  title: "AI小画家",
  subtitle: "上传照片，一键制作AI小画冰箱贴",
  startButtonText: "我要抽卡",
  clipTitle: "卡夹",
  clipEmptyText: "挑中想保留的结果后，它会被收进这里。",
  clipItemFallback: "卡片",
  pocketAddLabel: "加入卡夹",
  pocketAddedLabel: "已在卡夹",
  pocketRemoveLabel: "移出卡夹",
  contactFallback: "如需更多生图机会，请联系客服填写邀请码。",
  otherPageLabel: "",
  showOtherEntry: false
}));
