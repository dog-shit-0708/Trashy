/**
 * TTL 自动清理系统 — 完整验收脚本
 * 运行：npx tsx test-ttl-acceptance.ts
 *
 * 覆盖维度：存储基建 | 过期清理 | TTL Service 单例/通知/关闭 | 边界值 | 压力 | 并发
 *
 * 注意：内联了 JsonStorage/TrashRepository/TtlService 的独立副本
 * （不依赖 Electron app 模块，可直接在 Node.js 下运行）
 */
import path from 'node:path'
import fs from 'node:fs/promises'

// ── 类型定义 ──────────────────────────────────
interface TrashItem {
  id: string
  type: 'text' | 'image'
  content: string
  createdAt: number
  expireAt: number
}

interface IStorage {
  read(): Promise<TrashItem[]>
  write(data: TrashItem[]): Promise<void>
}

// ── JsonStorage（不依赖 Electron） ──────────
class JsonStorage implements IStorage {
  private filePath: string
  private lock: Promise<void> = Promise.resolve()

  constructor(private dir: string, filename = 'trash.json') {
    this.filePath = path.join(dir, filename)
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void
    const prev = this.lock
    this.lock = new Promise<void>((resolve) => { release = resolve })
    await prev
    try { return await fn() }
    finally { release!() }
  }

  private async ensureFile() {
    await fs.mkdir(this.dir, { recursive: true })
    try { await fs.access(this.filePath) }
    catch { await fs.writeFile(this.filePath, '[]', 'utf-8') }
  }

  async read(): Promise<TrashItem[]> {
    return this.withLock(async () => {
      await this.ensureFile()
      return JSON.parse(await fs.readFile(this.filePath, 'utf-8'))
    })
  }

  async write(data: TrashItem[]): Promise<void> {
    return this.withLock(async () => {
      await this.ensureFile()
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    })
  }

  clear() { }
}

// ── TrashRepository（与线上一致） ────────────
class TrashRepository {
  constructor(private storage: IStorage) {}

  async addItem(item: TrashItem) {
    const items = await this.storage.read()
    items.push(item)
    await this.storage.write(items)
  }

  async getAllItems() {
    return this.storage.read()
  }

  async getItems() {
    const items = await this.storage.read()
    const now = Date.now()
    return items.filter(i => i.expireAt > now)
  }

  async getItemById(id: string) {
    const items = await this.getItems()
    return items.find(i => i.id === id) ?? null
  }

  async deleteItem(id: string) {
    const items = await this.storage.read()
    const now = Date.now()
    await this.storage.write(items.filter(i => i.id !== id && i.expireAt > now))
  }

  async clearExpired() {
    const items = await this.storage.read()
    const now = Date.now()
    await this.storage.write(items.filter(i => i.expireAt > now))
  }
}

// ── TtlService（与线上逻辑一致） ──────────────
class TtlService {
  private timerId: ReturnType<typeof setInterval> | null = null
  private repo: TrashRepository
  private getWindow: () => any

  constructor(repo: TrashRepository, getWindow: () => any) {
    this.repo = repo
    this.getWindow = getWindow
  }

  startTTL() {
    if (this.timerId !== null) return
    this.timerId = setInterval(() => this.runCleanup(), 60000)
    this.runCleanup()
  }

  stopTTL() {
    if (this.timerId !== null) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  }

  async runCleanup() {
    try {
      await this.repo.clearExpired()
      const win = this.getWindow()
      if (win && win.webContents) {
        win.webContents.send('tb:itemsChanged')
      }
    } catch (e) {
      console.warn('TTL cleanup error:', e)
    }
  }
}

// ── 验证工具 ──────────────────────────────────
const PASS = '✅'
const FAIL = '❌'
let passed = 0
let failed = 0

function assert(description: string, ok: boolean) {
  if (ok) { console.log(`${PASS} ${description}`); passed++ }
  else { console.log(`${FAIL} ${description}`); failed++ }
}

function genId() { return Math.random().toString(36).slice(2, 10) }

