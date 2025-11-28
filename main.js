const $ = (q) => document.querySelector(q);
const messagesEl = $('#messages');
const inputEl = $('#chatInput');
const formEl = $('#composer');
const atlasSvg = $('#atlas');
const yearEl = $('#year');
yearEl.textContent = new Date().getFullYear();

const userColor = '#22c55e';
const aiColor = '#60a5fa';
const topicColor = '#f97316';

let state = {
  messages: [], // {role:'user'|'ai', content:string, id:string, topics:string[]}
  topics: new Map(), // topic -> {count:number}
  edges: new Map(), // 'a|b' -> weight
};

const uid = () => Math.random().toString(36).slice(2, 10);

function extractTopics(text) {
  // Simple heuristic keyword extractor: nouns-ish words, deduped
  const cleaned = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stop = new Set('i me my we us our you your he him his she her it its they them their a an and the for of to in on with as is are was were be this that these those if then else or not from by about into over after before can will just do does did have has had how what when where why which who whom whose than vs vs.'.split(' '));
  const words = cleaned.split(' ').filter(w => w && !stop.has(w) && w.length > 2);
  const stems = words.map(w => w.replace(/(ing|ed|ly|s)$/,'')).filter(Boolean);
  const uniq = [...new Set(stems)].slice(0, 8);
  return uniq;
}

function updateGraph(newMsg) {
  // Update topic counts
  newMsg.topics.forEach(t => {
    const curr = state.topics.get(t) || { count: 0 };
    curr.count += 1;
    state.topics.set(t, curr);
  });

  // Build co-occurrence edges among topics in this message
  const ts = newMsg.topics;
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      const a = ts[i], b = ts[j];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const w = state.edges.get(key) || 0;
      state.edges.set(key, w + 1);
    }
  }
  renderGraph();
}

function renderMessages() {
  messagesEl.innerHTML = '';
  for (const m of state.messages) {
    const msg = document.createElement('div');
    msg.className = 'msg';

    const avatar = document.createElement('div');
    avatar.className = `avatar ${m.role}`;
    avatar.textContent = m.role === 'user' ? 'YOU' : 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const role = document.createElement('div');
    role.className = 'role';
    role.textContent = m.role === 'user' ? 'User' : 'Assistant';

    const content = document.createElement('div');
    content.className = 'content';
    content.textContent = m.content;

    bubble.appendChild(role);
    bubble.appendChild(content);
    msg.appendChild(avatar);
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderGraph() {
  const width = 1200, height = 800;
  const cx = width / 2, cy = height / 2;
  const nodes = [];
  const edges = [];

  // Topic nodes
  const topicEntries = [...state.topics.entries()].sort((a,b)=>b[1].count - a[1].count).slice(0, 80);
  const topicIndex = new Map();
  const total = topicEntries.length;
  const radius = Math.max(180, Math.min(cx, cy) - 40);
  topicEntries.forEach(([t, data], i) => {
    const angle = (i / total) * Math.PI * 2;
    const r = radius * (0.66 + 0.34 * Math.sin(i * 1.7));
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const size = 6 + Math.min(18, data.count * 2);
    topicIndex.set(t, nodes.length);
    nodes.push({ id: t, label: t, x, y, r: size, color: topicColor, type: 'topic' });
  });

  // Message nodes (lightweight, near center)
  const lastMsgs = state.messages.slice(-12);
  lastMsgs.forEach((m, i) => {
    const angle = (i / Math.max(1,lastMsgs.length)) * Math.PI * 2;
    const r = 90 + (m.role === 'ai' ? 10 : -10);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    nodes.push({ id: m.id, label: m.role === 'ai' ? 'AI' : 'You', x, y, r: 8, color: m.role === 'ai' ? aiColor : userColor, type: m.role });
    // edges from message to its topics
    m.topics.forEach(t => {
      if (topicIndex.has(t)) {
        edges.push({ a: m.id, b: t, w: 1.5, strong: false });
      }
    });
  });

  // Topic-topic edges by co-occurrence
  for (const [key, w] of state.edges.entries()) {
    const [a, b] = key.split('|');
    if (topicIndex.has(a) && topicIndex.has(b)) {
      edges.push({ a, b, w, strong: w >= 3 });
    }
  }

  // Render SVG
  atlasSvg.innerHTML = '';

  // defs glow
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const glow = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  glow.setAttribute('id', 'glow');
  glow.innerHTML = '<feGaussianBlur stdDeviation="2" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>';
  defs.appendChild(glow);
  atlasSvg.appendChild(defs);

  const gEdges = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gEdges.setAttribute('stroke-linecap', 'round');
  gEdges.setAttribute('stroke-width', '1.2');

  edges.forEach(e => {
    const a = nodes.find(n => n.id === e.a);
    const b = nodes.find(n => n.id === e.b);
    if (!a || !b) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x);
    line.setAttribute('y2', b.y);
    line.setAttribute('class', e.strong ? 'edge edge-strong' : 'edge');
    line.setAttribute('stroke-width', String(0.6 + Math.min(3, e.w * 0.7)));
    gEdges.appendChild(line);
  });
  atlasSvg.appendChild(gEdges);

  const gNodes = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodes.forEach(n => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'node');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', n.x);
    circle.setAttribute('cy', n.y);
    circle.setAttribute('r', n.r);
    circle.setAttribute('fill', n.color);
    circle.setAttribute('filter', 'url(#glow)');

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', n.x + n.r + 6);
    label.setAttribute('y', n.y + 4);
    label.setAttribute('class', 'node-label');
    label.textContent = n.label.length > 24 ? n.label.slice(0, 22) + '?' : n.label;

    gNodes.appendChild(circle);
    if (n.type === 'topic') gNodes.appendChild(label);
    group.appendChild(gNodes);
  });
  atlasSvg.appendChild(gNodes);
}

