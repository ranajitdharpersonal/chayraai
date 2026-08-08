import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { ai } from './registry';

// Initialize Firebase Admin (Only once) - Modern Modular Approach
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

export class PredictiveMemoryBank {
  
  // 1. Save Session State (Persistent Memory)
  static async saveSituationState(sessionId: string, data: any) {
    console.log(`[Memory Bank]: Committing state to Firestore for session ${sessionId}...`);
    const docRef = db.collection('crisis_memory').doc(sessionId);
    await docRef.set({
      ...data,
      timestamp: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  // 2. Retrieve Past Context
  static async getSituationHistory(sessionId: string) {
    const docRef = db.collection('crisis_memory').doc(sessionId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }
    return doc.data();
  }

  // 3. The "Resilience" Engine (Predicting the future from memory)
  static async predictThreatEvolution(sessionId: string): Promise<string> {
    console.log(`[Memory Bank]: Analyzing historical state for prediction...`);
    const history = await this.getSituationHistory(sessionId);
    
    if (!history) {
      return "Insufficient historical data to generate resilience insights.";
    }

    try {
      const { text } = await ai.generate({
        prompt: `
          You are the Predictive Memory Engine for an Enterprise Crisis Fleet.
          Analyze the following saved situation history and predict the next likely threat evolution within 24 hours.
          Keep the output to 2 concise sentences, focusing on preparedness.
          
          Situation History: ${JSON.stringify(history)}
        `
      });
      return text;
    } catch (error) {
      console.error("[Memory Bank]: Prediction generation failed.", error);
      return "Prediction engine currently offline. Please rely on live radar.";
    }
  }
}