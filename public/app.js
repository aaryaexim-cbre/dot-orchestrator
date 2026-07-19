const form = document.querySelector('#prompt-form');
const input = document.querySelector('#message');
const cards = {
  openai: document.querySelector('#openai-card'),
  openrouter: document.querySelector('#openrouter-card'),
};

function setCardState(id, status, text) {
  const card = cards[id];
  if (!card) return;

  const badge = card.querySelector('.status');
  const body = card.querySelector('.response-body');
  badge.className = `status ${status}`;
  badge.textContent = status;
  body.textContent = text;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();

  if (!message) {
    input.focus();
    return;
  }

  Object.keys(cards).forEach((id) => setCardState(id, 'loading', 'Waiting for response…'));

  try {
    const response = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed.');
    }

    data.responses.forEach((result) => {
      setCardState(result.id, result.status, result.text);
    });
  } catch (error) {
    Object.keys(cards).forEach((id) => setCardState(id, 'error', error.message));
  }
});
