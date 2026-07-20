const form = document.querySelector('#prompt-form');
const input = document.querySelector('#message');
const submitButton = document.querySelector('#submit-button');
const insightCard = document.querySelector('#insight-card');
const cards = {
  'openrouter-a': document.querySelector('#openrouter-a-card'),
  'gemini-b': document.querySelector('#gemini-b-card'),
};

let activeRequestId = 0;
let activeController = null;

const MODEL_FIELDS = [
  ['verdict', 'Verdict'],
  ['confidence', 'Confidence'],
  ['reasoning', 'Reasoning'],
];
const SYNTHESIS_FIELDS = [
  ['agreement', 'Agreement'],
  ['conflict', 'Conflict'],
  ['missing_information', 'Missing Information'],
  ['next_best_question', 'Next Best Question'],
];

function validateFields(data, fields) {
  return fields.every(([key]) => typeof data?.[key] === 'string' && data[key].trim());
}

function renderFields(container, data, fields) {
  container.innerHTML = '';

  fields.forEach(([key, label]) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'field-block';

    if (key === 'reasoning') {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const text = document.createElement('p');
      summary.textContent = 'Why?';
      text.textContent = data[key];
      details.append(summary, text);

      const term = document.createElement('dt');
      term.textContent = label;
      const desc = document.createElement('dd');
      desc.append(details);
      wrapper.append(term, desc);
    } else {
      const term = document.createElement('dt');
      const desc = document.createElement('dd');
      term.textContent = label;
      desc.textContent = data[key];
      wrapper.append(term, desc);
    }

    container.append(wrapper);
  });
}

function setCardStatus(card, status) {
  const badge = card.querySelector('.status');
  badge.className = `status ${status}`;
  badge.textContent = status;
}

function setCardMessage(card, status, message) {
  setCardStatus(card, status);
  const body = card.querySelector('.structured-response');
  body.innerHTML = '';
  const note = document.createElement('p');
  note.className = 'state-message';
  note.textContent = message;
  body.append(note);
}

function setModelCard(id, result) {
  const card = cards[id];
  if (!card) return;

  const heading = card.querySelector('h2');
  if (result.name && heading) {
    heading.textContent = result.name;
  }

  if (result.status === 'error') {
    setCardMessage(card, 'error', result.error || 'This model could not return an answer.');
    return;
  }

  if (!validateFields(result.data, MODEL_FIELDS)) {
    setCardMessage(card, 'error', 'This model returned an invalid structured response.');
    return;
  }

  setCardStatus(card, 'success');
  renderFields(card.querySelector('.structured-response'), result.data, MODEL_FIELDS);
}

function setInsight(result) {
  if (!result) {
    setCardMessage(insightCard, 'idle', 'Synthesis will run after both model responses are available.');
    return;
  }

  if (result.status === 'error') {
    setCardMessage(insightCard, 'error', result.error || 'Synthesis could not be generated.');
    return;
  }

  if (!validateFields(result.data, SYNTHESIS_FIELDS)) {
    setCardMessage(insightCard, 'error', 'Synthesis returned an invalid structured response.');
    return;
  }

  setCardStatus(insightCard, 'success');
  renderFields(insightCard.querySelector('.structured-response'), result.data, SYNTHESIS_FIELDS);
}

function setLoadingState() {
  Object.keys(cards).forEach((id) => setCardMessage(cards[id], 'loading', 'Waiting for structured response…'));
  setCardMessage(insightCard, 'loading', 'Waiting for both model answers before synthesis…');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();

  if (!message) {
    input.focus();
    return;
  }

  activeRequestId += 1;
  const requestId = activeRequestId;

  if (activeController) {
    activeController.abort();
  }
  activeController = new AbortController();

  setLoadingState();
  submitButton.disabled = true;
  submitButton.textContent = 'Comparing…';

  try {
    const response = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: activeController.signal,
    });
    const data = await response.json();

    if (requestId !== activeRequestId) return;

    if (!response.ok) {
      throw new Error(data.error || 'Request failed.');
    }

    data.responses.forEach((result) => {
      setModelCard(result.id, result);
    });
    setInsight(data.synthesis);
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== activeRequestId) return;
    Object.keys(cards).forEach((id) => setCardMessage(cards[id], 'error', error.message));
    setCardMessage(insightCard, 'idle', 'Synthesis did not run because the comparison request failed.');
  } finally {
    if (requestId === activeRequestId) {
      submitButton.disabled = false;
      submitButton.textContent = 'Run comparison';
    }
  }
});

setInsight(null);
