# 三维资产作品台

namgnal 的游戏道具、载具、环境资产与技术检查案例。

- 交互浏览：模型旋转、材质、三角形线框、法线和 UV 棋盘。
- 制作案例：回收与撤离资产、战后整备道具、海岸环境及 LOD。
- 技术案例：局部法线修订、图像贴图链路、肘部权重与动作、结构化标注复核。
- 文件交付：个人 Blender 源工程、GLB、PDF 和检查记录。

## 本地查看

在当前目录运行 `python -m http.server 8767 --bind 127.0.0.1`，然后打开 `http://127.0.0.1:8767/`。直接打开 HTML 不能加载模型文件。

无需安装前端依赖，Three.js 已保存在 `vendor/three`，保持其原许可。

## 直达链接

- `index.html?asset=rescue_supply_crate#workbench`：回收箱及开合动画。
- `index.html?asset=elbow_corrected#workbench`：修订后的肘部样例。
- `review.html#inspection`：法线与贴图检查。
- `review.html#deformation`：关节权重与屈曲对照。
- `review.html#annotation`：结构化标注与复核记录。

## 内容范围

10 件独立游戏资产、2 个 LOD 版本、场景工程，以及独立关节技术样例与壁板检查演示。LOD、组合场景和问题对照版本单独标识。

个人新作提供源工程；团队游戏以项目介绍、公开试玩入口和检查截图呈现。原团队角色、着陆舱等模型源文件不在仓库内。

## 许可

网页源代码（HTML、CSS、JavaScript）采用 `LICENSE-code.txt` 中的 MIT 许可。模型、贴图、渲染图、PDF 与案例记录保留作者权利，供作品评审、技术查看和学习；其他使用请另行取得许可。第三方库沿用各自许可。
