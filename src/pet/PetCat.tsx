import { useCallback, useEffect, useRef, useState } from 'react'
import './pet.css'
import { PET_GIFS } from './petAnimations'

export type PetState = 'sleeping' | 'eating' | 'pooping' | 'idle' | 'waking'

declare global {
  interface Window {
    petAPI: {
      toggleMainWindow: () => void
      onSetState: (callback: (state: PetState) => void) => () => void
      startDrag: (x: number, y: number) => void
      drag: (x: number, y: number) => void
      endDrag: () => void
    }
  }
}

const STATE_DURATION = 7000 // eating/pooping 持续时间（毫秒）

const PetCat = () => {
  const [state, setState] = useState<PetState>('idle')
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDragging = useRef(false)

  const goTo = useCallback((newState: PetState) => {
    if (stateTimer.current) {
      clearTimeout(stateTimer.current)
      stateTimer.current = null
    }
    setState(newState)
    if (newState === 'eating' || newState === 'pooping' || newState === 'waking') {
      stateTimer.current = setTimeout(() => {
        setState('idle')
      }, STATE_DURATION)
    }
  }, [])

  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = useCallback(() => {
    if (isDragging.current) return

    // 如果已经有单击计时器，说明是第二次点击 → 双击
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      window.petAPI?.toggleMainWindow()
      return
    }

    // 伸懒腰时单击直接切回 idle
    if (state === 'waking') {
      goTo('idle')
      return
    }

    // 第一次点击 → 启动单击计时器，等待看是否双击
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      goTo('waking')
    }, 250)
  }, [goTo, state])

  const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    isDragging.current = false
    window.petAPI?.startDrag(e.screenX, e.screenY)

    let lastX = e.screenX
    let lastY = e.screenY

    const handleMouseMove = (moveEvent: MouseEvent) => {
      isDragging.current = true
      // 只有当移动超过 2 像素才更新，减少抖动
      if (Math.abs(moveEvent.screenX - lastX) > 2 || Math.abs(moveEvent.screenY - lastY) > 2) {
        lastX = moveEvent.screenX
        lastY = moveEvent.screenY
        window.petAPI?.drag(moveEvent.screenX, moveEvent.screenY)
      }
    }

    const handleMouseUp = () => {
      window.petAPI?.endDrag()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      setTimeout(() => {
        isDragging.current = false
      }, 50)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  useEffect(() => {
    window.petAPI?.onSetState((newState: PetState) => {
      goTo(newState)
    })
  }, [goTo])

  return (
    <div className="pet-container">
      <div className="pet-card" onClick={handleClick}>
        <img
          className={`pet-illustration pet-${state}`}
          src={PET_GIFS[state]}
          alt={state}
          draggable={false}
        />
      </div>
      <div
        className="drag-handle"
        onMouseDown={handleDragMouseDown}
        title="拖拽移动"
      >
        <span className="drag-dots">⋮⋮</span>
      </div>
    </div>
  )
}

export default PetCat