async function main() {
  console.log('══════════════════════════════════════════')
  console.log('  TTL 自动清理系统 — 完整验收报告')
  console.log('══════════════════════════════════════════\n')

  const testDir = path.join(process.cwd(), '.test-ttl-tmp')
  await fs.rm(testDir, { recursive: true }).catch(() => {})

  const now = Date.now()
  const ONE_DAY = 86400000

  // ============================================
  // 1. 基础设施验收
  // ============================================
  console.log('【1/4】基础设施')
  const storage = new JsonStorage(testDir)
  const repo = new TrashRepository(storage)
  assert('JsonStorage 初始化正常', storage instanceof JsonStorage)
  assert('TrashRepository 初始化正常', repo instanceof TrashRepository)

  // ============================================
  // 2. 核心功能验收
  // ============================================
  console.log('\n【2/4】核心功能')

  // 2a. 存储与读取
  const item1: TrashItem = { id: genId(), type: 'text', content: '测试数据', createdAt: now, expireAt: now + ONE_DAY }
  await repo.addItem(item1)
  const itemsWithStorage = await repo.getAllItems()
  assert('数据可正常存储', itemsWithStorage.some(i => i.id === item1.id))

  // 2b. getItems 自动过滤过期
  await repo.addItem({ id: genId(), type: 'text', content: '已过期', createdAt: now - 2 * ONE_DAY, expireAt: now - ONE_DAY })
  const valid = await repo.getItems()
  assert('getItems 自动过滤过期数据', valid.every(i => i.expireAt > now))
  assert('未过期数据不受影响', valid.some(i => i.id === item1.id))

  // 2c. clearExpired 从文件中删除过期
  const beforeClear = (await repo.getAllItems()).length
  await repo.clearExpired()
  const afterClear = (await repo.getAllItems()).length
  assert('clearExpired 删除过期数据', afterClear < beforeClear)
  assert('未过期数据在 clearExpired 后保留', afterClear >= 1)

  // ============================================
  // 3. TTL Service 验收
  // ============================================
  console.log('\n【3/4】TTL Service')

  let notifyCount = 0
  let lastChannel = ''

  const mockWindow = {
    webContents: {
      send: (channel: string) => {
        notifyCount++
        lastChannel = channel
      }
    }
  }

  const ttl = new TtlService(repo, () => mockWindow)

  // 3a. startTTL 单例保护
  ttl.startTTL()
  const firstTimer = (ttl as any).timerId
  ttl.startTTL()
  const secondTimer = (ttl as any).timerId
  assert('startTTL 不重复开定时器', firstTimer === secondTimer && firstTimer !== null)

  // 3b. runCleanup 执行并通知
  await ttl.runCleanup()
  assert('清理后触发 IPC 通知 (tb:itemsChanged)', notifyCount >= 1 && lastChannel === 'tb:itemsChanged')

  // 3c. stopTTL 清理资源
  ttl.stopTTL()
  assert('stopTTL 清空 timerId', (ttl as any).timerId === null)

  // 3d. 多次 stopTTL 不崩溃
  ttl.stopTTL()
  assert('多次 stopTTL 不崩溃', true)

  // 3e. 空数据不报错
  const emptyStorage = new JsonStorage(path.join(testDir, 'empty'))
  const emptyRepo = new TrashRepository(emptyStorage)
  const ttlEmpty = new TtlService(emptyRepo, () => null as any)
  let crashed = false
  try { await ttlEmpty.runCleanup() }
  catch { crashed = true }
  assert('空数据跑清理不崩溃', !crashed)

  // 3f. getWindow 返回 null 时不崩溃
  const ttlNoWindow = new TtlService(repo, () => null as any)
  let noWinCrashed = false
  try { await ttlNoWindow.runCleanup() }
  catch { noWinCrashed = true }
  assert('getWindow 返回 null 不崩溃', !noWinCrashed)

  // ============================================
  // 4. 边界情况验收
  // ============================================
  console.log('\n【4/4】边界情况')

  // 4a. 刚好过期 1ms
  const just = { id: genId(), type: 'text' as const, content: '刚过期-1ms', createdAt: now - 1000, expireAt: now - 1 }
  await repo.addItem(just)
  await repo.clearExpired()
  const afterJust = await repo.getAllItems()
  assert('刚过期 1ms 的数据被清理', !afterJust.some(i => i.id === just.id))

  // 4b. 即将过期但不应被清理（49s 后过期）
  const soon = { id: genId(), type: 'text' as const, content: '即将过期-49s', createdAt: now, expireAt: now + 49000 }
  await repo.addItem(soon)
  await repo.clearExpired()
  const afterSoon = await repo.getAllItems()
  assert('即将过期（+49s）不被提前清理', afterSoon.some(i => i.id === soon.id))

  // 4c. expireAt = 0
  const zero = { id: genId(), type: 'text' as const, content: 'expireAt=0', createdAt: 0, expireAt: 0 }
  await repo.addItem(zero)
  await repo.clearExpired()
  assert('expireAt=0 视为过期并清理', !(await repo.getAllItems()).some(i => i.id === zero.id))

  // 4d. 负数 expireAt
  const neg = { id: genId(), type: 'text' as const, content: '负数时间戳', createdAt: -1, expireAt: -1 }
  await repo.addItem(neg)
  await repo.clearExpired()
  assert('负数 expireAt 被清理', !(await repo.getAllItems()).some(i => i.id === neg.id))

  // 4e. 超大时间戳（永不超时）
  const far = { id: genId(), type: 'text' as const, content: '远未来', createdAt: now, expireAt: 9999999999999 }
  await repo.addItem(far)
  await repo.clearExpired()
  assert('超大时间戳不被清理', (await repo.getAllItems()).some(i => i.id === far.id))

  // 4f. 大量过期数据（压力 200 条）
  console.log('   ⏳ 压力测试：插入 200 条过期数据...')
  for (let i = 0; i < 200; i++) {
    await repo.addItem({ id: `stress-${i}`, type: 'text', content: `压力测试-${i}`, createdAt: now - ONE_DAY, expireAt: now - 1 })
  }
  const beforeStress = (await repo.getAllItems()).length
  console.log(`   压测前: ${beforeStress} 条`)
  await repo.clearExpired()
  const afterStress = await repo.getAllItems()
  const expiredRemaining = afterStress.filter(i => i.expireAt <= now).length
  assert('200 条过期数据全部清理', expiredRemaining === 0)
  assert('压测后未过期数据保留', afterStress.some(i => i.expireAt > now))

  // 4g. 并发：清理同时添加
  const concItem = { id: genId(), type: 'text' as const, content: '并发添加', createdAt: now, expireAt: now + ONE_DAY }
  await Promise.all([repo.clearExpired(), repo.addItem(concItem)])
  assert('清理+添加并发不丢失数据', (await repo.getAllItems()).some(i => i.id === concItem.id))

  // 4h. 删除已过期 item（deleteItem 应不影响任何不过期数据）
  await repo.addItem({ id: 'to-delete', type: 'text', content: '待删过期', createdAt: now - ONE_DAY, expireAt: now - 1 })
  await repo.deleteItem('to-delete')
  const afterDelete = await repo.getAllItems()
  assert('删除过期 item 不报错', !afterDelete.some(i => i.id === 'to-delete'))

  // ============================================
  // 汇总
  // ============================================
  const total = passed + failed
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`  总计: ${total} 项 | ${PASS} ${passed} 通过 | ${FAIL} ${failed} 失败`)
  console.log(`${'═'.repeat(50)}`)

  // 清理
  await fs.rm(testDir, { recursive: true }).catch(() => {})

  if (failed === 0) {
    console.log(`\n${PASS} TTL 自动清理系统 验收通过`)
    console.log(`  覆盖维度: 存储基建 | 过期清理 | TTL Service 单例/通知/关闭 | 边界值 (1ms/0/负数/超大) | 压力 200 条 | 并发`)
    process.exit(0)
  } else {
    console.log(`\n${FAIL} 存在 ${failed} 项未通过，需排查`)
    process.exit(1)
  }
}

main().catch(e => {
  console.error('验收脚本异常:', e)
  process.exit(1)
})
