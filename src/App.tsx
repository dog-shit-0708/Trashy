import { useEffect, useState } from 'react'

interface TrashItem {
  id: string
  type: 'text' | 'image'
  content: string
  createdAt: number
  expireAt: number
}

function App() {
  const [items, setItems] = useState<TrashItem[]>([])
  const [inputText, setInputText] = useState('')
  const [selectedItem, setSelectedItem] = useState<TrashItem | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadItems = async () => {
    const data = await window.electronAPI.getItems()
    // 按 createdAt 倒序排列
    const sorted = data.sort((a, b) => b.createdAt - a.createdAt)
    setItems(sorted)
  }

  useEffect(() => {
    loadItems()
    // 每秒刷新一次
    const timer = setInterval(loadItems, 1000)
    return () => clearInterval(timer)
  }, [])

  const saveItem = async (type: 'text' | 'image', content: string) => {
    const now = Date.now()
    await window.electronAPI.addItem({
      id: now.toString(),
      type,
      content,
      createdAt: now,
      expireAt: now + 24 * 60 * 60 * 1000,
    })
    loadItems()
  }

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (inputText.trim()) {
        await saveItem('text', inputText)
        setInputText('')
      }
    }
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items
    
    // 优先检查是否有图片
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (blob) {
          const reader = new FileReader()
          reader.onload = async () => {
            await saveItem('image', reader.result as string)
          }
          reader.readAsDataURL(blob)
        }
        return
      }
    }
    
    // 没有图片则正常粘贴文本，让用户按回车保存
  }

  const handleDelete = async (id: string) => {
    setDeleteConfirmId(id)
  }

  const confirmDelete = async () => {
    if (deleteConfirmId) {
      await window.electronAPI.deleteItem(deleteConfirmId)
      setDeleteConfirmId(null)
      loadItems()
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleCopy = async (content: string, type: 'text' | 'image', id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      if (type === 'text') {
        await navigator.clipboard.writeText(content)
      } else {
        // 图片 base64 转 blob 写入剪贴板
        const response = await fetch(content)
        const blob = await response.blob()
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ])
      }
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  return (
    <div className="app">
      <div className="header">
        <div className="drag-handle">
          <span className="drag-dots">⋮⋮</span>
        </div>
        <h1 className="title">Trashy</h1>
        <div className="window-controls">
          <button className="minimize-btn" onClick={() => window.electronAPI.minimizeWindow()}>
            −
          </button>
          <button className="close-btn" onClick={() => window.electronAPI.closeWindow()}>
            ✕
          </button>
        </div>
      </div>

      <div className="input-section">
        <textarea
          className="text-input"
          placeholder="粘贴或输入内容，按回车保存..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={3}
        />
      </div>

      <div className="items-list">
        {items.map((item) => (
          <div key={item.id} className="item-card" onClick={() => setSelectedItem(item)}>
            <div className="item-content">
              {item.type === 'text' ? (
                <p className="text-content">{item.content}</p>
              ) : (
                <img src={item.content} alt="clipboard" className="image-content" />
              )}
            </div>
            <div className="item-footer">
              <span className="item-time">{formatTime(item.createdAt)}</span>
              <div className="item-actions">
                <button className="copy-btn" onClick={(e) => handleCopy(item.content, item.type, item.id, e)} title="复制">
                  {copiedId === item.id ? '✓' : '⧉'}
                </button>
                <button className="delete-btn" onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}>
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedItem && (
        <div className="detail-modal" onClick={() => setSelectedItem(null)}>
          <div className="detail-content" onClick={(e) => e.stopPropagation()}>
            <div className="detail-header">
              <h3>详情</h3>
              <div className="detail-actions">
                <button className="copy-btn" onClick={(e) => handleCopy(selectedItem.content, selectedItem.type, selectedItem.id, e)} title="复制">
                  {copiedId === selectedItem.id ? '✓' : '⧉'}
                </button>
                <button className="detail-close" onClick={() => setSelectedItem(null)}>✕</button>
              </div>
            </div>
            <div className="detail-body">
              {selectedItem.type === 'text' ? (
                <p className="detail-text">{selectedItem.content}</p>
              ) : (
                <img src={selectedItem.content} alt="detail" className="detail-image" />
              )}
            </div>
            <div className="detail-footer">
              <span>{formatTime(selectedItem.createdAt)}</span>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="confirm-modal" onClick={() => setDeleteConfirmId(null)}>
          <div className="confirm-content" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-text">确定要删除这条记录吗？</p>
            <div className="confirm-buttons">
              <button className="confirm-btn cancel" onClick={() => setDeleteConfirmId(null)}>取消</button>
              <button className="confirm-btn confirm" onClick={confirmDelete}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
