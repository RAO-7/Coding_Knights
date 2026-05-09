const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function getClient() {
  if (!_client && process.env.ANTHROPIC_API_KEY)
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

async function analyseDistress(message, shipContext) {
  const client = getClient();
  if (!client) return fallbackDistressAnalysis(message, shipContext);

  const systemPrompt = `You are a maritime emergency analyst. Extract structured information from a captain's distress message.
Respond ONLY with a valid JSON object — no markdown, no explanation.
Required fields:
{
  "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW",
  "category": "MEDICAL"|"MECHANICAL"|"NAVIGATION"|"SECURITY"|"WEATHER"|"FIRE"|"COLLISION"|"OTHER",
  "summary": "one sentence summary",
  "injuryCount": number or null,
  "injuryDetails": string or null,
  "damageDescription": string or null,
  "estimatedDamageUSD": number or null,
  "immediateAssistanceNeeded": boolean,
  "assistanceType": "MEDICAL"|"TUG"|"FUEL"|"ESCORT"|"FIREFIGHTING"|"NONE",
  "canContinueVoyage": boolean,
  "recommendedAction": "one sentence recommended action for command"
}`;

  const userPrompt = `Ship: ${shipContext.name} (${shipContext.id})
Position: ${shipContext.lat?.toFixed(4)}, ${shipContext.lng?.toFixed(4)}
Cargo: ${shipContext.cargo}
Fuel: ${shipContext.fuel?.toFixed(1)}%
Speed: ${shipContext.speed} knots
Captain's message: "${message}"`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });
    const text = response.content[0]?.text || '{}';
    const analysis = JSON.parse(text.replace(/```json|```/g, '').trim());
    return { ...analysis, raw: message, analysedAt: new Date().toISOString(), source: 'ai' };
  } catch (err) {
    console.error('[AI] Distress analysis failed:', err.message);
    return fallbackDistressAnalysis(message, shipContext);
  }
}

async function getFleetAdvice(ships, alerts, zones) {
  const client = getClient();
  if (!client) return [];

  const distressedShips = ships.filter((s) =>
    ['distressed', 'stopped', 'stranded', 'insufficient_fuel'].includes(s.status)
  );
  const lowFuelShips = ships.filter((s) => s.fuel < 20);
  if (!distressedShips.length && !lowFuelShips.length && !alerts.length) return [];

  const systemPrompt = `You are a maritime fleet operations advisor AI.
Provide up to 3 concrete, actionable suggestions for the command operator.
Respond ONLY with a JSON array:
[{
  "id": "short-id",
  "priority": "CRITICAL"|"HIGH"|"MEDIUM",
  "action": "short action title",
  "detail": "1-2 sentence explanation with ship names and reasoning",
  "shipIds": ["SHIP-XXX"],
  "type": "REROUTE"|"SEND_AID"|"DRAW_ZONE"|"FUEL_TRANSFER"|"MEDICAL"|"MONITOR"
}]`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: JSON.stringify({
          distressedShips: distressedShips.map((s) => ({ id: s.id, name: s.name, status: s.status })),
          lowFuelShips: lowFuelShips.map((s) => ({ id: s.id, name: s.name, fuel: s.fuel })),
          activeAlertCount: alerts.filter((a) => !a.acknowledged).length,
          activeZones: zones.length,
        }),
      }],
      system: systemPrompt,
    });
    const text = response.content[0]?.text || '[]';
    const advice = JSON.parse(text.replace(/```json|```/g, '').trim());
    return advice.map((a) => ({ ...a, generatedAt: new Date().toISOString() }));
  } catch (err) {
    console.error('[AI] Fleet advice failed:', err.message);
    return [];
  }
}

function fallbackDistressAnalysis(message, shipContext) {
  const lower = message.toLowerCase();
  let severity = 'MEDIUM', category = 'OTHER', injuryCount = null;
  if (/fire|flame|burning/.test(lower))           { severity = 'CRITICAL'; category = 'FIRE'; }
  else if (/collision|crash|hit|struck/.test(lower)) { severity = 'CRITICAL'; category = 'COLLISION'; }
  else if (/injured|wound|dead|casualt|medic/.test(lower)) { severity = 'HIGH'; category = 'MEDICAL'; }
  else if (/engine|mechanical|broke|failure|power/.test(lower)) { severity = 'HIGH'; category = 'MECHANICAL'; }
  else if (/weather|storm|wave|gale/.test(lower)) { severity = 'MEDIUM'; category = 'WEATHER'; }

  const m = lower.match(/(\d+)\s*(injur|wound|crew|casualt)/);
  if (m) injuryCount = parseInt(m[1]);

  return {
    severity, category,
    summary: message.slice(0, 120),
    injuryCount, injuryDetails: injuryCount ? `${injuryCount} crew members affected` : null,
    damageDescription: null, estimatedDamageUSD: null,
    immediateAssistanceNeeded: severity === 'CRITICAL',
    assistanceType: category === 'MEDICAL' ? 'MEDICAL' : category === 'FIRE' ? 'FIREFIGHTING' : 'NONE',
    canContinueVoyage: severity !== 'CRITICAL',
    recommendedAction: `Monitor ${shipContext.name} — ${severity} priority distress`,
    raw: message, analysedAt: new Date().toISOString(), source: 'fallback',
  };
}

module.exports = { analyseDistress, getFleetAdvice };