import { contextBridge, ipcRenderer } from 'electron'

export type PetState = 'sleeping' | 'eating' | 'pooping' | 'idle' | 'waking'

contextBridge.exposeInMainWorld('petAPI', {
  toggleMainWindow: () => ipcRenderer.send('pet:toggleMainWindow'),
  onSetState: (callback: (state: PetState) => void) => {
    const handler = (_event: any, state: PetState) => callback(state)
    ipcRenderer.on('pet:setState', handler)
    return () => ipcRenderer.removeListener('pet:setState', handler)
  },
  startDrag: (x: number, y: number) => ipcRenderer.send('pet:startDrag', x, y),
  drag: (x: number, y: number) => ipcRenderer.send('pet:drag', x, y),
  endDrag: () => ipcRenderer.send('pet:endDrag'),
})

declare global {
  interface Window {
    petAPI: {
      toggleMainWindow: () => void
      onSetState: (callback: (state: PetState) => void) => () => void
      startDrag: (x: number, y: number) => void
      drag: (dx: number, dy: number) => void
      endDrag: () => void
    }
  }
}
