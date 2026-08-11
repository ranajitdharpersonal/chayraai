import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { vertexAI } from './registry'; // 🛑 NEW: Vertex AI Import for the Prediction Engine

// 1. Enterprise Initialization (Explicit Credentials Fix for GCP Authentication)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
      // The magic regex fix for the newline issue!
      privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
}
const db = getFirestore();

// Initialize the native model for prediction
const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export class PredictiveMemoryBank {
  
  // 1. Enterprise Session State Logging
  static async saveSituationState(sessionId: string, data: any) {
    console.log(`[Memory Bank]: Committing enterprise state to Firestore for session ${sessionId}...`);
    try {
      const docRef = db.collection('chayra_enterprise_memory').doc(sessionId);
      
      // The Enterprise Data Structure demanded by the Audit
      await docRef.set({
        situationContext: data.lastInput || "UNKNOWN",
        threatLevel: data.threatLevel || "LOW",
        activeIntel: data.intel || "NONE",
        systemVersion: "3.0.0",
        lastUpdated: FieldValue.serverTimestamp(),
        eventLog: FieldValue.arrayUnion({
          eventTime: new Date().toISOString(),
          eventType: "SWARM_CYCLE_COMPLETE",
          agentsDeployed: ["MindGuard", "Scavenger", "Radar", "Medical", "Navigator", "Vault", "Verifier"]
        })
      }, { merge: true });
      
    } catch (error) {
      console.error("[Memory Bank]: Critical DB Sync Failure.", error);
      throw new Error("Enterprise Database Connection Failed. Please verify GCP Service Account.");
    }
  }

  // 2. Historical Retrieval
  static async getSituationHistory(sessionId: string) {
    console.log(`[Memory Bank]: Retrieving historical threat data for ${sessionId}...`);
    try {
      const docRef = db.collection('chayra_enterprise_memory').doc(sessionId);
      const doc = await docRef.get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      console.error("[Memory Bank]: Retrieval Failed.", error);
      return null;
    }
  }

  // 3. The "Resilience" Engine (Predicting the future from memory - NOW VERTEX AI POWERED!)
  static async predictThreatEvolution(sessionId: string): Promise<string> {
    console.log(`[Memory Bank]: Analyzing historical state for prediction...`);
    const history = await this.getSituationHistory(sessionId);
    
    if (!history) {
      return "Insufficient historical data to generate resilience insights.";
    }

    try {
      const prompt = `
        You are the Predictive Memory Engine for an Enterprise Crisis Fleet.
        Analyze the following saved situation history and predict the next likely threat evolution within 24 hours.
        Keep the output to 2 concise sentences, focusing on preparedness.
        
        Situation History: ${JSON.stringify(history)}
      `;
      
      // 🛑 Upgraded from ai.generate (Genkit) to Native GCP Vertex AI
      const resp = await generativeModel.generateContent(prompt);
      return resp.response.candidates?.[0].content.parts[0].text || "Prediction engine is standing by.";
    } catch (error) {
      console.error("[Memory Bank]: Prediction generation failed.", error);
      return "Prediction engine currently offline. Please rely on live radar.";
    }
  }
}