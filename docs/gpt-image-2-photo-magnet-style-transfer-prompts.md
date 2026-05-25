# GPT Image 2 照片冰箱贴风格转绘提示词手册

本文整理适合照片型亚克力冰箱贴的 `gpt-image-2` 风格转绘提示词。目标不是抠出主体做贴纸，也不是追求照片级复刻，而是把人物、宠物或合影抽成更有艺术距离的纪念画面。

`gpt-image-2` 的图像编辑提示词要同时说明改变项和保留项。这里的目标不是把照片套一层绘画滤镜，而是把照片主动转成更有艺术距离的纪念图：保留主体关系和几个识别锚点，同时允许画法、色彩、空间和局部形体被风格重构。

- 官方提示指南：[GPT Image Generation Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- 图像编辑说明：[Image generation](https://developers.openai.com/api/docs/guides/image-generation)

## 使用框架

### 适合的输入

- 单人人像：纪念照、旅行照、生活抓拍。
- 宠物照片：猫狗单宠、宠物与玩具或环境同框。
- 多人合影：家庭、朋友、情侣或旅行合影。
- 人宠合影：人与宠物的互动关系是转绘重点。

### 通用保留项

把下面这段保留约束拼进风格提示词，能在更抽象的转绘里稳住照片核心：

```text
保留输入照片中的主体数量、主要人物和宠物识别锚点、标志性发型或毛色花纹、互动关系和大致站位。人物脸可以明显抽象化，不必像照片；可以大胆重构色彩、笔触、形体和局部细节，让结果明显成为艺术转绘而不是照片滤镜。不要额外添加人物或宠物，不要把主体换成完全陌生的角色。
```

```text
Preserve the subject count, the main identity anchors for the people and pets, signature hairstyle or coat markings, interactions, and approximate placement. Human faces may become visibly abstract rather than photo-like. Boldly reconstruct color, brushwork, forms, and secondary details so the result reads as an artwork rather than a photo filter. Do not add extra people or pets, and do not replace the subjects with completely unfamiliar characters.
```

### 照片冰箱贴筛选标准

- 背景默认可以被替换成更有艺术风格的环境，不必照搬普通生活背景。
- 如果原图含有地标建筑、明确旅行地点或强纪念物件，则保留这些锚点并做更艺术化的重构。
- 缩小浏览时仍能读到人物或宠物的主要关系，但艺术风格应比照片保真更先被感受到。
- 合影优先检查人数、站位、表情和互动关系是否稳定。
- 宠物优先检查耳眼轮廓、鼻口神态、毛色花纹和标志性配饰。
- 只有当抽象程度让人物或宠物关系完全读不出来时，才算抽象过头。
- 如果结果几乎能与原照片一一对照，通常说明艺术化力度还不够。

### 样图状态

第一版样图按题材分配，而不是让同一张照片跑完所有风格。样图文件将保存在 [`docs/assets/gpt-image-2-photo-magnet-samples/`](./assets/gpt-image-2-photo-magnet-samples/)；用户原始照片只作为生成输入，不入仓库。

| 风格 | 样图题材 | 样图 |
| --- | --- | --- |
| 莫奈印象派光色油画 | 合影 | 待生成 |
| 梵高旋转笔触纪念肖像 | 宠物 | 待生成 |
| 马蒂斯高彩装饰画 | 人宠合影 | 待生成 |
| 大卫霍克尼明亮生活绘画感 | 人物 | 待生成 |
| 诺曼洛克威尔温情叙事插画 | 合影 | 待生成 |
| 阿尔丰斯穆夏新艺术装饰肖像 | 人物 | 待生成 |
| 宫崎骏系温暖动画绘本感 | 人宠合影 | 待生成 |
| 温柔水彩旅行日记 | 合影 | 待生成 |
| 彩铅手绘纪念照 | 人物 | 待生成 |
| 复古胶片海报插画 | 合影 | 待生成 |
| 厚涂宠物肖像油画 | 宠物 | 待生成 |
| 儿童蜡笔绘本手绘 | 宠物 | 待生成 |

## 风格提示词

### 1. 莫奈印象派光色油画

- 标签：`油画`、`印象派`、`光色`、`合影`
- 推荐题材：旅行合影、花园或水边合影、人宠户外照。
- 视觉关键词：柔软短笔触、空气感光影、综合色块、晨雾与水面反光、温柔记忆感。
- 适合冰箱贴：背景风景和人物记忆可以一起被光色统一，适合把一张普通旅行照变得更柔软耐看。
- 样图：待生成，计划使用合影照片。

中文提示词：

```text
把上传照片完整转绘成克劳德·莫奈式印象派光色油画。保留输入照片中的主体数量、人物或宠物身份特征、脸部关键特征或毛色花纹、表情、发型、服装与配饰、姿态、互动关系、主要站位和主要构图。整张照片都要被统一转绘，不要额外添加人物或宠物。

使用柔软的短笔触和湿润油画肌理，把原照片重新组织成空气感很强的综合色块。允许人物脸部、衣服、湖面、树影和天空被光色融化与重排，只保留合影关系和宠物识别点。若原背景没有地标，就把它替换成更有印象派诗意的自然光色背景；若有地标，则只保留地标锚点并绘画化。色彩像旅行记忆一样明亮而含蓄，明显看出印象派绘画重构，而不是原照片的油画滤镜。
```

English prompt:

```text
Restyle the uploaded photo as a Claude Monet inspired Impressionist oil painting built around luminous color and atmosphere. Preserve the subject count, identity cues, key facial features or coat markings, expressions, hairstyles, clothing and accessories, poses, interactions, relative positions, and the main composition from the input photo. Restyle the whole photo coherently and do not add extra people or pets.

Use soft broken brushstrokes, gentle oil-paint texture, diffused light, and layered color notes to reorganize the photo into an airy memory. Allow faces, clothing, water, trees, and sky to dissolve into light and color while retaining the group relationship and pet anchors. If the source background has no meaningful landmark, replace it with a more poetic Impressionist environment; if it has a landmark, keep only the landmark anchor and repaint it boldly. Make the Impressionist reconstruction obvious rather than a painterly photo filter.
```

- 常见失败点：光雾太重，脸和宠物花纹被融掉。
- 修正句：`降低光雾和笔触模糊度，恢复主体五官、宠物毛色花纹和每个人的站位，不要改变原合影关系。`

### 2. 梵高旋转笔触纪念肖像

- 标签：`油画`、`后印象派`、`梵高`、`宠物`
- 推荐题材：单宠物、宠物半身照、人宠近景。
- 视觉关键词：旋转笔触、厚涂纹理、蓝黄对比、情绪化背景、肖像中心感。
- 适合冰箱贴：笔触强、辨识度高，宠物神态会很抓眼。
- 样图：待生成，计划使用宠物照片。

中文提示词：

```text
把上传照片完整转绘成文森特·梵高式后印象派纪念油画。保留原照片里宠物或人物的身份特征、耳眼轮廓、脸部关键特征、毛色花纹、表情、配饰、姿态、场景关系和主要构图，不要把主体换成别的角色。

使用可见的厚涂笔触、旋转流动的背景线条、富有情绪的蓝色与金黄色对比，以及有方向感的短促油画笔触。让原照片场景被强烈笔触重新编排，允许毛发边缘、 stroller 结构和背景植物变成更有韵律的绘画形状，只保留宠物眼睛、耳型、毛色气质和姿态锚点。画面要像一张有艺术收藏感的宠物纪念画，而不是精确临摹照片。
```

English prompt:

```text
Transform the uploaded photo into a Vincent van Gogh inspired Post-Impressionist keepsake painting. Preserve the original subject identity, ear and eye silhouette for pets, key facial features, coat markings, expression, accessories, pose, scene relationship, and main composition. Do not replace the subject with a different character.

Use visible impasto, rhythmic directional brushstrokes, swirling background movement, and expressive contrasts of deep blue and warm gold. The style must enhance the source photo rather than overpower it: the subject's expression should read first, followed by the energetic paint texture. Keep the background connected to the original scene while translating it into painterly motion. Make the result feel like a collectible photo-magnet artwork.
```

- 常见失败点：背景旋涡抢走宠物神态。
- 修正句：`把旋转笔触集中在背景与次要区域，恢复主体眼神、鼻口轮廓和原始毛色分布。`

### 3. 马蒂斯高彩装饰画

- 标签：`装饰画`、`马蒂斯`、`高彩`、`人宠合影`
- 推荐题材：人宠同框、穿搭鲜明的人像、室内生活照。
- 视觉关键词：平面色块、剪纸般轮廓、装饰性图案、饱满红蓝绿、轻快生活气。
- 适合冰箱贴：图形强、颜色醒目，适合小尺寸陈列。
- 样图：待生成，计划使用人宠合影。

中文提示词：

```text
把上传照片完整转绘成亨利·马蒂斯式高彩装饰绘画。保留照片中人物与宠物的数量、身份特征、脸部与毛色关键点、表情、服装、姿态、互动动作、相对位置和主要构图，不要把人宠关系改掉。

把场景概括成大胆的平面色块、流畅轮廓和富有节奏的装饰图案。色彩明亮但有秩序，使用饱满的红、蓝、绿、黄与深色线条关系，让原照片的生活场景看起来更轻快、更收藏化。人物和宠物不能退化成无脸符号；保留足够的原照辨识度。背景可以装饰化，但应沿用原照片空间记忆。整体像一张明亮而有设计感的照片冰箱贴艺术转绘。
```

English prompt:

```text
Restyle the uploaded photo as a Henri Matisse inspired high-color decorative painting. Preserve the people and pets in the photo, their identity cues, key facial features and coat markings, expressions, clothing, poses, interaction, relative placement, and main composition.

Translate the scene into bold flat color shapes, flowing contours, and rhythmic decorative patterning. Use joyful saturated color relationships with a clear graphic hierarchy so the original memory becomes brighter, more stylized, and more abstract. Faces and pets may be simplified into expressive graphic forms as long as the people-pet relationship and key anchors remain readable. Let the background become decorative color structure rather than a literal copy. The result should read as a vivid printed photo magnet artwork.
```

- 常见失败点：平面化后人物像陌生海报人物。
- 修正句：`保留原照片中人物脸型、发型、宠物花纹和互动动作，把装饰图案减少到不遮挡主体。`

### 4. 大卫霍克尼明亮生活绘画感

- 标签：`生活绘画`、`霍克尼`、`人物`、`明亮`
- 推荐题材：人物日常照、室内窗边照、泳池或旅行生活照。
- 视觉关键词：明亮平涂、清晰空间、生活抓拍感、轻透阴影、现代色彩。
- 适合冰箱贴：既保留照片生活感，又有明确绘画气质。
- 样图：待生成，计划使用人物照片。

中文提示词：

```text
把上传人物照片完整转绘成大卫·霍克尼式明亮生活绘画。保留人物身份特征、脸型、五官关系、表情、发型、服装与配饰、姿态、环境信息和主要构图，不要把人物换成陌生模特。

使用清澈明亮的现代色彩、平整但不僵硬的绘画色面、清楚的几何空间关系和轻快生活气息。保留人物的主要锚点；普通背景可以直接换成更霍克尼式的明亮房间、窗景、泳池边或现代色面空间，旅行地标则保留后再图形化。肤色与面部可以绘画化简化，不要追求照片级五官复刻。整体像一张阳光、聪明、耐看的个人纪念绘画冰箱贴。
```

English prompt:

```text
Transform the uploaded portrait photo into a David Hockney inspired bright everyday painting. Preserve the person's identity cues, face shape, facial relationships, expression, hairstyle, clothing and accessories, pose, environmental information, and main composition. Do not replace the person with an unfamiliar model.

Use clear modern color, relaxed painted planes, legible space, crisp daylight, and an observant everyday mood. Restyle the whole photo so the setting remains part of the memory without becoming a decorative poster. Simplify skin and shadows gently while keeping the person recognizable and alive. The result should feel like a sunlit personal keepsake for a photo fridge magnet.
```

- 常见失败点：风格太像普通数码插画。
- 修正句：`增强手绘色面与观察式生活绘画感，保留原照片空间，不要做成光滑矢量插画。`

### 5. 诺曼洛克威尔温情叙事插画

- 标签：`叙事插画`、`洛克威尔`、`温情`、`合影`
- 推荐题材：家庭合影、朋友互动照、节日或旅行瞬间。
- 视觉关键词：叙事动作、温暖写实插画、表情交流、复古杂志封面质感。
- 适合冰箱贴：能把合影做成温情故事瞬间。
- 样图：待生成，计划使用合影照片。

中文提示词：

```text
把上传合影完整转绘成诺曼·洛克威尔式温情叙事插画。严格保留合影中的人数、人物身份特征、年龄感、表情、发型、服装、动作、互动关系、站位和主要构图，不要添加额外人物，不要改变原照片里的关系。

使用温暖的复古杂志插画光线和更有叙事感的绘画重构。让原照片中的人物关系和小动作成为故事核心，普通背景可以改成更有插画叙事性的环境；若背景里有地标或节日物件，则保留这些纪念锚点并重新绘制。画面应亲切、有纪念意义、有轻微复古感，但不要退回照片写实滤镜。
```

English prompt:

```text
Restyle the uploaded group photo as a Norman Rockwell inspired warm narrative illustration. Strictly preserve the number of people, their identity cues, age impression, expressions, hairstyles, clothing, gestures, interactions, relative positions, and the main composition. Do not add extra people and do not alter the relationships in the source photo.

Use warm painterly realism, observant facial storytelling, and a subtle vintage magazine illustration quality. Let the original gestures and affection carry the scene while the background remains part of the real memory and is painted coherently. Keep the feeling intimate and commemorative rather than overly theatrical. The final image should feel like a family keepsake made for an acrylic photo magnet.
```

- 常见失败点：合影被改造成摆拍故事画。
- 修正句：`恢复原照片动作、站位和表情，不要重排人物，不要新增叙事道具。`

### 6. 阿尔丰斯穆夏新艺术装饰肖像

- 标签：`新艺术`、`穆夏`、`人物`、`装饰肖像`
- 推荐题材：单人人像、情侣近景、人宠肖像。
- 视觉关键词：优雅线条、花卉装饰、金色曲线、海报边饰、柔和肖像中心。
- 适合冰箱贴：装饰性强，适合人物纪念照有礼物感。
- 样图：待生成，计划使用人物照片。

中文提示词：

```text
把上传照片完整转绘成阿尔丰斯·穆夏式新艺术装饰肖像。保留人物身份特征、脸部比例关系、表情、发型、服装与配饰、姿态、同框宠物或伴侣关系以及主要构图，不要把人物理想化成陌生脸。

使用优雅的曲线轮廓、精致花卉与植物装饰、温和金色调、柔软肤色和新艺术海报般的层次。可以把原场景大幅提炼成装饰性背景与图案框架，只保留人物姿态、发型、服饰和情绪气质等主要锚点。装饰边饰和图案要托住主体，不要把主体完全淹没。最终效果像一张有礼物感的照片型艺术冰箱贴。
```

English prompt:

```text
Transform the uploaded photo into an Alphonse Mucha inspired Art Nouveau decorative portrait. Preserve the subject identity, facial proportions, expression, hairstyle, clothing and accessories, pose, companion or pet relationship, and the main composition. Do not idealize the person into an unfamiliar face.

Use elegant flowing contours, botanical ornament, warm gold accents, gentle skin tones, and layered Art Nouveau poster craft. The background may become more decorative while still carrying the memory of the original photo. Let ornament frame and support the subject without covering facial features or pet expressions. Make the result feel like a gift-worthy printed photo magnet.
```

- 常见失败点：装饰花纹盖住脸和服饰。
- 修正句：`减少主体前景装饰，把花卉和金色曲线移到背景与边缘，恢复原人物五官。`

### 7. 宫崎骏系温暖动画绘本感

- 标签：`动画绘本`、`宫崎骏`、`温暖`、`人宠合影`
- 推荐题材：人宠合影、旅行抓拍、带风景的温暖日常。
- 视觉关键词：手绘动画背景、柔和自然光、生活细节、清澈空气、温暖冒险感。
- 适合冰箱贴：亲切、好传播，人物和环境都容易成为回忆画面。
- 样图：待生成，计划使用人宠合影。

中文提示词：

```text
把上传照片完整转绘成宫崎骏系温暖手绘动画绘本感画面。保留原照片里人物和宠物的数量、身份特征、脸部与毛色关键点、表情、发型、服装、姿态、互动关系、站位和主要构图，不要新增角色，不要把真实人物换成陌生动画角色。

使用柔和自然光、手绘动画背景、清澈空气感、温暖但不腻的色彩和细致生活观察。普通背景可以换成更有动画绘本气息的自然环境、街角或室内场景；地标建筑则保留轮廓锚点并手绘化。人物可以更动画化和概括化，只保留关系、发型、服饰气质和宠物特征。整体适合做一张温暖的照片冰箱贴纪念图。
```

English prompt:

```text
Restyle the uploaded photo into a warm Hayao Miyazaki inspired hand-drawn animation storybook image. Preserve the people and pets in the source photo, their identity cues, key facial features and coat markings, expressions, hairstyles, clothing, poses, interactions, relative positions, and main composition. Do not add characters or replace real subjects with unfamiliar animated characters.

Use gentle natural light, hand-painted animation background craft, clear air, warm restrained color, and attentive everyday detail. Translate the existing environment as part of the memory instead of inventing a different fantasy scene. Keep the people and pets recognizable, affectionate, and readable at small size. The result should feel like a cozy printed photo magnet keepsake.
```

- 常见失败点：变成泛动漫角色，照片辨识度下降。
- 修正句：`保留原照片人物脸型、发型、服饰和宠物花纹，只转绘画法与光色，不替换角色设计。`

### 8. 温柔水彩旅行日记

- 标签：`水彩`、`旅行日记`、`合影`、`轻盈`
- 推荐题材：风景合影、城市散步、咖啡店或旅行留影。
- 视觉关键词：纸张水痕、透明叠色、轻线稿、温柔边缘、旅行笔记感。
- 适合冰箱贴：温和、干净，照片场景保留度高。
- 样图：待生成，计划使用合影照片。

中文提示词：

```text
把上传照片完整转绘成温柔水彩旅行日记插画。保留主体数量、人物或宠物的身份特征、表情、发型、服装、毛色花纹、姿态、互动关系、场景位置和主要构图。不要删除背景，不要额外添加人物、宠物或文字。

使用轻薄水彩叠色、可见纸张吸水边缘、少量松弛线稿和柔和的旅行速写气质。普通背景可以直接换成更有水彩旅行手记感的留白、色晕、街景或风景；如果原图有地标，则保留地标轮廓锚点。只保留人物关系、重要姿态和主要纪念信息。整体温柔、轻盈、有纪念册感，明显是水彩旅行手记而不是水彩滤镜。
```

English prompt:

```text
Transform the uploaded photo into a gentle watercolor travel-journal illustration. Preserve the subject count, identity cues, expressions, hairstyles, clothing, pet coat markings, poses, interactions, scene placement, and main composition. Do not remove the setting and do not add extra people, pets, or text.

Use transparent watercolor layering, softly absorbed paper edges, a restrained loose line drawing, and the feeling of a travel sketchbook memory. Watercolor the environment along with the subjects so the place remains meaningful. Faces, pet expressions, and group relationships should remain clearer than the paper texture. The result should feel light, intimate, and printable as a photo magnet.
```

- 常见失败点：水彩太淡，合影主体变小。
- 修正句：`提高主体局部对比度和轮廓清晰度，保持原构图比例，不要把人物缩到风景里。`

### 9. 彩铅手绘纪念照

- 标签：`彩铅`、`手绘`、`人物`、`纪念照`
- 推荐题材：人物近景、情侣照、宠物与主人近景。
- 视觉关键词：细腻排线、温暖纸感、低噪点、真实亲近、轻微手绘轮廓。
- 适合冰箱贴：保真度高，适合想要“像照片又像画”的用户。
- 样图：待生成，计划使用人物照片。

中文提示词：

```text
把上传照片完整转绘成温暖细腻的彩铅手绘纪念照。保留原照片人物或宠物的身份特征、五官关系或毛色花纹、表情、发型、服装和配饰、姿态、同框关系、环境信息和主要构图。

使用可见但克制的彩铅排线、柔软纸张纹理、层层叠加的颜色和自然的手绘轮廓。人物面部可以比照片更概括，只保留年龄感、发型、表情气质和姿态。普通背景可以简化或替换成更适合彩铅纪念画的纸面空间；地标背景则保留锚点。整体像一张被认真画下来的纪念画，适合做亚克力冰箱贴。
```

English prompt:

```text
Restyle the uploaded photo as a warm colored-pencil keepsake drawing. Preserve identity cues, facial relationships or pet coat markings, expressions, hairstyles, clothing and accessories, poses, companion relationships, environmental information, and the main composition.

Use restrained visible pencil strokes, soft paper texture, layered color buildup, and natural hand-drawn contours. Do not beautify faces into unfamiliar portraits and do not turn the image into a hard-edged digital illustration. Keep the original setting memory while simplifying it gently so the subjects remain warm and clear. The result should feel like a carefully drawn photo souvenir for an acrylic fridge magnet.
```

- 常见失败点：保真到像滤镜，缺少彩铅质感。
- 修正句：`增加纸张纹理和彩铅排线，保持原主体辨识度，不要变成照片锐化滤镜。`

### 10. 复古胶片海报插画

- 标签：`复古`、`海报`、`胶片`、`合影`
- 推荐题材：旅行合影、城市夜景照、穿搭明显的朋友照。
- 视觉关键词：复古印刷颗粒、胶片暖色、海报概括、怀旧标题留白感、纪念品气质。
- 适合冰箱贴：很像旅行纪念品，画面存在感强。
- 样图：待生成，计划使用合影照片。

中文提示词：

```text
把上传照片完整转绘成复古胶片海报插画风格的照片纪念图。保留照片中的主体数量、身份特征、表情、发型、服饰、宠物花纹、互动关系、站位、环境记忆和主要构图，不要重新排布合影。

使用复古胶片暖色、柔和颗粒、印刷海报般的颜色概括和手绘插画边缘。普通背景直接换成更强的复古海报空间；如果原照片含地标，则保留地标轮廓并海报化。把人物或宠物提炼成更大胆的纪念图形，只保留关系和主要识别锚点。不要自动加入乱码文字、日期、Logo 或宣传标语。让画面像一张从旅行回忆里重新设计出来的艺术照片冰箱贴。
```

English prompt:

```text
Transform the uploaded photo into a retro film-poster inspired illustrated keepsake. Preserve the number of subjects, identity cues, expressions, hairstyles, outfits, pet markings, interactions, relative positions, environmental memory, and the main composition. Do not rearrange a group photo.

Use warm film color, soft grain, poster-like color simplification, and hand-painted illustrated edges. The scene should still come from the source photo, with nostalgia created through color, texture, and graphic clarity rather than invented copy. Do not add gibberish text, dates, logos, or slogans. Make the result feel like a travel-memory acrylic photo magnet.
```

- 常见失败点：海报化后自动加字或改场景。
- 修正句：`不要添加任何文字和标志，恢复原照片场景和人物站位，只保留复古胶片与海报插画质感。`

### 11. 厚涂宠物肖像油画

- 标签：`厚涂`、`宠物`、`油画`、`肖像`
- 推荐题材：猫狗近景、宠物坐姿照、宠物与熟悉环境同框。
- 视觉关键词：厚实笔触、毛发体积、温暖深色、肖像凝视、收藏画感。
- 适合冰箱贴：宠物神态集中，适合做纪念收藏。
- 样图：待生成，计划使用宠物照片。

中文提示词：

```text
把上传宠物照片完整转绘成厚涂油画宠物肖像纪念图。保留宠物的品种感、头脸比例、耳朵轮廓、眼神、鼻口形状、毛色花纹、项圈或配饰、姿态和原照片里的环境关系，不要把宠物换成另一只猫或狗。

使用厚实有方向的油画笔触塑造毛发体积和眼神光泽，让宠物成为视觉中心，同时保留原照片场景的纪念信息。色彩温暖、有收藏画感，背景可以更柔和地油画化，但不能变成陌生宫廷布景。最终画面要像主人会愿意做成照片冰箱贴的宠物纪念画。
```

English prompt:

```text
Transform the uploaded pet photo into a richly painted impasto pet portrait keepsake. Preserve breed cues, head and face proportions, ear silhouette, gaze, nose and mouth shape, coat colors and markings, collar or accessories, pose, and the pet's relationship to the original setting. Do not replace the pet with a different cat or dog.

Use thick directional oil-paint brushwork to build fur volume and expressive eyes. Keep the pet as the visual center while preserving meaningful environmental memory from the source photo. Use warm collectible portrait color and a softer painterly background, but do not invent an unrelated formal backdrop. The final image should feel worthy of a printed pet photo magnet.
```

- 常见失败点：毛发太写意，花纹和耳型变了。
- 修正句：`恢复原宠物耳型、眼睛形状、鼻口轮廓和毛色花纹，厚涂只改变绘画质感。`

### 12. 儿童蜡笔绘本手绘

- 标签：`蜡笔`、`绘本`、`童趣`、`宠物`
- 推荐题材：宠物趣味照、亲子或人宠轻松照片。
- 视觉关键词：蜡笔纹理、稚拙色块、松弛轮廓、白纸颗粒、温暖幽默。
- 适合冰箱贴：轻松可爱，适合日常照片做趣味收藏。
- 样图：待生成，计划使用宠物照片。

中文提示词：

```text
把上传照片完整转绘成儿童蜡笔绘本手绘风格。保留原照片里人物或宠物的数量、身份辨识点、宠物毛色花纹、表情、姿态、互动关系、主要环境和主要构图，不要随意删掉同框对象。

使用真实蜡笔摩擦纹理、略稚拙但有爱意的轮廓、明亮友好的色块和温暖绘本气质。画法可以简化，不能把主体画得认不出来；背景也可以蜡笔化，保留照片里有记忆点的物体和空间。整体要童趣、轻松、像被认真收藏的一页绘本照片，而不是故意画丑的表情包。
```

English prompt:

```text
Restyle the uploaded photo as a children's crayon storybook drawing. Preserve the people or pets in the source photo, their recognizable identity cues, pet coat markings, expressions, poses, interactions, meaningful environment, and main composition. Do not casually remove companions from the frame.

Use real crayon friction texture, slightly naive but affectionate contours, bright friendly color blocks, and a warm storybook mood. The drawing may simplify details but must keep the subjects recognizable. Crayon-render the background too while retaining memorable objects and space from the original photo. Make it playful and collectible, not an intentionally ugly meme doodle.
```

- 常见失败点：稚拙过头，变成潦草涂鸦。
- 修正句：`保留蜡笔纹理和童趣，但提高主体轮廓、表情和宠物花纹清晰度，不要故意画丑。`

## 样图生成记录模板

每张最终样图生成后，在对应风格条目补齐样图并按下面格式记录：

```md
- 样图：![风格名样图](./assets/gpt-image-2-photo-magnet-samples/<filename>.png)
- 样图题材：人物 / 宠物 / 合影 / 人宠合影
- 最终提示词：使用本条中文提示词；如有修正，追加 `<修正句>`
- 验收备注：主体辨识度、关系稳定性、背景转绘效果、冰箱贴适配判断
```

## 入库备注

这份手册先做研究与样图验证，不直接写入现有风格板数据。后续入库时优先选择样图表现稳定、提示词不依赖复杂修正的条目，并把标签拆成媒介、气质和题材三类。
