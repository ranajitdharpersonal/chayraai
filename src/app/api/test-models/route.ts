import { NextResponse } from 'next/server';
import { vertexAI } from '@/core/adk/registry';

export async function GET() {
  console.log("[Diagnostic]: Starting Next-Gen Model Availability Scan...");
  
  // Amra ekhon shudhu 3.5 Flash ar tar upper versions test korbo
  const modelsToTest = [
    'gemini-3.5-flash',
    'gemini-3.5-flash-001',
    'gemini-3.5-flash-002',
    'gemini-3.5-pro',
    'gemini-3.5-pro-001'
  ];

  let results = [];

  for (const modelName of modelsToTest) {
    console.log(`[Diagnostic]: Testing ${modelName}...`);
    try {
      const model = vertexAI.getGenerativeModel({ model: modelName });
      const resp = await model.generateContent("Reply with a single word: READY");
      const text = resp.response.candidates?.[0].content.parts[0].text;
      
      results.push({ 
        model: modelName, 
        status: "✅ ACTIVE", 
        response: text?.trim() 
      });
    } catch (error: any) {
      results.push({ 
        model: modelName, 
        status: "❌ OFFLINE / 404", 
        error: error.message 
      });
    }
  }

  return NextResponse.json({
    message: "Enterprise Vertex AI 3.5+ Diagnostic Report",
    scannedRegion: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    results: results
  });
}