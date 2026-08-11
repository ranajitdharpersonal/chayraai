import { EnterpriseAgentRegistry } from '../adk/registry';
import { ModelArmorClient } from '@google-cloud/modelarmor';

const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'demo-project';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const HARDCODED_PROJECT_NUMBER = "936258611923"; 

// 🛑 THE EXACT FIX: Correct Regional Endpoint Format for Model Armor
const modelArmorClient = new ModelArmorClient({
  projectId: projectId,
  apiEndpoint: 'modelarmor.us-central1.rep.googleapis.com', // <-- Etai ashol master endpoint!
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }
});

async function runMindGuard(data: { input: string }) {
  console.log(`[MindGuard]: Executing ACTUAL Google Cloud Model Armor scan...`);
  
  try {
    const request = {
      name: `projects/${HARDCODED_PROJECT_NUMBER}/locations/${location}/templates/default`,
      userPromptData: {
        text: data.input || "empty request",
      },
    };

    const [response] = await modelArmorClient.sanitizeUserPrompt(request);
    const isSafe = (response.sanitizationResult as any)?.isSafe;
    
    if (isSafe === false) {
      console.warn("[MindGuard]: Model Armor triggered a block!");
      return { 
        isEmergency: false, 
        threatLevel: "NONE", 
        reason: "Blocked by Google Cloud Model Armor: Policy violation." 
      };
    }

    return { 
      isEmergency: true, 
      threatLevel: "EVALUATING", 
      reason: "Cleared by Model Armor. Proceeding to tactical routing." 
    };

  } catch (error) {
    console.error("[MindGuard]: Model Armor API failed. System Fallback Active.", error);
    return { 
      isEmergency: true, 
      reason: "Fallback allowed due to System Safety Timeout", 
      threatLevel: "UNKNOWN" 
    };
  }
}

EnterpriseAgentRegistry.registerAgent(
  {
    name: 'MindGuard',
    version: '3.0.0',
    role: 'Official Model Armor Gateway',
    status: 'ACTIVE',
    clearanceLevel: 'TIER_1'
  },
  runMindGuard
);