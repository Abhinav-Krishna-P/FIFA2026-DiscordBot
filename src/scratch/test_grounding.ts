import { FootballService } from '../services/football';
import { AIService } from '../services/ai';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('🧪 Starting targeted Integration Test...');

  // 1. Test getFixtureResult (Grounded Settle Result)
  console.log('\n--- 1. Testing getFixtureResult (Grounded) ---');
  try {
    const homeTeam = 'Brazil';
    const awayTeam = 'Morocco';
    const date = '2026-06-13';
    console.log(`Fetching result for ${homeTeam} vs ${awayTeam} on ${date}...`);
    const result = await FootballService.getFixtureResult(homeTeam, awayTeam, date);
    console.log('✅ Result retrieved:', result);
  } catch (err) {
    console.error('❌ getFixtureResult failed:', err);
  }

  // 2. Test getMatchesWithStats (Grounded Yesterday Stats)
  console.log('\n--- 2. Testing getMatchesWithStats (Grounded) ---');
  let matchesWithStats: any[] = [];
  try {
    const date = '2026-06-13';
    console.log(`Fetching matches with stats for ${date}...`);
    matchesWithStats = await FootballService.getMatchesWithStats(date);
    console.log(`✅ Retrieved ${matchesWithStats.length} matches with stats.`);
    if (matchesWithStats.length > 0) {
      console.log('Sample Match:', JSON.stringify(matchesWithStats[0], null, 2));
    }
  } catch (err) {
    console.error('❌ getMatchesWithStats failed:', err);
  }

  // 3. Test generateDailyQuiz using these stats
  if (matchesWithStats.length > 0) {
    console.log('\n--- 3. Testing AIService.generateDailyQuiz ---');
    try {
      console.log('Generating quiz based on retrieved stats...');
      const quiz = await AIService.generateDailyQuiz(matchesWithStats);
      console.log(`✅ Successfully generated ${quiz.length} trivia questions!`);
      console.log('Sample Question:', JSON.stringify(quiz[0], null, 2));
    } catch (err) {
      console.error('❌ generateDailyQuiz failed:', err);
    }
  } else {
    console.log('\n⚠️ Skipping quiz generation test because no matches were retrieved.');
  }

  console.log('\n🧪 Testing complete.');
}

run().catch(console.error);
