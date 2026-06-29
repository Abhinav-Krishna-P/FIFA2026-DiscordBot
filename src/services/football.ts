import { GoogleGenerativeAI } from '@google/generative-ai';
import { callWithRetry, cleanJSONString } from '../utils/apiHelper';
import dotenv from 'dotenv';
dotenv.config();

// ===== Interfaces =====

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
  homeGoals: number | null;
  awayGoals: number | null;
  winner: 'HOME' | 'AWAY' | 'DRAW' | null;
  status: string;
}

// ===== API Game interface from worldcup26.ir =====

interface APIGame {
  _id: string;
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  home_scorers: string;
  away_scorers: string;
  group: string;
  matchday: string;
  local_date: string; // "MM/DD/YYYY HH:MM"
  persian_date: string;
  stadium_id: string;
  finished: string; // "TRUE" or "FALSE"
  time_elapsed: string; // "finished" or "notstarted"
  type: string; // "group", "r32", "r16", "qf", "sf", "final", "third"
  home_team_name_en?: string;
  away_team_name_en?: string;
  home_team_label?: string;
  away_team_label?: string;
}

// ===== API Cache =====

const API_BASE_URL = process.env.WORLD_CUP_API_BASE_URL || 'http://161.35.49.70:3050';
const API_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedGames: APIGame[] | null = null;
let cacheTimestamp = 0;

export class FootballService {

  // ===== Gemini Model (kept as fallback) =====

