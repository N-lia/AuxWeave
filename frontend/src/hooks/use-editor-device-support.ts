import { useEffect, useState } from 'react'

function detectEditorUnsupportedOnThisDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  try {
    if (
      window.location.search.includes('force=true') ||
      sessionStorage.getItem('auxweave_force_editor') === 'true'
    ) {
      return false
    }
  } catch {
    /* ignore storage access issues */
  }

  const nav = navigator as Navigator & {
    userAgentData?: { mobile?: boolean }
  }

  const uaDataMobile = nav.userAgentData?.mobile === true
  const uaMobile =
    /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent) &&
    !/iPad|Tablet/i.test(navigator.userAgent)

  // Only flag actual small mobile phone viewports
  const isNarrowMobile = (uaDataMobile || uaMobile) && window.innerWidth <= 640

  return isNarrowMobile
}

export function useEditorUnsupportedOnThisDevice(): boolean {
  const [unsupported, setUnsupported] = useState(() => detectEditorUnsupportedOnThisDevice())

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px) and (pointer: coarse)')
    const update = () => setUnsupported(detectEditorUnsupportedOnThisDevice())

    update()
    window.addEventListener('resize', update)
    media.addEventListener?.('change', update)

    return () => {
      window.removeEventListener('resize', update)
      media.removeEventListener?.('change', update)
    }
  }, [])

  return unsupported
}
