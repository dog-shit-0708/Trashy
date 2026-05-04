import { app, BrowserWindow, dialog, ipcMain, Menu, Tray, screen } from 'electron'
import path from 'node:path'
import { autoUpdater } from 'electron-updater'
import { JsonStorage, TrashRepository, type TrashItem, loadConfig, saveConfig } from './store'
import { TtlService } from './ttl'

let win: BrowserWindow | null = null
let petWin: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let repo: TrashRepository
let ttl: TtlService

const getIconPath = () => {
  return process.env.VITE_DEV_SERVER_URL
    ? path.join(process.cwd(), 'public/11 (1311).png')
    : path.join(process.resourcesPath, 'public/11 (1311).png')
}

const createWindow = () => {
  win = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 300,
    minHeight: 400,
    show: true,
    resizable: true,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(process.env.DIST || '', 'index.html'))
  }

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win?.hide()
    }
  })

  win.on('blur', () => {
    win?.minimize()
  })
}

const createTray = () => {
  tray = new Tray(getIconPath())

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示', click: () => win?.show() },
    { type: 'separator' },
    { label: '检查更新', click: () => autoUpdater.checkForUpdates() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        ttl.stopTTL()
        app.quit()
      },
    },
  ])

  tray.setToolTip('Trashy')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (win?.isVisible()) {
      win.hide()
    } else {
      win?.show()
    }
  })
}

const createPetWindow = () => {
  petWin = new BrowserWindow({
    width: 75,
    height: 110,
    show: false,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'pet-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    petWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}pet.html`)
  } else {
    petWin.loadFile(path.join(process.env.DIST || '', 'pet.html'))
  }

  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  const petWidth = 75
  const petHeight = 110
  const petX = x + width - petWidth - 20
  const petY = y + height - petHeight - 30

  petWin.setPosition(petX, petY)
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWin.setIgnoreMouseEvents(false)

  petWin.once('ready-to-show', () => {
    petWin?.showInactive()
  })
  petWin.on('closed', () => {
    petWin = null
  })
}

const notifyPet = (state: 'sleeping' | 'eating' | 'pooping' | 'idle' | 'waking') => {
  petWin?.webContents.send('pet:setState', state)
}

const registerIpcHandlers = () => {
  ipcMain.handle('trash:addItem', async (_event, item: TrashItem) => {
    await repo.addItem(item)
    notifyPet('eating')
  })

  ipcMain.handle('trash:getItems', async () => {
    return await repo.getItems()
  })

  ipcMain.handle('trash:getItemById', async (_event, id: string) => {
    return await repo.getItemById(id)
  })

  ipcMain.handle('trash:deleteItem', async (_event, id: string) => {
    await repo.deleteItem(id)
    notifyPet('pooping')
  })

  ipcMain.handle('trash:clearExpired', async () => {
    await repo.clearExpired()
  })

  ipcMain.handle('trash:getSavePath', async () => {
    const config = await loadConfig()
    return config.savePath || path.join(app.getAppPath(), 'data')
  })

  ipcMain.handle('trash:setSavePath', async (_event, newPath: string) => {
    await saveConfig({ savePath: newPath })
    const dataDir = newPath || path.join(app.getAppPath(), 'data')
    repo = new TrashRepository(new JsonStorage('trash.json', dataDir))
    return dataDir
  })

  ipcMain.handle('trash:pickFolder', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: '选择数据保存目录',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.on('close-window', () => {
    win?.hide()
  })

  ipcMain.on('minimize-window', () => {
    win?.minimize()
  })

  // 手动检查更新
  ipcMain.handle('app:checkUpdate', async () => {
    autoUpdater.checkForUpdates()
    return { checked: true }
  })

  ipcMain.on('pet:toggleMainWindow', () => {
    if (win?.isVisible()) {
      win.hide()
    } else {
      win?.show()
      win?.focus()
    }
  })

  ipcMain.on('pet:startDrag', (_event, mouseX: number, mouseY: number) => {
    if (!petWin) return
    const pos = petWin.getPosition()
    ;(petWin as any).dragOffset = { x: mouseX - pos[0], y: mouseY - pos[1] }
  })

  ipcMain.on('pet:drag', (_event, mouseX: number, mouseY: number) => {
    if (!petWin) return
    const offset = (petWin as any).dragOffset
    if (!offset) return
    const newX = Math.round(mouseX - offset.x)
    const newY = Math.round(mouseY - offset.y)
    petWin.setPosition(newX, newY)
  })
}

app.whenReady().then(async () => {
  const config = await loadConfig()
  const dataDir = config.savePath || path.join(app.getAppPath(), 'data')
  repo = new TrashRepository(new JsonStorage('trash.json', dataDir))
  ttl = new TtlService(repo, () => win)

  createWindow()
  createPetWindow()
  createTray()
  registerIpcHandlers()
  ttl.startTTL()

  // 启动时检查更新（非阻塞，只后台检查）
  autoUpdater.checkForUpdatesAndNotify()
})

app.on('window-all-closed', () => {
  if (isQuitting) {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (petWin && !petWin.isDestroyed()) {
    petWin.close()
  }
})

// ====== 自动更新 ======
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('checking-for-update', () => {
  console.log('[AutoUpdater] 正在检查更新...')
})

autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: '发现新版本',
    message: `有新版本 ${info.version} 可用，是否下载？`,
    buttons: ['下载', '取消'],
  }).then(({ response }) => {
    if (response === 0) {
      autoUpdater.downloadUpdate()
    }
  })
})

autoUpdater.on('update-not-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: '已是最新',
    message: '当前已是最新版本。',
  })
})

autoUpdater.on('download-progress', (progress) => {
  console.log(`[AutoUpdater] 下载中: ${Math.round(progress.percent)}%`)
})

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: '下载完成',
    message: '更新已下载，是否立即重启安装？',
    buttons: ['重启', '稍后'],
  }).then(({ response }) => {
    if (response === 0) {
      isQuitting = true
      autoUpdater.quitAndInstall()
    }
  })
})

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] 错误:', err)
})

app.on('activate', () => {
  win?.show()
})
