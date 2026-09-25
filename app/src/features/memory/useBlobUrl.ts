import { useEffect, useState } from 'react'

import { getBlob } from './repo'

type Loaded = { ref: string; url: string }

/**
 * 把 IndexedDB 里的原图 / 原音取出来，转成 object URL。
 * 卸载时 revoke——一张照片看一次就占着内存，不是这个产品该干的事。
 *
 * 只在异步回调里 setState；blobRef 换了而新的还没到，就先返回 undefined，
 * 由调用方回落到降级画面，避免闪一下上一张图。
 */
export function useBlobUrl(blobRef: string | undefined): string | undefined {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!blobRef) return

    let cancelled = false
    let created: string | undefined

    void getBlob(blobRef).then((blob) => {
      if (!blob || cancelled) return
      created = URL.createObjectURL(blob)
      setLoaded({ ref: blobRef, url: created })
    })

    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [blobRef])

  return loaded && loaded.ref === blobRef ? loaded.url : undefined
}
