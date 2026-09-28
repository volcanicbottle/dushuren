import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, MicOff } from 'lucide-react'

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { resultIndex: number; results: { isFinal: boolean; [index: number]: { transcript: string } }[] }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function getSR(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null
}

/**
 * 语音输入按钮（浏览器 Web Speech API，免费免配置）
 * 点一下开始听、再点一下停止；识别结果追加到目标输入框
 * 不支持的浏览器（部分电纸书浏览器）自动隐藏
 */
export default function VoiceButton({ onResult, disabled }: { onResult: (text: string) => void; disabled?: boolean }) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const supported = typeof window !== 'undefined' && getSR() !== null

  if (!supported) return null

  const toggle = () => {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const SR = getSR()
    if (!SR) return
    const rec = new SR()
    rec.lang = 'zh-CN'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onResult(e.results[i][0].transcript)
      }
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    try {
      rec.start()
      recRef.current = rec
      setListening(true)
    } catch { /* 忽略启动失败 */ }
  }

  return (
    <Button
      size="icon"
      variant={listening ? 'default' : 'outline'}
      className={`h-10 w-10 shrink-0 ${listening ? 'bg-red-500 hover:bg-red-600' : ''}`}
      onClick={toggle}
      disabled={disabled}
      aria-label={listening ? '停止语音输入' : '语音输入'}
      title={listening ? '正在听，点击停止' : '语音输入'}
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  )
}
