import { GoogleGenerativeAI } from '@google/generative-ai';
import { callWithRetry } from '../utils/apiHelper';
import dotenv from 'dotenv';
dotenv.config();

export interface FootballFixture {
  id: number;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: Date;
  status: string; // e.g. FT, NS
  homeGoals: number | null;
  awayGoals: number | null;
  winner: 'HOME' | 'AWAY' | 'DRAW' | null;
}

export interface TeamStatistics {
  team: string;
  possession: string;
  shots: number;
  fouls: number;
}

export interface MatchStatsBundle {
  fixture: FootballFixture;
  stats: TeamStatistics[];
}

export interface FixtureResult {
  homeGoals: number;
  awayGoals: number;
  winner: 'HOME' | 'AWAY' | 'DRAW';
  status: string;
}

export class FootballService {
  private static getModel() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in the environment variables.');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
  }

  /**
   * Queries Gemini to fetch FIFA World Cup 2026 matches scheduled on a specific date (YYYY-MM-DD).
   */
  public static async getFixtures(date: string): Promise<FootballFixture[]> {
    const model = this.getModel();
    const prompt = `
You are a football data provider.
Return a list of matches scheduled for the FIFA World Cup 2026 that kickoff in the Indian Standard Time (IST) 24-hour cycle of the date: ${date} (format: YYYY-MM-DD).
Specifically, return matches that kick off between ${date}T04:00:00Z and the next day at 04:00:00Z in UTC.

Here is the official Group Stage Group assignments for the FIFA World Cup 2026 (draw completed Dec 5, 2025):
- Group A: Mexico, South Africa, South Korea, Czechia
- Group B: Canada, Bosnia and Herzegovina, Qatar, Switzerland
- Group C: Brazil, Morocco, Haiti, Scotland
- Group D: United States, Paraguay, Australia, Türkiye
- Group E: Germany, Curaçao, Ivory Coast, Ecuador
- Group F: Netherlands, Japan, Sweden, Tunisia
- Group G: Belgium, Egypt, Iran, New Zealand
- Group H: Spain, Cape Verde, Saudi Arabia, Uruguay
- Group I: France, Senegal, Iraq, Norway
- Group J: Argentina, Algeria, Austria, Jordan
- Group K: Portugal, DR Congo, Uzbekistan, Colombia
- Group L: England, Croatia, Ghana, Panama

IMPORTANT:
- Use the actual/official FIFA World Cup 2026 match schedule and matchups.
- You MUST NOT return any placeholder team names like "Group A Opponent", "Group B Opponent", "Play-off Winner", "TBD", "A2", "B1", etc. All match team names MUST be resolved to the actual countries listed in the groups above.
- For example:
  - On June 11, 2026 local time: Mexico plays South Africa (Group A) in Mexico City, and South Korea plays Czechia (Group A) in Guadalajara.
    In IST (which is 5.5 hours ahead of UTC and 11.5 hours ahead of Mexico), these matches kick off in the early hours of June 12 (12:30 AM IST for Mexico vs South Africa, and 7:30 AM IST for South Korea vs Czechia). Both of these kickoffs fall between 2026-06-11T04:00:00Z and 2026-06-12T04:00:00Z (UTC).
    Therefore, for date "2026-06-11", you must return these two matches:
      1. Mexico vs South Africa (kickoffTime: 2026-06-11T19:00:00Z)
      2. South Korea vs Czechia (kickoffTime: 2026-06-12T02:00:00Z)
  - On June 12, 2026 local time: Canada plays Bosnia and Herzegovina (Group B) in Toronto, and United States plays Paraguay (Group D) in Los Angeles.
    In IST, these kick off on June 13 (12:30 AM IST for Canada vs Bosnia, and 6:30 AM IST for United States vs Paraguay). Both fall between 2026-06-12T04:00:00Z and 2026-06-13T04:00:00Z (UTC).
    Therefore, for date "2026-06-12", you must return:
      1. Canada vs Bosnia and Herzegovina (kickoffTime: 2026-06-12T19:00:00Z)
      2. United States vs Paraguay (kickoffTime: 2026-06-13T01:00:00Z)
  - Apply this logic for all dates throughout the tournament. Calculate the correct kickoff times in UTC and ensure they fall in the given YYYY-MM-DD IST day (from YYYY-MM-DDT04:00:00Z to YYYY-MM-DDT04:00:00Z next day).
- If there are no matches scheduled to kick off in this window, return an empty array [].

Output must be a JSON array of objects conforming to this schema:
[
  {
    "id": number (a unique integer for this match, e.g., 101, 102),
    "homeTeam": "Home Team Name",
    "awayTeam": "Away Team Name",
    "kickoffTime": "ISO 8601 UTC date string (e.g. 2026-06-11T19:00:00Z)",
    "status": "NS",
    "homeGoals": null,
    "awayGoals": null,
    "winner": null
  }
]

Ensure you return ONLY the JSON array matching this schema. No markdown wrapping.
`;

    console.log(`[AI Football] Fetching fixtures for ${date} from Gemini...`);
    const result = await callWithRetry(() => model.generateContent(prompt));
    const text = result.response.text().trim();

    try {
      const response = JSON.parse(text);
      if (!Array.isArray(response)) return [];

      return response.map((item: any) => ({
        id: Number(item.id),
        homeTeam: String(item.homeTeam),
        awayTeam: String(item.awayTeam),
        kickoffTime: new Date(item.kickoffTime),
        status: String(item.status || 'NS'),
        homeGoals: item.homeGoals !== null ? Number(item.homeGoals) : null,
        awayGoals: item.awayGoals !== null ? Number(item.awayGoals) : null,
        winner: item.winner || null,
      }));
    } catch (err) {
      console.error(`[AI Football] Failed to parse fixtures JSON for ${date}:`, text);
      return [];
    }
  }

  /**
   * Queries Gemini to get the final score, goals, and winner of a completed matchup on a specific date.
   */
  public static async getFixtureResult(homeTeam: string, awayTeam: string, date: string): Promise<FixtureResult> {
    const model = this.getModel();
    const prompt = `
You are a football statistics provider.
Retrieve the completed final result of the FIFA World Cup 2026 match between "${homeTeam}" and "${awayTeam}".
The date provided is ${date} (format: YYYY-MM-DD) which is in the Indian Standard Time (IST) zone. The match might have been played on ${date} or the previous calendar day local time (since local match time in North America is behind IST).

Provide realistic scores and outcomes based on the match. If the match is not scheduled or has not completed yet, simulate a highly realistic outcome based on team strength and match context.

Output must be a JSON object conforming to this schema:
{
  "homeGoals": number (goals scored by home team),
  "awayGoals": number (goals scored by away team),
  "winner": "HOME" | "AWAY" | "DRAW",
  "status": "FT"
}

Ensure you return ONLY the JSON object matching this schema. No markdown wrapping.
`;

    console.log(`[AI Football] Fetching match result for ${homeTeam} vs ${awayTeam} on ${date} from Gemini...`);
    const result = await callWithRetry(() => model.generateContent(prompt));
    const text = result.response.text().trim();

    try {
      const item = JSON.parse(text);
      return {
        homeGoals: Number(item.homeGoals),
        awayGoals: Number(item.awayGoals),
        winner: item.winner,
        status: String(item.status || 'FT'),
      };
    } catch (err) {
      console.error(`[AI Football] Failed to parse result JSON for ${homeTeam} vs ${awayTeam}:`, text);
      throw new Error(`Failed to retrieve fixture result from AI: ${err}`);
    }
  }

  /**
   * Queries Gemini to retrieve completed matches and team statistics (possession, shots, fouls) for a date.
   */
  public static async getMatchesWithStats(date: string): Promise<MatchStatsBundle[]> {
    const model = this.getModel();
    const prompt = `
You are a football statistics provider.
Return all completed matches and their detailed team statistics (ball possession, total shots, fouls) for the FIFA World Cup 2026 matches that kicked off in the Indian Standard Time (IST) 24-hour cycle of the date: ${date} (format: YYYY-MM-DD).
Specifically, return matches that kicked off between ${date}T04:00:00Z and the next day at 04:00:00Z in UTC.

Here is the official Group Stage Group assignments for the FIFA World Cup 2026 (draw completed Dec 5, 2025):
- Group A: Mexico, South Africa, South Korea, Czechia
- Group B: Canada, Bosnia and Herzegovina, Qatar, Switzerland
- Group C: Brazil, Morocco, Haiti, Scotland
- Group D: United States, Paraguay, Australia, Türkiye
- Group E: Germany, Curaçao, Ivory Coast, Ecuador
- Group F: Netherlands, Japan, Sweden, Tunisia
- Group G: Belgium, Egypt, Iran, New Zealand
- Group H: Spain, Cape Verde, Saudi Arabia, Uruguay
- Group I: France, Senegal, Iraq, Norway
- Group J: Argentina, Algeria, Austria, Jordan
- Group K: Portugal, DR Congo, Uzbekistan, Colombia
- Group L: England, Croatia, Ghana, Panama

IMPORTANT:
- Use the actual/official FIFA World Cup 2026 match schedule and matchups.
- You MUST NOT return any placeholder team names like "Group A Opponent", "Group B Opponent", "Play-off Winner", "TBD", "A2", "B1", etc. All match team names MUST be resolved to the actual countries listed in the groups above.
- If no matches were played/completed in this window, return an empty array [].
- For team statistics, provide realistic values for:
  - Ball Possession (e.g. "55%")
  - Total Shots (integer)
  - Fouls (integer)

Output must be a JSON array of objects conforming to this schema:
[
  {
    "fixture": {
      "id": number (unique integer),
      "homeTeam": "Home Team Name",
      "awayTeam": "Away Team Name",
      "kickoffTime": "ISO 8601 UTC date string (e.g. 2026-06-11T19:00:00Z)",
      "status": "FT",
      "homeGoals": number,
      "awayGoals": number,
      "winner": "HOME" | "AWAY" | "DRAW"
    },
    "stats": [
      { "team": "Home Team Name", "possession": "Possession %", "shots": number, "fouls": number },
      { "team": "Away Team Name", "possession": "Possession %", "shots": number, "fouls": number }
    ]
  }
]

Ensure you return ONLY the JSON array matching this schema. No markdown wrapping.
`;

    console.log(`[AI Football] Fetching matches with stats for ${date} from Gemini...`);
    const result = await callWithRetry(() => model.generateContent(prompt));
    const text = result.response.text().trim();

    try {
      const response = JSON.parse(text);
      if (!Array.isArray(response)) return [];

      return response.map((item: any) => ({
        fixture: {
          id: Number(item.fixture.id),
          homeTeam: String(item.fixture.homeTeam),
          awayTeam: String(item.fixture.awayTeam),
          kickoffTime: new Date(item.fixture.kickoffTime),
          status: String(item.fixture.status || 'FT'),
          homeGoals: Number(item.fixture.homeGoals),
          awayGoals: Number(item.fixture.awayGoals),
          winner: item.fixture.winner,
        },
        stats: item.stats.map((s: any) => ({
          team: String(s.team),
          possession: String(s.possession),
          shots: Number(s.shots),
          fouls: Number(s.fouls),
        })),
      }));
    } catch (err) {
      console.error(`[AI Football] Failed to parse matches stats JSON for ${date}:`, text);
      return [];
    }
  }

  /**
   * Queries Gemini to fetch all 48 participating teams in the FIFA World Cup 2026.
   */
  public static async getTeams(): Promise<any[]> {
    const model = this.getModel();
    const prompt = `
You are a football database provider.
List the 48 participating national teams in the FIFA World Cup 2026.
Output must be a JSON array of objects conforming to this schema:
[
  {
    "team": {
      "id": number (unique team ID),
      "name": "Country Name",
      "code": "3-letter ISO Code (e.g. ARG, USA)",
      "country": "Country Name"
    }
  }
]

Ensure you return ONLY the JSON array matching this schema. No markdown wrapping.
`;

    console.log('[AI Football] Fetching participating teams from Gemini...');
    const result = await callWithRetry(() => model.generateContent(prompt));
    const text = result.response.text().trim();

    try {
      const response = JSON.parse(text);
      return Array.isArray(response) ? response : [];
    } catch (err) {
      console.error('[AI Football] Failed to parse teams JSON:', text);
      return [];
    }
  }

  /**
   * Queries Gemini to fetch the complete match schedule for the FIFA World Cup 2026.
   */
  public static async getAllSeasonFixtures(): Promise<any[]> {
    const model = this.getModel();
    const prompt = `
You are a football database provider.
Return the complete match schedule of the FIFA World Cup 2026.
Output must be a JSON array of objects conforming to this schema:
[
  {
    "fixture": {
      "id": number (unique match ID),
      "date": "ISO 8601 date string",
      "venue": {
        "name": "Stadium Name",
        "city": "City Name"
      },
      "status": {
        "long": "Not Started"
      }
    },
    "teams": {
      "home": { "name": "Home Team Name" },
      "away": { "name": "Away Team Name" }
    }
  }
]

Ensure you return ONLY the JSON array matching this schema. No markdown wrapping.
`;

    console.log('[AI Football] Fetching complete World Cup schedule from Gemini...');
    const result = await callWithRetry(() => model.generateContent(prompt));
    const text = result.response.text().trim();

    try {
      const response = JSON.parse(text);
      return Array.isArray(response) ? response : [];
    } catch (err) {
      console.error('[AI Football] Failed to parse season fixtures JSON:', text);
      return [];
    }
  }
}
