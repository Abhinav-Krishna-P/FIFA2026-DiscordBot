import { GoogleGenerativeAI } from '@google/generative-ai';
import { MatchStatsBundle } from './football';
import { callWithRetry, cleanJSONString } from '../utils/apiHelper';
import dotenv from 'dotenv';
dotenv.config();

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
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
        responseSchema: {
          type: 'array',
          description: 'A list of exactly 10 multiple-choice trivia questions',
          items: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'The trivia question text'
              },
              options: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Exactly 4 multiple-choice options'
              },
              correctAnswerIndex: {
                type: 'integer',
                description: 'The 0-indexed index of the correct option (0, 1, 2, or 3)'
              }
            },
            required: ['question', 'options', 'correctAnswerIndex']
          }
        } as any
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

Generate exactly 10 multiple-choice trivia questions based on this data and historical World Cup trivia.

Requirements:
1. Distribution of Questions:
   - If there are matches in the JSON data above: The first 5 to 6 questions MUST be directly about yesterday's matches (e.g., who won, scorelines, possession, shots, team matchups, goal scorers from yesterday). The remaining questions (to make exactly 10 questions in total) MUST be interesting, general historical FIFA World Cup trivia questions.
   - If there are NO matches in the JSON data above: All 10 questions MUST be interesting, general historical FIFA World Cup trivia questions.
2. Avoid Common/Repetitive Questions:
   - For all general historical World Cup trivia questions, you MUST AVOID overly common, generic, or repetitive questions that appear in almost every daily quiz.
   - Do NOT ask questions such as:
     * "Who is the all-time top goal scorer in World Cup history?"
     * "Which team has won the most World Cups / cups?"
     * "Which country is hosting the 2026 World Cup?"
     * "How often is the World Cup held?"
     * "Which country won the first World Cup in 1930?"
   - Instead, generate unique, engaging, and less obvious historical trivia about the FIFA World Cup (e.g., iconic moments, lesser-known player/team records, unique match events, historic rule changes, mascot trivia, or specific historical match outcomes).
3. Question Structure:
   - Questions must be easy to understand and suitable for casual football fans. Avoid overly technical metrics (e.g. expected goals xG, complex defensive structures).
   - Each question must have exactly 4 options.
   - Provide a 0-indexed 'correctAnswerIndex' representing the correct option (0, 1, 2, or 3).
4. Output Format:
   - The response must be a single JSON array of objects with the following format:
[
  {
    "question": "Which team won the match between Germany and France?",
    "options": ["Germany", "France", "Draw", "Match was postponed"],
    "correctAnswerIndex": 0
  }
]

Ensure you return ONLY the JSON array matching this schema.
`;


    console.log('Sending request to Gemini API to generate daily quiz...');
    const result = await callWithRetry(() => model.generateContent(prompt));
    const responseText = result.response.text().trim();

    try {
      const cleanedText = cleanJSONString(responseText);
      const questions: QuizQuestion[] = JSON.parse(cleanedText);
      if (!Array.isArray(questions) || questions.length !== 10) {
        throw new Error(`Expected exactly 10 questions, got ${questions ? questions.length : 0}`);
      }

      // Perform a quick validation of the question structure
      for (const q of questions) {
        if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || typeof q.correctAnswerIndex !== 'number') {
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
