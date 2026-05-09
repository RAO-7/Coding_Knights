// Using a basic sentiment/keyword extractor or OpenAI/Gemini API
async function processDistress(message) {
  // Extracting structured info [cite: 71]
  const prompt = `Extract severity (low, high, critical) and damage details from: "${message}"`;
  const result = await aiProvider.generate(prompt); 
  return JSON.parse(result);
}
