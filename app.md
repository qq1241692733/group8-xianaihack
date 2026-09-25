# 此刻 · Android 版

原生安卓实现。**不复用** `index.html`（那份保留作视觉与交互参考）。

## 现状

工程已完整搭好，但**尚未编译验证** —— 生成它的机器上没有 JDK / Android SDK / Gradle。

## 怎么跑起来

1. 装 Android Studio（自带 JDK 17 与 SDK）。
2. 用 Studio 打开 `android/` 目录（**不是**项目根目录）。
3. 让它自动补 SDK、Gradle wrapper（本仓库未提交二进制 jar）。
4. 运行到模拟器或真机。

命令行方式（需本机已有 gradle 与 SDK）：

```
cd android
gradle wrapper --gradle-version 8.9
./gradlew assembleDebug
./gradlew test          # 只跑纯 Kotlin 单元测试，不需要模拟器
```

## 架构

```
app/src/main/java/com/wuyong/zhike/
├── core/          纯 Kotlin，零 Android 依赖 ← 真正的护城河
│   ├── model/     Entry / EntryKind / EntryTags / Moment
│   ├── memory/    MemorySearch：三路检索 + 聚合
│   └── agent/     prompt 组装 / 剧本兜底 / 严格 JSON 解析
├── data/          Room、原生录音、OpenAI 兼容客户端、标签提取
├── feature/       录音与相机
├── ui/            Compose 界面（首页 / 时间 / 理解 / 3 分钟）
└── di/            手写 ServiceLocator
```

`core/` 不碰任何 Android API，所以：
单元测试跑得飞快，将来若要换 RN 或其它平台也能整体搬走。

## 三个关键设计决定

**一、把「无用」写进类型系统**

`Entry` 里没有 `streak`、没有 `completionRate`、没有 `dailyGoal`、没有 `done`。
首页那几个数字是**算不出来**，不是没渲染 ——
`MemorySearchTest.entry_has_no_productivity_fields` 会守住这条线。

**二、记忆检索不做向量 RAG**

文档里最精彩的两个场景恰好是向量检索的盲区：

- 「你还记得 8 月 17 日吗？」→ 按**精确日期**召回。语义搜「焦虑」永远命不中「今天风很大」。
- 「你已经提到它 7 次了」→ 跨条目 **COUNT**，是聚合查询，不是 top-k 相似。

所以走三路：结构检索 → 聚合 → 文本兜底，候选全量喂给长上下文模型。
护城河在**写入时的标签提取**，不在检索算法。

**三、3 分钟专注不留痕**

不计数、不进时间流、不形成连续天数。
一旦「专注 → 记录 → 连续 → 有用」这条回血链接通，产品就退回普通番茄钟了。

## AI 接入

OpenAI 兼容协议，一个客户端通吃 DeepSeek / Kimi / 通义 / GLM。
**没有 Key 时自动走 `ScriptedAgent` 剧本**，分支与现有 Demo 完全一致。

隐私边界：只有**文本与标签**会出设备，原音原图永不上传，全部存应用私有目录。

## 演示数据

`data/SeedData.kt` 里 `enabled = true` 时预置一批带故事的种子数据，
保证「提到 7 次」和「8 月 17 日」两处一定能触发。
正式包把 `enabled` 改成 `false`。

## 尚未做的

- 快捷设置磁贴（TileService）、桌面小组件、系统分享入口
- 未编译验证（见上文「现状」）

