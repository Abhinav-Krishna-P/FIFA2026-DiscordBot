import { FootballService } from '../services/football';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('🧪 Testing World Cup API Integration...\n');

  // 1. Test getFixtures for today (June 15, 2026)
  console.log('--- 1. Testing getFixtures (Today: 2026-06-15) ---');
  try {
    const fixtures = await FootballService.getFixtures('2026-06-15');
    console.log(`✅ Found ${fixtures.length} upcoming fixtures:`);
    for (const f of fixtures) {
      console.log(`   ${f.homeTeam} vs ${f.awayTeam} | Kickoff: ${f.kickoffTime.toISOString()} | Status: ${f.status}`);
    }
  } catch (err) {
    console.error('❌ getFixtures failed:', err);
  }

  // 2. Test getFixtureResult for a finished match
  console.log('\n--- 2. Testing getFixtureResult (Germany vs Curaçao) ---');
  try {
    const result = await FootballService.getFixtureResult('Germany', 'Curaçao', '2026-06-14');
    console.log(`✅ Result: ${result.homeGoals} - ${result.awayGoals} | Winner: ${result.winner} | Status: ${result.status}`);
    console.log(`   Expected: 7 - 1 | Winner: HOME | Status: FT`);
  } catch (err) {
    console.error('❌ getFixtureResult failed:', err);
  }

  // 3. Test getFixtureResult for another match (reversed team order)
  console.log('\n--- 3. Testing getFixtureResult (Brazil vs Morocco, reversed order test) ---');
  try {
    const result = await FootballService.getFixtureResult('Morocco', 'Brazil', '2026-06-13');
    console.log(`✅ Result: ${result.homeGoals} - ${result.awayGoals} | Winner: ${result.winner} | Status: ${result.status}`);
    console.log(`   Expected: 1 - 1 | Winner: DRAW | Status: FT`);
  } catch (err) {
    console.error('❌ getFixtureResult failed:', err);
  }

  // 4. Test getFixtureResult for a not-started match
  console.log('\n--- 4. Testing getFixtureResult (France vs Senegal, not started) ---');
  try {
    const result = await FootballService.getFixtureResult('France', 'Senegal', '2026-06-16');
    console.log(`✅ Result: ${result.homeGoals} - ${result.awayGoals} | Winner: ${result.winner} | Status: ${result.status}`);
    console.log(`   Expected: null - null | Winner: null | Status: NS`);
  } catch (err) {
    console.error('❌ getFixtureResult failed:', err);
  }

  // 5. Test getMatchesWithStats for yesterday (June 14)
  console.log('\n--- 5. Testing getMatchesWithStats (Yesterday: 2026-06-14) ---');
  try {
    const matches = await FootballService.getMatchesWithStats('2026-06-14');
    console.log(`✅ Found ${matches.length} finished matches with stats:`);
    for (const m of matches) {
      console.log(`   ${m.fixture.homeTeam} ${m.fixture.homeGoals} - ${m.fixture.awayGoals} ${m.fixture.awayTeam} (${m.fixture.winner})`);
    }
  } catch (err) {
    console.error('❌ getMatchesWithStats failed:', err);
  }

  // 6. Test getMatchesWithStats for June 13 (should find Brazil vs Morocco, etc.)
  console.log('\n--- 6. Testing getMatchesWithStats (2026-06-13) ---');
  try {
    const matches = await FootballService.getMatchesWithStats('2026-06-13');
    console.log(`✅ Found ${matches.length} finished matches with stats:`);
    for (const m of matches) {
      console.log(`   ${m.fixture.homeTeam} ${m.fixture.homeGoals} - ${m.fixture.awayGoals} ${m.fixture.awayTeam} (${m.fixture.winner})`);
    }
  } catch (err) {
    console.error('❌ getMatchesWithStats failed:', err);
  }

  console.log('\n🏁 All tests completed!');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