function aiReply(userText) {
  // Lightweight local assistant: paraphrase + highlight topics
  const topics = extractTopics(userText);
  const tips = topics.slice(0,3).map(t => `? ${t}`).join('\n');
  const reply = [
    `Reflecting on your message: "${userText}"`,
    topics.length ? `Key topics I see:\n${tips}` : `I didn't detect strong topics?could you elaborate?`,
  ].join('\n\n');
  return { content: reply, topics };
}

function addMessage(role, content) {
  const topics = extractTopics(content);
  const msg = { id: uid(), role, content, topics };
  state.messages.push(msg);
  renderMessages();
  updateGraph(msg);
}

function handleSubmit(e) {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  addMessage('user', text);
  inputEl.value = '';
  setTimeout(() => {
    const ai = aiReply(text);
    const aiMsg = { id: uid(), role: 'ai', content: ai.content, topics: ai.topics };
    state.messages.push(aiMsg);
    renderMessages();
    updateGraph(aiMsg);
  }, 350);
}

function restoreSession() {
  try {
    const raw = localStorage.getItem('chatpt-atlas');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.messages)) return;
    state = { messages: [], topics: new Map(), edges: new Map() };
    for (const m of data.messages) {
      addMessage(m.role, m.content);
    }
  } catch {}
}

function persist() {
  const snapshot = { messages: state.messages.map(m => ({ role: m.role, content: m.content })) };
  localStorage.setItem('chatpt-atlas', JSON.stringify(snapshot));
}

formEl.addEventListener('submit', handleSubmit);
$('#clearSession').addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.removeItem('chatpt-atlas');
  state = { messages: [], topics: new Map(), edges: new Map() };
  renderMessages();
  renderGraph();
});

const persistObserver = new MutationObserver(() => persist());
persistObserver.observe(messagesEl, { childList: true, subtree: true });

// Seed welcome message
if (!localStorage.getItem('chatpt-atlas')) {
  addMessage('ai', 'Welcome to ChatPT Atlas. Ask me something and watch topics emerge.');
} else {
  restoreSession();
}
renderGraph();
