import { GoogleGenerativeAI } from '@google/generative-ai';
import { MatchStatsBundle } from './football';
import { callWithRetry } from '../utils/apiHelper';
import dotenv from 'dotenv';
dotenv.config();

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export class AIService {
  private static getModel() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in the environment variables.');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    // Using gemini-2.0-flash as it is fast, highly capable, and cost-effective
    return genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
  }

  /**
   * Generates a quiz with 10 questions based on yesterday's match bundles.
   */
  public static async generateDailyQuiz(matches: MatchStatsBundle[]): Promise<QuizQuestion[]> {
    const model = this.getModel();

    const dataPrompt = JSON.stringify(matches, null, 2);

    const prompt = `
You are a football trivia expert creating content for a casual FIFA World Cup 2026 Discord community.
Analyze the following JSON data representing yesterday's FIFA World Cup matches and their team statistics:

${dataPrompt}

Generate exactly 10 multiple-choice trivia questions based on this data.

Requirements:
1. Questions must be easy to understand and suitable for casual football fans. Avoid overly technical metrics (e.g. expected goals xG, complex defensive structures). Focus on simple stats like goals, winners, possession, shots, team matchups, etc.
2. Each question must have exactly 4 options.
3. Provide a 0-indexed 'correctAnswerIndex' representing the correct option (0, 1, 2, or 3).
4. Provide a brief, engaging, and friendly explanation of the answer.
5. If there are no matches yesterday or not enough matches to make 10 distinct, simple questions, you MUST fill the remaining questions with fun, general, historic FIFA World Cup trivia questions (e.g., historical winners, famous goals, legendary players) to make exactly 10 questions.
6. The response must be a single JSON array of objects with the following format:
[
  {
    "question": "Which team won the match between Germany and France?",
    "options": ["Germany", "France", "Draw", "Match was postponed"],
    "correctAnswerIndex": 0,
    "explanation": "Germany won the match 2-1 against France yesterday with a late winning goal."
  }
]

Ensure you return ONLY the JSON array matching this schema.
`;

    console.log('Sending request to Gemini API to generate daily quiz...');
    const result = await callWithRetry(() => model.generateContent(prompt));
    const responseText = result.response.text().trim();

    try {
      const questions: QuizQuestion[] = JSON.parse(responseText);
      if (!Array.isArray(questions) || questions.length !== 10) {
        throw new Error(`Expected exactly 10 questions, got ${questions ? questions.length : 0}`);
      }

      // Perform a quick validation of the question structure
      for (const q of questions) {
        if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || typeof q.correctAnswerIndex !== 'number' || !q.explanation) {
          throw new Error(`Invalid question structure in response: ${JSON.stringify(q)}`);
        }
      }

      return questions;
    } catch (error) {
      console.error('Failed to parse AI response as valid quiz JSON. Raw response was:', responseText);
      throw new Error(`AI generated invalid quiz JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
