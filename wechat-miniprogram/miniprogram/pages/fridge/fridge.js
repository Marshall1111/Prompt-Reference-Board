const experiencePage = require("../../utils/experience-page");

Page(experiencePage.createExperiencePage({
  experienceType: "fridge-magnet",
  themeClass: "theme-fridge",
  titleKicker: "Fridge magnet studio",
  title: "冰箱贴工作室",
  subtitle: "上传一张照片，系统会生成一组冰箱贴效果。挑中喜欢的款式放入口袋后即可提交订单。",
  startButtonText: "开始制作",
  clipTitle: "口袋",
  clipEmptyText: "挑中想保留的冰箱贴后，它会被收进口袋。",
  clipItemFallback: "冰箱贴",
  pocketAddLabel: "加入口袋",
  pocketAddedLabel: "已入口袋",
  pocketRemoveLabel: "移出口袋",
  contactFallback: "如需更多制作次数，请联系客服填写邀请码。",
  otherPageLabel: "AI小画家"
}));
