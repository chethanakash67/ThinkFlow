const OpenAI = require('openai');

const openAIKey = String(process.env.OPENAI_API_KEY || '').trim();
const hasOpenAIKey = Boolean(
  openAIKey &&
  openAIKey.toLowerCase() !== 'your_openai_api_key_here' &&
  openAIKey !== 'YOUR_OPENAI_API_KEY'
);

const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';
const openai = hasOpenAIKey ? new OpenAI({ apiKey: openAIKey }) : null;

const OPENAI_MODEL_ALIASES = {
  'gpt-4.1 mini': 'gpt-4.1-mini',
  'gpt 4.1 mini': 'gpt-4.1-mini',
  'gpt4.1 mini': 'gpt-4.1-mini',
  '4.1 mini': 'gpt-4.1-mini',
  'gpt-4o mini': 'gpt-4o-mini',
  'gpt 4o mini': 'gpt-4o-mini',
  'gpt4o mini': 'gpt-4o-mini',
  '4o mini': 'gpt-4o-mini'
};

const normalizeOpenAIModel = (modelName) => {
  const rawModelName = String(modelName || DEFAULT_OPENAI_MODEL).trim();
  if (!rawModelName) return DEFAULT_OPENAI_MODEL;

  const lowerModelName = rawModelName.toLowerCase().replace(/\s+/g, ' ');
  if (OPENAI_MODEL_ALIASES[lowerModelName]) {
    return OPENAI_MODEL_ALIASES[lowerModelName];
  }

  return lowerModelName.replace(/\s+/g, '-');
};

const getOpenAIModel = () => normalizeOpenAIModel(process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL);

const extractResponseText = (response) => {
  if (typeof response?.output_text === 'string') {
    return response.output_text.trim();
  }

  const textParts = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join('\n').trim();
};

const generateAIText = async ({
  prompt,
  instructions = 'You are ThinkFlow AI. Return concise, useful output.',
  json = false,
  maxOutputTokens = 1600,
  temperature = 0.2
}) => {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const request = {
    model: getOpenAIModel(),
    instructions,
    input: String(prompt || ''),
    max_output_tokens: maxOutputTokens,
    store: false,
    temperature
  };

  if (json) {
    request.text = {
      format: { type: 'json_object' }
    };
  }

  const response = await openai.responses.create(request);
  const text = extractResponseText(response);

  if (!text) {
    throw new Error('OpenAI returned an empty response');
  }

  return text;
};

module.exports = {
  generateAIText,
  getOpenAIModel,
  hasOpenAIKey,
  normalizeOpenAIModel
};
