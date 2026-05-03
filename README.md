# Trashy 🗑️

一个带桌宠的临时垃圾桶 —— 存点文本、图片啥的，24 小时自动过期。

## 功能

- **临时存储** — 文本和图片存进去，24 小时自动清掉
- **桌宠猫猫** — 一个独立窗口的透明底小猫，会 idle / waking / pooping / sleeping
- **帧序列动画** — PNG 帧序列驱动，不是 GIF，不吃解码性能

## 技术栈

Electron + React + TypeScript + Vite

## 开发

```bash
npm install
npm run dev
```

## 桌宠动画

桌宠帧序列放在 `public/cat/frames/{state}/{001..012}.png`，共 12 帧每状态。

通过 CSS `mix-blend-mode: multiply` 实现透明背景，不是传统 colorkey。

## 项目结构

```
src/
  App.tsx           — 垃圾桶主界面
  pet/              — 桌宠组件
    PetCat.tsx        — 猫猫主逻辑
    petAnimations.ts — 帧序列定义
    pet.css           — 猫猫样式
electron/
  main.ts           — 主进程（双窗口：垃圾桶 + 桌宠）
  store/            — 本地数据存储（Repository 模式）
  ttl/              — 自动过期服务
```

## License

ISC
