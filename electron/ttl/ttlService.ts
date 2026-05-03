import { TrashRepository } from '../store/TrashRepository'
import { BrowserWindow } from 'electron'

/**
 * TTL 清理调度器。
 *
 * - 每 60s 自动扫描并删除过期数据
 * - 手动调用 runCleanup() 立即触发
 * - 清理后通过 ipcMain.emit('tb:itemsChanged') 通知 renderer
 * - 重复 startTTL 安全（singleton 保护）
 * - 所有异常被 catch，不阻塞主进程
 */
export class TtlService {
  private repo: TrashRepository
  private getWindow: () => BrowserWindow | null

  private timerId: ReturnType<typeof setInterval> | null = null
  private running = false

  private readonly INTERVAL_MS = 60 * 1000

  constructor(repo: TrashRepository, getWindow: () => BrowserWindow | null) {
    this.repo = repo
    this.getWindow = getWindow
  }

  /** 启动定时扫描。多次调用安全，不会创建多个 timer。 */
  startTTL(): void {
    if (this.timerId !== null) return

    this.timerId = setInterval(() => {
      this.runCleanup()
    }, this.INTERVAL_MS)

    // 启动后立即执行一次
    this.runCleanup()
  }

  /** 停止定时扫描。彻底释放 timer 资源。 */
  stopTTL(): void {
    if (this.timerId === null) return

    clearInterval(this.timerId)
    this.timerId = null
  }

  /** 手动触发一次清理。幂等、异常安全、不阻塞主进程。 */
  async runCleanup(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      await this.repo.clearExpired()
      this.notifyRenderer()
    } catch (err) {
      console.error('[TtlService] cleanup failed:', err)
    } finally {
      this.running = false
    }
  }

  /** 是否正在运行中 */
  isRunning(): boolean {
    return this.timerId !== null
  }

  private notifyRenderer(): void {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('tb:itemsChanged')
    }
  }
}
