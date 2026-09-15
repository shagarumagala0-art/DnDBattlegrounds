const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

const starterMessage = [
  'Hi! I am your DnD chat bot.',
  'I can help with encounter ideas, quick rulings, and roleplay prompts.'
].join(' ');

addMessage('assistant', starterMessage);

chatForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const userMessage = chatInput?.value.trim();
  if (!userMessage) return;

  addMessage('user', userMessage);
  chatInput.value = '';

  window.setTimeout(() => {
    addMessage('assistant', generateBotReply(userMessage));
  }, 250);
});

function addMessage(role, text) {
  if (!chatLog) return;

  const message = document.createElement('article');
  message.className = `chat-message chat-message-${role}`;
  message.textContent = text;
  chatLog.appendChild(message);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function generateBotReply(input) {
  const text = input.toLowerCase();

  if (containsAny(text, ['encounter', 'fight', 'combat', 'battle'])) {
    return 'Try this encounter seed: a ruined bridge crossing guarded by two harpies and unstable stone pillars that can collapse as lair actions.';
  }

  if (containsAny(text, ['loot', 'treasure', 'reward'])) {
    return 'Reward idea: a weathered map, 120 gp, and a minor magical trinket that glows near hidden doors.';
  }

  if (containsAny(text, ['npc', 'roleplay', 'dialogue', 'character'])) {
    return 'NPC prompt: Captain Elira, calm but secretive, asks for help retrieving a lost relic while clearly hiding who hired her.';
  }

  if (containsAny(text, ['rule', 'ruling', 'check', 'save', 'spell'])) {
    return 'Quick ruling tip: set a clear DC based on risk (10 easy, 15 moderate, 20 hard) and describe success or consequence before the roll.';
  }

  return 'Good prompt. Add party level, setting, and tone, and I will craft a tighter suggestion for your next scene.';
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}
