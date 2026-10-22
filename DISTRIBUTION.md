# 分发手册 · dsh-zoom-viewer

本文件给两个人看：**想装的人**（第一节）和**想发布的人**（第二、三节）。

## 一、别人怎么装

### CLI（README 里必须出现的形式，dsh-plugin.org 也按这个形式审查）

```
dsh plugin --profile web add dsh-zoom-viewer                                  # 桌面端把 web 换成 desktop
npx -p @deepseek-ai/dsh dsh plugin --profile web add dsh-zoom-viewer          # 本机没有 dsh 时
npx -p @deepseek-ai/dsh dsh plugin --profile web add github:1378616343/dsh-zoom-viewer   # 从仓库装
```

### 宿主 UI

侧边栏「插件」页 → 右上箭头菜单 →「安装第三方插件」。同一个对话框接受三种地址：

| 方式 | 填什么 | 备注 |
|---|---|---|
| npm | `dsh-zoom-viewer` | 装的是精确版本 `dsh-zoom-viewer@0.1.0` |
| Git | `https://github.com/1378616343/dsh-zoom-viewer` | 宿主会固定到具体 commit，可复现 |
| 本地目录 | 含 `package.json` 的文件夹 | 也可用 `pnpm pack` 产出的 tarball 解包后的目录 |

**装完必须重启 DSH 桌面端**：插件树只在启动时读取（`dsh/node_modules/@deepseek-ai/dsh-app-boot/README.md` 的
“newly installed bundles only activate after a restart”）。本包不带 `engines.dsh`、不带 `@deepseek-ai/dsh*` peer 依赖，
因此宿主不会因兼容性拒绝它，安装期间也不会执行任何安装脚本（`lib/` 已是预构建产物）。

### 从「市场」装（Discover 标签页）

「插件市场」= 插件页的 **Discover** 标签，它由可选 bundle `@deepseek-ai/dsh-experimental-plugin-market-bundle` 提供，
官方 profile 默认关闭、且默认没有索引源。要看到条目，先在插件页添加**索引源**（http/https，不许带凭据或 fragment）：

```
https://raw.githubusercontent.com/1378616343/dsh-zoom-viewer/main/market/index.json
```

注意：**dsh-plugin.org 这个社区站不读上面的索引文件**，它扫 GitHub 仓库（见第三节）。

## 二、发布清单（维护者）

运行时用 DSH 自带的 node / pnpm：

```
NODE=<DSH_NODE>
PNPM=<DSH_PNPM>
```

1. **建公开仓库**（建议名 `dsh-zoom-viewer`），把本目录作为仓库根推上去（`package.json` 必须在根目录），
   然后给仓库加上 GitHub topic **`dsh-plugin`**：

   ```
   gh repo edit 1378616343/dsh-zoom-viewer --add-topic dsh-plugin
   ```

   `package.json` 里的 `repository` / `homepage` / `bugs` 已经写成真地址，无需再改。

2. **核对打包内容**（应只含 `lib/`、`cordis.patch.yml`、`locale/`、`icon.svg`、`README.md`、`LICENSE`、`package.json`）：

   ```
   "<NODE>" "<PNPM>" pack
   ```

3. **发布到 npm 公共仓**（需要你自己的账号，`npm login` 或 `pnpm login` 之后）：

   ```
   "<NODE>" "<PNPM>" publish --access public
   ```

4. **生成索引**（这一步会读 npm 注册表，把 0.1.0 的**真实发布时间**写进 `publishTimestamp`，并用宿主自己的
   校验器验证）：

   ```
   "<NODE>" tool\build-market-index.mjs --repo https://github.com/1378616343/dsh-zoom-viewer
   ```

5. **推送 `market/index.json`**，然后把第 4 步打印出的 raw 地址加进插件页的索引源（只有走 Discover 才需要）。

每次发新版本，重复 3 → 4 → 5（生成器会自动换成新版本号与新的发布时间）。

## 三、上架 dsh-plugin.org（社区插件市场）

收录靠**自动扫描**，不是靠提交索引。硬要求（抄自 https://dsh-plugin.org/zh/submit ）：

- 公开 GitHub 仓库，且仓库 Topics 里有 **`dsh-plugin`**；
- README 里要有安装命令，形如 `dsh plugin --profile web add <包名>`（本仓库已写）；
- 仓库根目录有 `package.json`，写明包名与版本（本站据此核对 npm 上的同名包）；
- 插件导出 `apply(ctx)`（本仓库 `lib/client.js` 与 `lib/index.js` 都有）；
- 声明开源许可证（MIT 已就位）。

**想出现在 DSH 内的「插件中心」就必须发 NPM 包**（插件中心只展示能一键 `dsh plugin add` 的插件）；
只放仓库也会被收录，但只能用 `github:` 源码方式安装。

三步：

1. 推送仓库 + 加 topic（第二节第 1 步）；
2. `pnpm publish --access public`（第二节第 3 步）；
3. 打开 https://dsh-plugin.org/zh/submit 填仓库地址（爬虫也会自动扫 topic，提交只是加速）。

提交表单要填的信任信号：一句话价值 / 可复制安装命令 / 截图（`docs/screenshot.png`）/ 权限与兼容性 /
许可证 / 能力分类 —— 11 类里选「界面体验 / UI & Experience」。

## 四、独立复核索引

```
"<NODE>" tool\build-market-index.mjs --verify market\index.json --index-url https://raw.githubusercontent.com/1378616343/dsh-zoom-viewer/main/market/index.json
```

校验器默认取本机从 `app.asar` 抽出的官方实现 `_smoke/asar/market-index/lib/index.js`，可用 `--validator <path>` 换别的副本；
它自身 `import "semver"`，本机已在 `_smoke/node_modules/semver` 处接好可解析副本（详见 `NOTES.md`）。

## 五、format 1 的硬约束（来自宿主实现 `parseMarketIndex`）

- `format` 必须是 `1`；`title` 必须有 `en` 键（`localizedText` 会强制）；`plugins[].name` 必须是合法 npm 包名。
- `plugins[].versions` 非空、同版号不许重复；`version` 必须是精确 SemVer。
- `publishTimestamp` 是 **Unix 秒**且 `< 10^11`，必须等于 npm 上的真实发布时间。
- 图标：内联 `data:image/(svg+xml|png|jpeg|webp);base64,` 且解码后 ≤ 32 KiB；或引用 https（或与索引同源）的 URL。
- 索引地址自身必须是绝对 http(s)、不带 query/fragment；`metadata` 里用到的 category/label 必须先声明。
- 未定义字段会被忽略；`engines.dsh` 一旦声明就单独决定兼容性——本包故意不声明，以换取“任何版本都不被拒装”。