  private static getModel(withSearch = false) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in the environment variables.');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const config: any = {
      model: 'gemini-3.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };
    if (withSearch) {
      config.tools = [{ googleSearch: {} }];
    }
    return genAI.getGenerativeModel(config);
  }

  // ===== API Helper =====

  /**
   * Fetches all games from the worldcup26.ir API with caching.
   */
  private static async fetchGamesFromAPI(): Promise<APIGame[]> {
    const now = Date.now();
    if (cachedGames && (now - cacheTimestamp) < API_CACHE_TTL_MS) {
      console.log('[Football API] Using cached games data.');
      return cachedGames;
    }

    console.log('[Football API] Fetching fresh games data from worldcup26.ir...');
    const response = await fetch(`${API_BASE_URL}/get/games`);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.games || !Array.isArray(data.games)) {
      throw new Error('API response does not contain a valid games array.');
    }

    cachedGames = data.games as APIGame[];
    cacheTimestamp = now;
    console.log(`[Football API] Fetched ${cachedGames.length} games from API.`);
    return cachedGames;
  }

  /**
   * Parses the API's local_date string "MM/DD/YYYY HH:MM" and returns { dateStr: "YYYY-MM-DD", approxUTC: Date }.
   * Assumes approximate UTC-5 offset for US venue times (covers CDT/EDT closely enough).
   */
  private static parseLocalDate(localDate: string): { dateStr: string; approxUTC: Date } {
    // localDate format: "MM/DD/YYYY HH:MM"
    const parts = localDate.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!parts) {
      return { dateStr: '', approxUTC: new Date(0) };
    }

    const [, month, day, year, hour, minute] = parts;
    const dateStr = `${year}-${month}-${day}`;

    // Approximate UTC by assuming UTC-5 (most US World Cup venues are CDT/EDT range)
    const localMs = Date.UTC(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hour) + 5, parseInt(minute)
    );
    const approxUTC = new Date(localMs);

    return { dateStr, approxUTC };
  }

  /**
   * Converts an approximate UTC date to an IST date string (YYYY-MM-DD).
   */
  private static toISTDateString(utcDate: Date): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(utcDate);
  }

  /**
   * Returns the IST match window for a given date.
   * Window: date 10:00 AM IST (04:30 UTC) → date+1 9:30 AM IST (04:00 UTC next day)
   * All matches kicking off within this window are considered "today's matches".
   */
  private static getISTMatchWindow(date: string): { windowStart: Date; windowEnd: Date } {
    // date is YYYY-MM-DD
    const [year, month, day] = date.split('-').map(Number);

    // 10:00 AM IST = 04:30 UTC on the same day
    const windowStart = new Date(Date.UTC(year, month - 1, day, 4, 30, 0));

    // 9:30 AM IST next day = 04:00 UTC on the next day
    const windowEnd = new Date(Date.UTC(year, month - 1, day + 1, 4, 0, 0));

    return { windowStart, windowEnd };
  }

  /**
   * Normalizes team names for matching (handles Türkiye/Turkey, Czechia/Czech Republic, etc.)
   */
  private static normalizeTeamName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/türkiye/g, 'turkey')
      .replace(/czechia/g, 'czech republic')
      .replace(/dr congo/g, 'democratic republic of the congo')
      .replace(/cote d'ivoire/g, 'ivory coast')
      .replace(/côte d'ivoire/g, 'ivory coast')
      .replace(/korea republic/g, 'south korea')
      .replace(/republic of ireland/g, 'ireland')
      .replace(/bosnia-herzegovina/g, 'bosnia and herzegovina')
      .replace(/curacao/g, 'curaçao');
  }

  /**
   * Checks if two team names match (case-insensitive, with normalization).
   */
  private static teamsMatch(apiName: string, queryName: string): boolean {
    return this.normalizeTeamName(apiName) === this.normalizeTeamName(queryName);
  }

  /**
   * Parses the scorers string from the API into a readable format.
   */
  private static parseScorers(scorersStr: string): string[] {
    if (!scorersStr || scorersStr === 'null') return [];
    try {
      // The API returns scorers in a format like: {"Name 23'","Name 45'"}
      const cleaned = scorersStr
        .replace(/^\{/, '')
        .replace(/\}$/, '')
        .split('","')
        .map(s => s.replace(/^"|"$/g, '').trim())
        .filter(s => s.length > 0);
      return cleaned;
    } catch {
      return [];
    }
  }

  // ===== Public Methods =====

  /**
   * Fetches FIFA World Cup 2026 matches scheduled on a specific IST date (YYYY-MM-DD).
   * Primary source: worldcup26.ir API. Fallback: Gemini with Google Search.
   */
  public static async getFixtures(date: string): Promise<FootballFixture[]> {
    try {
      console.log(`[Football API] Fetching fixtures for IST date ${date}...`);
      const games = await this.fetchGamesFromAPI();

      // IST match window: date 10:00 AM IST → date+1 9:30 AM IST
      const { windowStart, windowEnd } = this.getISTMatchWindow(date);
      console.log(`[Football API] Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);

      const matchingGames = games.filter(game => {
        // Skip knockout matches with TBD teams
        if (!game.home_team_name_en && !game.away_team_name_en) return false;

        const { approxUTC } = this.parseLocalDate(game.local_date);
        // Check if match kickoff falls within the IST window
        return approxUTC >= windowStart && approxUTC < windowEnd;
      });

      // Filter for not-started matches only (for poll generation)
      const upcomingGames = matchingGames.filter(game => game.finished !== 'TRUE');

      console.log(`[Football API] Found ${upcomingGames.length} upcoming matches for ${date}.`);

      return upcomingGames.map(game => {
        const { approxUTC } = this.parseLocalDate(game.local_date);
        return {
          id: parseInt(game.id),
          homeTeam: game.home_team_name_en || game.home_team_label || 'TBD',
          awayTeam: game.away_team_name_en || game.away_team_label || 'TBD',
          kickoffTime: approxUTC,
          status: 'NS',
          homeGoals: null,
          awayGoals: null,
          winner: null,
        };
      });
    } catch (err) {
      console.error(`[Football API] API failed for getFixtures, falling back to Gemini:`, err);
      return this.getFixturesFromGemini(date);
    }
  }

  /**
   * Gets the final result of a completed match by team names.
   * Primary source: worldcup26.ir API. Fallback: Gemini with Google Search.
   */
  public static async getFixtureResult(homeTeam: string, awayTeam: string, date: string): Promise<FixtureResult> {
    try {
      console.log(`[Football API] Fetching result for ${homeTeam} vs ${awayTeam}...`);
      const games = await this.fetchGamesFromAPI();

      // Find matching game by team names (order-independent)
      const game = games.find(g => {
        const homeEn = g.home_team_name_en || '';
        const awayEn = g.away_team_name_en || '';
        return (
          (this.teamsMatch(homeEn, homeTeam) && this.teamsMatch(awayEn, awayTeam)) ||
          (this.teamsMatch(homeEn, awayTeam) && this.teamsMatch(awayEn, homeTeam))
        );
      });

      if (!game) {
        console.warn(`[Football API] Match not found in API for ${homeTeam} vs ${awayTeam}. Falling back to Gemini.`);
        return this.getFixtureResultFromGemini(homeTeam, awayTeam, date);
      }

      if (game.finished !== 'TRUE') {
        console.log(`[Football API] Match ${homeTeam} vs ${awayTeam} has not finished yet.`);
        return { homeGoals: null, awayGoals: null, winner: null, status: 'NS' };
      }

      const homeScore = parseInt(game.home_score);
      const awayScore = parseInt(game.away_score);

      // Determine if the queried homeTeam matches the API's home team
      const isOriginalOrder = this.teamsMatch(game.home_team_name_en || '', homeTeam);

      let finalHomeGoals: number;
      let finalAwayGoals: number;

      if (isOriginalOrder) {
        finalHomeGoals = homeScore;
        finalAwayGoals = awayScore;
      } else {
        // Teams are swapped compared to API order
        finalHomeGoals = awayScore;
        finalAwayGoals = homeScore;
      }

      let winner: 'HOME' | 'AWAY' | 'DRAW';
      if (finalHomeGoals > finalAwayGoals) {
        winner = 'HOME';
      } else if (finalAwayGoals > finalHomeGoals) {
        winner = 'AWAY';
      } else {
        winner = 'DRAW';
      }

      console.log(`[Football API] Result: ${homeTeam} ${finalHomeGoals} - ${finalAwayGoals} ${awayTeam} (${winner})`);
      return { homeGoals: finalHomeGoals, awayGoals: finalAwayGoals, winner, status: 'FT' };
    } catch (err) {
      console.error(`[Football API] API failed for getFixtureResult, falling back to Gemini:`, err);
      return this.getFixtureResultFromGemini(homeTeam, awayTeam, date);
    }
  }

  /**
   * Gets completed matches with stats for quiz generation.
   * Primary source: worldcup26.ir API (scores + scorers). Stats estimated.
   * Fallback: Gemini with Google Search.
   */
  public static async getMatchesWithStats(date: string): Promise<MatchStatsBundle[]> {
    try {
      console.log(`[Football API] Fetching matches with stats for IST date ${date}...`);
      const games = await this.fetchGamesFromAPI();

      // IST match window: date 10:00 AM IST → date+1 9:30 AM IST
      const { windowStart, windowEnd } = this.getISTMatchWindow(date);
      console.log(`[Football API] Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);

      // Filter finished games within the IST match window
      const matchingGames = games.filter(game => {
        if (game.finished !== 'TRUE') return false;
        if (!game.home_team_name_en) return false;

        const { approxUTC } = this.parseLocalDate(game.local_date);
        return approxUTC >= windowStart && approxUTC < windowEnd;
      });

      console.log(`[Football API] Found ${matchingGames.length} finished matches for ${date}.`);

      return this.mapGamesToMatchBundles(matchingGames);
    } catch (err) {
      console.error(`[Football API] API failed for getMatchesWithStats, falling back to Gemini:`, err);
      return this.getMatchesWithStatsFromGemini(date);
    }
  }

  /**
   * Maps API games to MatchStatsBundle format for quiz generation.
   */
  private static mapGamesToMatchBundles(games: APIGame[]): MatchStatsBundle[] {
    return games.map(game => {
      const homeScore = parseInt(game.home_score) || 0;
      const awayScore = parseInt(game.away_score) || 0;
      const homeTeam = game.home_team_name_en || 'Unknown';
      const awayTeam = game.away_team_name_en || 'Unknown';
      const { approxUTC } = this.parseLocalDate(game.local_date);

      let winner: 'HOME' | 'AWAY' | 'DRAW';
      if (homeScore > awayScore) winner = 'HOME';
      else if (awayScore > homeScore) winner = 'AWAY';
      else winner = 'DRAW';

      // Parse scorers for richer quiz data
      const homeScorers = this.parseScorers(game.home_scorers);
      const awayScorers = this.parseScorers(game.away_scorers);

      return {
        fixture: {
          id: parseInt(game.id),
          homeTeam,
          awayTeam,
          kickoffTime: approxUTC,
          status: 'FT',
          homeGoals: homeScore,
          awayGoals: awayScore,
          winner,
        },
        stats: [
          {
            team: homeTeam,
            possession: '50%', // API doesn't provide stats, use placeholder
            shots: homeScore * 4 + 5, // Rough estimate for quiz variety
            fouls: 10 + Math.floor(Math.random() * 6),
          },
          {
            team: awayTeam,
            possession: '50%',
            shots: awayScore * 4 + 5,
            fouls: 10 + Math.floor(Math.random() * 6),
          },
        ],
        // Attach scorer info as extra data for the quiz AI
        scorers: {
          home: homeScorers,
          away: awayScorers,
        },
      } as MatchStatsBundle & { scorers: any };
    });
  }

  // ===== Gemini Fallback Methods =====

  private static async getFixturesFromGemini(date: string): Promise<FootballFixture[]> {
    const model = this.getModel(true);
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

    console.log(`[AI Football Fallback] Fetching fixtures for ${date} from Gemini...`);
    const result = await callWithRetry(() => model.generateContent(prompt));
    const text = result.response.text().trim();

    try {
      const response = JSON.parse(cleanJSONString(text));
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
      console.error(`[AI Football Fallback] Failed to parse fixtures JSON for ${date}:`, text);
      return [];
    }
  }

  private static async getFixtureResultFromGemini(homeTeam: string, awayTeam: string, date: string): Promise<FixtureResult> {
    const model = this.getModel(true);
    const prompt = `
You are a football statistics provider.
Search Google for the completed final result of the FIFA World Cup 2026 match between "${homeTeam}" and "${awayTeam}".
The date provided is ${date} (format: YYYY-MM-DD) which is in the Indian Standard Time (IST) zone. The match might have been played on ${date} or the previous calendar day local time (since local match time in North America is behind IST).

IMPORTANT:
- Use Google Search to find the actual real-world score, winner, and status.
- If the match has completed, return the actual goals, winner ("HOME" | "AWAY" | "DRAW"), and set status to "FT".
- If the match is currently live, set status to "LIVE".
- If the match has not started yet, is postponed, or is not scheduled, set status to "NS", homeGoals/awayGoals to null, and winner to null.
- CRITICAL: If you are unable to find or verify the correct real-world match score from Google Search for the FIFA World Cup 2026, you MUST set status to "NS", homeGoals/awayGoals to null, and winner to null. Do NOT return "FT" or simulate/hallucinate any fake result under any circumstances.

Output must be a JSON object conforming to this schema:
{
  "homeGoals": number | null,
  "awayGoals": number | null,
  "winner": "HOME" | "AWAY" | "DRAW" | null,
  "status": "FT" | "LIVE" | "NS"
}

Ensure you return ONLY the JSON object matching this schema. No markdown wrapping.
`;

    console.log(`[AI Football Fallback] Fetching match result for ${homeTeam} vs ${awayTeam} on ${date} from Gemini...`);
    const result = await callWithRetry(() => model.generateContent(prompt));
    const text = result.response.text().trim();

    try {
      const item = JSON.parse(cleanJSONString(text));
      return {
        homeGoals: item.homeGoals !== null && item.homeGoals !== undefined ? Number(item.homeGoals) : null,
        awayGoals: item.awayGoals !== null && item.awayGoals !== undefined ? Number(item.awayGoals) : null,
        winner: item.winner || null,
        status: String(item.status || 'FT'),
      };
    } catch (err) {
      console.error(`[AI Football Fallback] Failed to parse result JSON for ${homeTeam} vs ${awayTeam}:`, text);
      throw new Error(`Failed to retrieve fixture result from AI: ${err}`);
    }
  }

  private static async getMatchesWithStatsFromGemini(date: string): Promise<MatchStatsBundle[]> {
    const model = this.getModel(true);
    const prompt = `
You are a football statistics provider.
Search Google for and return all completed matches and their detailed team statistics (ball possession, total shots, fouls) for the FIFA World Cup 2026 matches that kicked off in the Indian Standard Time (IST) 24-hour cycle of the date: ${date} (format: YYYY-MM-DD).
Specifically, return matches that kicked off between ${date}T04:00:00Z and the next day at 04:00:00Z in UTC.

IMPORTANT:
- Use Google Search to find the actual real-world completed match matchups, final scores, and statistics (possession, shots, fouls) for the World Cup 2026 on ${date}.
- If no matches were played/completed in this window, return an empty array [].
- CRITICAL: If you are unable to find or verify the correct real-world completed matches and their stats for the FIFA World Cup 2026 on this date, you MUST return an empty array []. Under no circumstances should you generate or simulate fake match scores or stats if they are not confirmed in the real world.

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

    console.log(`[AI Football Fallback] Fetching matches with stats for ${date} from Gemini...`);
    const result = await callWithRetry(() => model.generateContent(prompt));
    const text = result.response.text().trim();

    try {
      const response = JSON.parse(cleanJSONString(text));
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
      console.error(`[AI Football Fallback] Failed to parse matches stats JSON for ${date}:`, text);
      return [];
    }
  }

  // ===== Unchanged Gemini-only Methods =====

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
      const response = JSON.parse(cleanJSONString(text));
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
      const response = JSON.parse(cleanJSONString(text));
      return Array.isArray(response) ? response : [];
    } catch (err) {
      console.error('[AI Football] Failed to parse season fixtures JSON:', text);
      return [];
    }
  }
}
