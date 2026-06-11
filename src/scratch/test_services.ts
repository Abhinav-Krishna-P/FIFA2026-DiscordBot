import dotenv from 'dotenv';
import { FootballService } from '../services/football';
import { AIService } from '../services/ai';
import { getISTDateString } from '../utils/date';

dotenv.config();

async function runTests() {
  console.log('🧪 Starting FIFA 2026 Discord Bot Service Tests...\n');

  const todayStr = getISTDateString(0);
  const yesterdayStr = getISTDateString(-1);

  console.log(`[Config] Today (IST): ${todayStr}`);
  console.log(`[Config] Yesterday (IST): ${yesterdayStr}`);
  console.log(`[Config] Gemini API Key status: ${process.env.GEMINI_API_KEY ? 'Present' : 'Missing'}\n`);

  // 1. Test Football Service (Gemini AI-powered) - World Cup 2026 Teams, Matches, and Stadiums
  console.log('--- 1. Testing Football Service (World Cup 2026 Data via Gemini) ---');
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY is not defined. Skipping tests.');
    return;
  }

  try {
    // Fetch Teams
    console.log('Fetching participating World Cup 2026 teams...');
    const teams = await FootballService.getTeams();
    console.log(`✅ Success! Retrieved ${teams.length} teams.`);
    if (teams.length > 0) {
      console.log('Sample Team:', teams[0]);
    }

    // Fetch All Matches (Fixtures) & Stadiums
    console.log('\nFetching all World Cup 2026 fixtures & venues...');
    const allFixtures = await FootballService.getAllSeasonFixtures();
    console.log(`✅ Success! Retrieved ${allFixtures.length} total tournament matches.`);
    
    if (allFixtures.length > 0) {
      // Collect unique stadiums
      const stadiums = new Set<string>();
      allFixtures.forEach((f: any) => {
        if (f.fixture.venue && f.fixture.venue.name) {
          stadiums.add(`${f.fixture.venue.name} (${f.fixture.venue.city || 'Unknown City'})`);
        }
      });

      console.log(`Found ${stadiums.size} unique tournament Stadiums/Venues:`);
      Array.from(stadiums).slice(0, 10).forEach(s => console.log(` • ${s}`));
      if (stadiums.size > 10) console.log(` ... and ${stadiums.size - 10} more`);

      console.log('\nSample Match (Fixture):', {
        id: allFixtures[0].fixture.id,
        date: allFixtures[0].fixture.date,
        venue: allFixtures[0].fixture.venue.name,
        homeTeam: allFixtures[0].teams.home.name,
        awayTeam: allFixtures[0].teams.away.name,
        status: allFixtures[0].fixture.status.long
      });
    } else {
      console.log('No fixtures found for the 2026 World Cup season in the service.');
    }
  } catch (err) {
    console.error('❌ AI Football Service Test Failed:', err);
  }
  console.log();

  // 2. Test Yesterday's Fixtures & Stats + Gemini Quiz Generation
  console.log('--- 2. Testing Yesterday\'s Stats & Gemini Quiz Generation ---');
  try {
    console.log('Fetching yesterday\'s match stats...');
    const matchesWithStats = await FootballService.getMatchesWithStats(yesterdayStr);
    console.log(`Retrieved ${matchesWithStats.length} completed matches with stats from yesterday.`);

    if (matchesWithStats.length > 0) {
      console.log('Sample Match stats:', JSON.stringify(matchesWithStats[0], null, 2));
    }

    console.log('Sending data to Gemini API to generate daily quiz questions...');
    const quiz = await AIService.generateDailyQuiz(matchesWithStats);
    console.log('✅ Success! Gemini generated a valid 10-question quiz.');
    console.log(`Generated Questions count: ${quiz.length}`);
    console.log('Sample Question 1:', JSON.stringify(quiz[0], null, 2));
  } catch (err) {
    console.error('❌ Quiz Generation Test Failed:', err);
  }

  // 3. Test Match Result Retrieval
  console.log('\n--- 3. Testing Match Result Retrieval (Gemini Settle Query) ---');
  try {
    const homeTeam = 'United States';
    const awayTeam = 'Mexico';
    console.log(`Fetching specific match result: ${homeTeam} vs ${awayTeam} on ${yesterdayStr}...`);
    const result = await FootballService.getFixtureResult(homeTeam, awayTeam, yesterdayStr);
    console.log('✅ Success! Retrieved result from Gemini:', result);
  } catch (err) {
    console.error('❌ Match Result Test Failed:', err);
  }

  console.log('\n🧪 Testing complete.');
}

runTests().catch(console.error);
