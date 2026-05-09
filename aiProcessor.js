// server/aiProcessor.js
async function extractDistressData(text) {
  const prompt = `Analyze this ship distress message: "${text}". 
  Return ONLY a JSON object with: 
  { "severity": "low|high|critical", "injuries": number, "damage_details": "string" }`;
  
  // Call your AI API here
  const response = await aiClient.generate(prompt);
  return JSON.parse(response); 
}
