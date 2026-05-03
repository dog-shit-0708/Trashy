import { contextBridge, ipcRenderer } from 'electron'
import { TrashItem } from './store'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),

  addItem: (item: TrashItem) => ipcRenderer.invoke('trash:addItem', item),
  getItems: (): Promise<TrashItem[]> => ipcRenderer.invoke('trash:getItems'),
  getItemById: (id: string): Promise<TrashItem | null> =>
    ipcRenderer.invoke('trash:getItemById', id),
  deleteItem: (id: string) => ipcRenderer.invoke('trash:deleteItem', id),
  clearExpired: () => ipcRenderer.invoke('trash:clearExpired'),

  onItemsChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('tb:itemsChanged', handler)
    return () => ipcRenderer.removeListener('tb:itemsChanged', handler)
  },

  getSavePath: (): Promise<string> => ipcRenderer.invoke('trash:getSavePath'),
  setSavePath: (newPath: string): Promise<string> =>
    ipcRenderer.invoke('trash:setSavePath', newPath),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('trash:pickFolder'),
})

declare global {
  interface Window {
    electronAPI: {
      platform: string
      closeWindow: () => void
      minimizeWindow: () => void
      addItem: (item: TrashItem) => Promise<void>
      getItems: () => Promise<TrashItem[]>
      getItemById: (id: string) => Promise<TrashItem | null>
      deleteItem: (id: string) => Promise<void>
      clearExpired: () => Promise<void>
      onItemsChanged: (callback: () => void) => () => void
      getSavePath: () => Promise<string>
      setSavePath: (newPath: string) => Promise<string>
      pickFolder: () => Promise<string | null>
    }
  }
}
