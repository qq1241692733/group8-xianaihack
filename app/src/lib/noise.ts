/**
 * 确定性伪随机，取值 [0, 1)。
 *
 * 波形的「随机」不需要真随机——由下标算出来就够了。好处是每次渲染都是同一张图：
 * 不会因为重渲染而抖动，也不违反 React 组件的纯函数约定。
 */
export function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}
