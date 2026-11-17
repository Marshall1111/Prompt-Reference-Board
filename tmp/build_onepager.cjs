const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, LevelFormat
} = require("docx");

const FONT = { ascii: "Arial", hAnsi: "Arial", eastAsia: "Microsoft YaHei" };
const DARK = "1F2937";
const MUTED = "6B7280";
const ACCENT = "B45309";
const LIGHT = "FFF7ED";
const LINE = "E5E7EB";

const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

const p = (text, opts = {}) =>
  new Paragraph({
    spacing: { before: opts.before ?? 0, after: opts.after ?? 28, line: 235 },
    alignment: opts.align ?? AlignmentType.LEFT,
    children: [new TextRun({ text, bold: !!opts.bold, color: opts.color ?? DARK, size: opts.size ?? 18, font: FONT })]
  });

const bullet = (text) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 0, after: 14, line: 215 },
    indent: { left: 440, hanging: 180 },
    children: [new TextRun({ text, size: 18, color: DARK, font: FONT })]
  });

const sectionTitle = (text) =>
  new Paragraph({
    spacing: { before: 85, after: 25, line: 225 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "FDE68A", space: 2 } },
    children: [new TextRun({ text, bold: true, size: 21, color: ACCENT, font: FONT })]
  });

const labelCell = (text) =>
  new TableCell({
    borders: { top: border, bottom: border, left: border, right: border },
    width: { size: 1900, type: WidthType.DXA },
    shading: { fill: LIGHT, type: ShadingType.CLEAR },
    margins: { top: 45, bottom: 45, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [p(text, { bold: true, size: 18, after: 0 })]
  });

const valueCell = (text) =>
  new TableCell({
    borders: { top: border, bottom: border, left: border, right: border },
    width: { size: 8106, type: WidthType.DXA },
    margins: { top: 45, bottom: 45, left: 140, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [p(text, { size: 18, after: 0 })]
  });

const headerCell = new TableCell({
  borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  width: { size: 10006, type: WidthType.DXA },
  shading: { fill: DARK, type: ShadingType.CLEAR },
  margins: { top: 140, bottom: 140, left: 260, right: 260 },
  children: [
    new Paragraph({
      spacing: { after: 30, line: 240 },
      children: [new TextRun({ text: "AI 小画家 × 宠物店  合作方案", bold: true, size: 30, color: "FFFFFF", font: FONT })]
    }),
    new Paragraph({
      spacing: { after: 0, line: 240 },
      children: [new TextRun({ text: "先试运营，零投入验证效果；正式合作按需自购设备，投入透明", size: 18, color: "E5E7EB", font: FONT })]
    })
  ]
});

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 18 } } } },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "·", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 440, hanging: 180 } } } }]
    }]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 680, bottom: 460, left: 1000, right: 900 }
      }
    },
    children: [
      new Table({
        width: { size: 10006, type: WidthType.DXA },
        columnWidths: [10006],
        rows: [new TableRow({ cantSplit: true, children: [headerCell] })]
      }),

      sectionTitle("这是什么"),
      p("一台放在门店里的 AI 拍照打印设备。顾客扫码上传一张毛孩子的照片，约 1 分钟生成卡通、油画、国潮等风格画作，满意后付款打印；店员协助裁切装框约 1 分钟，全程约 2 分钟即可取走成品。"),

      sectionTitle("顾客怎么玩"),
      p("扫码 → 上传或现场拍宠物照片 → 挑一种风格 → 支付并打印 → 店员裁切装框，全程约 2 分钟拿到成品。"),

      sectionTitle("门店能得到什么"),
      bullet("试运营零投入：设备、耗材、系统全部由平台提供，不押金、不买机器。"),
      bullet("多一笔收入：试运营固定收益 8 元/张；正式合作后扣除服务费与耗材，单张收益约 18 元。"),
      bullet("持续邀请奖励：顾客到店扫码即与门店绑定，之后在家远程定制仍算该门店邀请，继续发放奖励。"),
      bullet("自带广告位：小画背面可印门店广告或优惠，顾客带回家就是流动宣传；晒图还带门店定位。"),
      bullet("多一个停留理由：洗护、看诊、等位的时间，变成顾客愿意消费的时间。"),
      bullet("轻人力：店员引导扫码并在出片后裁切装框，约 1 分钟即可完成。"),

      sectionTitle("门店只需要提供"),
      bullet("0.5㎡ 平整桌面和一个电源插座。"),
      bullet("门店需具备可用的 WiFi，设备联网后才能接单打印。"),
      bullet("一名店员配合引导、裁切装框，我们负责培训并留下一句话话术。"),
      bullet("允许在桌面摆放一张桌牌或易拉宝。"),

      sectionTitle("合作方式与投入"),
      new Table({
        width: { size: 10006, type: WidthType.DXA },
        columnWidths: [1900, 8106],
        rows: [
          new TableRow({ cantSplit: true, children: [labelCell("试运营"), valueCell("免押金、免购机：自动打印盒与打印机由平台提供试用，耗材由平台供应。")] }),
          new TableRow({ cantSplit: true, children: [labelCell("正式合作"), valueCell("打印机为通品，全新约 800 元、二手平台约 700 元；相纸等耗材按需自购；自动打印盒押金 150 元，随时可退。")] }),
          new TableRow({ cantSplit: true, children: [labelCell("配件（可选）"), valueCell("相框等配件可按需向平台购买；购买配件免费赠送门店定制贴纸。")] }),
          new TableRow({ cantSplit: true, children: [labelCell("结算"), valueCell("试运营期间商户固定收益 8 元/张；正式合作后平台仅收取服务费 3 元/张，扣除耗材成本后商户收益约 18 元/张，后台可随时核对。")] }),
          new TableRow({ cantSplit: true, children: [labelCell("数据"), valueCell("门店工作台实时查看打印任务、张数与收益，账目透明，不用手工记账。")] }),
          new TableRow({ cantSplit: true, children: [labelCell("退出"), valueCell("试运营不满意可随时撤机、退还设备，无违约金、不扣押金。")] })
        ]
      }),

      sectionTitle("我们怎么保障"),
      bullet("免费上门安装、调试和店员培训（含裁切装框），设备问题远程处理或上门。"),
      bullet("打印失败、设备离线、耗材不足自动告警，平台先于门店发现问题。"),
      bullet("耗材与配件明码标价、不强制搭售；顾客原图不出平台，门店只接收打印任务。"),

      sectionTitle("店主常问"),
      bullet("试运营要花钱吗？不押金、不买设备，设备和耗材都由平台提供。"),
      bullet("正式合作投多少？打印机全新约 800 元、二手约 700 元，相纸耗材按需买；打印盒押金 150 元可退。"),
      bullet("一单能赚多少？试运营固定 8 元/张；正式合作平台只收 3 元/张服务费，扣耗材后约 18 元/张。"),
      bullet("邀请奖励怎么算？顾客扫码即绑定门店，之后在家定制仍计入该门店。"),

      sectionTitle("四步上线"),
      p("① 现场演示 10 分钟，看一张真实出片  ② 免押金试放 7 天，不承诺销量  ③ 店员培训（含裁切装框）+ 物料上桌  ④ 数据复盘，确定正式合作并选配设备"),

      new Paragraph({
        spacing: { before: 85, after: 0, line: 225 },
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 6 } },
        children: [new TextRun({ text: "联系人：____________    电话/微信：____________    扫码体验：____________", size: 18, color: MUTED, font: FONT })]
      })
    ]
  }]
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("一页纸合作方案-宠物店.docx", buffer);
  console.log("saved");
});
