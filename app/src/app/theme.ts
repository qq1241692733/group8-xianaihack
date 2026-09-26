import { useSyncExternalStore } from 'react'

import { themeParam } from '@/lib/stage'

/**
 * 昼 · 夜。
 *
 * 三条约定，每一条都是被咬过才知道的：
 *
 * ① **真值只有一处**：`document.documentElement.dataset.theme`。
 *    CSS 不认识 React，画布（paint.ts / dotOrb.ts）也不认识 React；
 *    开关挂在 <html> 上，两边读的是同一个值，不可能走岔。
 *    令牌层因此只需要一个 `html[data-theme='day']` 覆盖块（见 tokens.css）。
 *
 * ② **默认跟随系统**。手机上「白天 / 黑夜」是系统级设置，产品不该另立一套；
 *    手动选择只是覆盖它，记在 localStorage 里。所以是三个状态，不是两个。
 *
 * ③ **首帧不能闪**。读取与落地必须在 React 挂载**之前**跑一次（见 main.tsx），
 *    否则会先渲染一帧夜版、再跳到昼版——那一下白闪比没有昼版更糟。
 *
 * 还有一个反直觉的点：**昼版不是夜版的反色**（docs/18 §二）。
 * 球、层级、金三处方向相反，所以这里只负责「切换」，具体怎么变在各处自己身上。
 */
export type ThemePref = 'system' | 'day' | 'night'
export type ThemeMode = 'day' | 'night'

export interface ThemeSnapshot {
  pref: ThemePref
  mode: ThemeMode
}

const KEY = 'cike:theme'
const LIGHT = '(prefers-color-scheme: light)'

/** 当前值放在模块级：多个组件同时调用 useTheme 必须看到同一份，不能各存一份 state。 */
let snap: ThemeSnapshot = { pref: 'system', mode: 'night' }
const subs = new Set<() => void>()

function emit(): void {
  for (const fn of subs) fn()
}

function subscribe(fn: () => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

function getSnapshot(): ThemeSnapshot {
  return snap
}

function prefersLight(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(LIGHT).matches
}

export function resolveMode(pref: ThemePref): ThemeMode {
  if (pref === 'day') return 'day'
  if (pref === 'night') return 'night'
  return prefersLight() ? 'day' : 'night'
}

function readStored(): ThemePref | null {
  try {
    const v = window.localStorage.getItem(KEY)
    return v === 'day' || v === 'night' || v === 'system' ? v : null
  } catch {
    // 隐私模式 / 禁用存储：记不住就每次都跟随系统，功能不降级。
    return null
  }
}

function apply(next: ThemeSnapshot): void {
  snap = next
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = next.mode
  emit()
}

/** React 挂载之前调用一次。重复调用是幂等的。 */
export function initTheme(): void {
  if (typeof window === 'undefined') return

  const forced = themeParam()
  const pref: ThemePref =
    forced === 'day' || forced === 'night' || forced === 'system'
      ? forced
      : (readStored() ?? 'system')

  const mode = resolveMode(pref)
  snap = { pref, mode }
  document.documentElement.dataset.theme = mode

  // 跟随系统时，系统换了我跟着换。监听只装一次，且只在 pref 仍是 system 时生效。
  window.matchMedia(LIGHT).addEventListener('change', () => {
    if (snap.pref === 'system') apply({ pref: 'system', mode: resolveMode('system') })
  })
}

export function setThemePref(pref: ThemePref): void {
  try {
    window.localStorage.setItem(KEY, pref)
  } catch {
    // 同上：存储不可用不该让切换本身失效。
  }
  apply({ pref, mode: resolveMode(pref) })
}

export function useTheme(): ThemeSnapshot & { setPref: (pref: ThemePref) => void } {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { pref: s.pref, mode: s.mode, setPref: setThemePref }
}

/**
 * 读一个 CSS 变量在**当前主题下**的最终值。
 * 画布用：paint.ts / dotOrb.ts 里的颜色不能写死，否则切到昼版球还是那颗夜里的球。
 */
export function cssVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
