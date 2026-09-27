const API_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'

export class AIError extends Error {
  readonly kind: 'auth' | 'network' | 'bad_reply'
  constructor(message: string, kind: 'auth' | 'network' | 'bad_reply') {
    super(message)
    this.kind = kind
  }
}

async function chat(key: string, prompt: string, opts?: { json?: boolean; system?: string }): Promise<string> {
  const messages = [
    ...(opts?.system ? [{ role: 'system', content: opts.system }] : []),
    { role: 'user', content: prompt },
  ]
  return chatMessages(key, messages, opts)
}

/** 多轮对话 */
export async function chatMessages(
  key: string,
  messages: { role: string; content: string }[],
  opts?: { json?: boolean },
): Promise<string> {
  let res: Response
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        ...(opts?.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
  } catch {
    throw new AIError('网络连接失败，请检查网络', 'network')
  }
  if (res.status === 401 || res.status === 403) throw new AIError('API Key 无效或已过期，请到设置页检查', 'auth')
  if (!res.ok) throw new AIError(`DeepSeek 接口错误（HTTP ${res.status}）`, 'network')
  const data = await res.json()
  const text: string = data?.choices?.[0]?.message?.content ?? ''
  if (!text) throw new AIError('AI 返回为空', 'bad_reply')
  return text
}

function parseJSON<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0]) as T
    } catch {
      return null
    }
  }
}

/** 测试 key 是否可用 */
export async function testKey(key: string): Promise<void> {
  await chat(key, '只回复两个字：正常')
}

/** 笔记归类 + 分点整理（输出草稿，用户有最终文字权） */
export async function classifyNote(
  key: string,
  rawText: string,
): Promise<{ category: '观点' | '金句' | '行动'; polished: string }> {
  const text = await chat(
    key,
    `这是一条读书笔记的原话：\n「${rawText}」\n\n请完成两件事：\n1. 归类为以下三类之一：观点（个人想法/评论/启发）、金句（值得摘录的原文或精炼表达）、行动（可以落地实践的具体做法）\n2. 把原话整理成分点草稿（保留原意，不改变观点，用 • 分点，不超过 3 点）\n\n输出 JSON：{"category":"观点|金句|行动","polished":"分点整理后的文本"}`,
    { json: true },
  )
  const obj = parseJSON<{ category?: string; polished?: string }>(text)
  const category = obj?.category === '金句' || obj?.category === '行动' ? obj.category : '观点'
  return { category, polished: obj?.polished?.trim() || rawText }
}

/** 生成书籍大纲 */
export async function generateOutline(key: string, title: string, author: string): Promise<string> {
  return chat(
    key,
    `请为《${title}》（作者：${author || '未知'}）生成一份阅读辅助大纲。\n要求：\n- Markdown 格式，两级标题即可\n- 梳理全书的核心结构和每部分要点\n- 最后附 3 个"读这本书时值得思考的问题"\n- 如果你不熟悉这本书，请明确说明，不要编造章节名`,
  )
}

/** 把用户对"今日一问"的回答结构化为应用记录四格 */
export async function structureAnswer(
  key: string,
  action: string,
  answer: string,
): Promise<{ difficulty?: string; improvement?: string; reason?: string }> {
  const text = await chat(
    key,
    `用户正在实践书中的建议：「${action}」\n用户今天的反馈：「${answer}」\n\n请从反馈中提取（没有提到的字段留空字符串）：\n- difficulty：应用过程中遇到的难点\n- improvement：带来的改善/效果\n- reason：用或不用的原因\n\n输出 JSON：{"difficulty":"","improvement":"","reason":""}`,
    { json: true },
  )
  const obj = parseJSON<{ difficulty?: string; improvement?: string; reason?: string }>(text)
  return {
    difficulty: obj?.difficulty?.trim() || undefined,
    improvement: obj?.improvement?.trim() || undefined,
    reason: obj?.reason?.trim() || undefined,
  }
}

/** 行为模式发现 */
export async function discoverPatterns(
  key: string,
  records: { action: string; applied: boolean | 'forgot'; difficulty?: string; improvement?: string; reason?: string; date: string }[],
): Promise<string> {
  const lines = records
    .map((r) => `${r.date} | ${r.action} | ${r.applied === 'forgot' ? '忘了' : r.applied ? '用了' : '没用'} | 难点:${r.difficulty ?? '-'} | 改善:${r.improvement ?? '-'} | 原因:${r.reason ?? '-'}`)
    .join('\n')
  return chat(
    key,
    `以下是一位读者实践书中建议的记录：\n${lines}\n\n请分析他的行为模式（150 字以内）：\n- 什么情况下容易成功/失败\n- 一条具体可执行的改进建议\n语气直接、具体，不要空话。`,
  )
}

/** 全书总结参考草稿（用户在其上改写，最终文字权在用户） */
export async function summaryDraft(
  key: string,
  title: string,
  notes: { category: string; text: string }[],
): Promise<string> {
  const lines = notes.map((n) => `[${n.category}] ${n.text}`).join('\n')
  return chat(
    key,
    `这是读者读《${title}》时积累的笔记：\n${lines}\n\n请基于这些笔记起草一份全书总结草稿（300 字以内），供读者改写。要求：忠于笔记内容，不要引入笔记之外的观点。`,
  )
}
