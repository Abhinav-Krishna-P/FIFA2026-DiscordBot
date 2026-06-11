import cron from 'node-cron';
import { Client, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { prisma } from './db';
import { FootballService } from './football';
import { AIService } from './ai';
import { getISTDateString } from '../utils/date';
import { activeQuizSessions } from '../commands/quiz';


export class SchedulerService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Initializes all cron schedules.
   */
  public start(): void {
    console.log('Initializing scheduler jobs...');

    // 1. Generate daily quiz at 2:30 AM IST
    cron.schedule('30 14 * * *', async () => {
      console.log('[Scheduler] Running Daily Quiz Generation job...');
      try {
        await this.generateQuizJob();
      } catch (err) {
        console.error('[Scheduler] Error in Daily Quiz Generation:', err);
      }
    }, {
      timezone: 'Asia/Kolkata'
    });

    // 2. Generate today's match prediction polls at 11:00 AM IST
    cron.schedule('00 11 * * *', async () => {
      console.log('[Scheduler] Running Match Prediction Polls Generation job...');
      try {
        await this.generatePollsJob();
      } catch (err) {
        console.error('[Scheduler] Error in Match Polls Generation:', err);
      }
    }, {
      timezone: 'Asia/Kolkata'
    });

    // 3. Settle yesterday's polls and distribute rewards at 10:00 AM IST
    cron.schedule('0 10 * * *', async () => {
      console.log('[Scheduler] Running Polls Settlement job...');
      try {
        await this.settlePollsJob();
      } catch (err) {
        console.error('[Scheduler] Error in Polls Settlement:', err);
      }
    }, {
      timezone: 'Asia/Kolkata'
    });

    // 4. Calculate daily quiz winners and distribute rewards at 6:00 PM IST
    cron.schedule('0 18 * * *', async () => {
      console.log('[Scheduler] Running Daily Quiz Winners Calculation job...');
      try {
        await this.calculateQuizWinnersJob();
      } catch (err) {
        console.error('[Scheduler] Error in Daily Quiz Winners Calculation:', err);
      }
    }, {
      timezone: 'Asia/Kolkata'
    });

    console.log('Scheduler jobs successfully scheduled.');
  }

  /**
   * Job 1: Fetches yesterday's match data and generates the daily quiz.
   */
  public async generateQuizJob(): Promise<void> {
    const yesterdayStr = getISTDateString(-1);
    const todayStr = getISTDateString(0);

    console.log(`[Quiz Job] Generating quiz for date ${todayStr} based on match results from ${yesterdayStr}...`);

    // Check if quiz already exists
    const existing = await prisma.quiz.findUnique({
      where: { date: todayStr }
    });

    if (existing) {
      console.log(`[Quiz Job] Quiz for date ${todayStr} already exists. Skipping.`);
      return;
    }

    // Fetch yesterday's match results and statistics
    const matchesWithStats = await FootballService.getMatchesWithStats(yesterdayStr);

    // Generate quiz via AI
    const questions = await AIService.generateDailyQuiz(matchesWithStats);

    // Save to database
    await prisma.quiz.create({
      data: {
        date: todayStr,
        questions: questions as any,
      }
    });

    console.log(`[Quiz Job] Successfully created daily quiz with 10 questions for ${todayStr}.`);

    // Announce the daily quiz automatically
    try {
      const channelId = process.env.PREDICTIONS_CHANNEL_ID;
      if (!channelId) {
        console.warn('[Quiz Job] PREDICTIONS_CHANNEL_ID is not configured. Cannot post quiz announcement.');
        return;
      }

      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        console.error(`[Quiz Job] Announcement channel with ID ${channelId} not found or is not a text channel.`);
        return;
      }

      // Build announcement embed
      const embed = new EmbedBuilder()
        .setTitle(`📝 FIFA World Cup 2026 Daily Quiz - ${todayStr}`)
        .setDescription(
          `⚽ **Today's Trivia is Live!** ⚽\n\n` +
          `Test your football knowledge about yesterday's matches and World Cup history!\n\n` +
          `💰 **Rewards:**\n` +
          `• **+1 Coin** just for participating!\n` +
          `• **+20 Coins** for 1st Place podium!\n` +
          `• **+10 Coins** for 2nd Place!\n` +
          `• **+5 Coins** for 3rd Place!\n\n` +
          `Click the **Start Quiz** button below to start your private quiz session!`
        )
        .setColor(0x3b82f6)
        .setTimestamp();

      const btnStart = new ButtonBuilder()
        .setCustomId('quiz_start_button')
        .setLabel('📝 Start Quiz')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnStart);

      await channel.send({
        embeds: [embed],
        components: [row]
      });

      console.log(`[Quiz Job] Successfully posted daily quiz announcement to channel ${channelId}.`);
    } catch (err) {
      console.error('[Quiz Job] Failed to post daily quiz announcement:', err);
    }
  }

  /**
   * Job 2: Fetches today's matches and creates prediction polls with buttons on Discord.
   */
  public async generatePollsJob(): Promise<void> {
    const todayStr = getISTDateString(0);
    console.log(`[Polls Job] Generating prediction polls for today's matches: ${todayStr}...`);

    const channelId = process.env.PREDICTIONS_CHANNEL_ID;
    if (!channelId) {
      console.warn('[Polls Job] PREDICTIONS_CHANNEL_ID is not configured. Cannot post polls.');
      return;
    }

    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      console.error(`[Polls Job] Predictions channel with ID ${channelId} not found or is not a text channel.`);
      return;
    }

    // Fetch today's fixtures
    const fixtures = await FootballService.getFixtures(todayStr);
    console.log("fixtures:", fixtures);
    if (fixtures.length === 0) {
      console.log(`[Polls Job] No fixtures found for today (${todayStr}).`);
      await channel.send(`⚽ No World Cup matches scheduled for today (${todayStr}). No prediction polls will be created.`);
      return;
    }

    console.log(`[Polls Job] Found ${fixtures.length} matches. Posting polls...`);
    await channel.send(`🏆 **FIFA World Cup 2026 Prediction Polls - ${todayStr}** 🏆\nPredict the winner to earn **5 FIFA W Coins**! Votes close at match kickoff.`);

    for (const fixture of fixtures) {
      // Create embed
      const kickoffTimeFormatted = `<t:${Math.floor(fixture.kickoffTime.getTime() / 1000)}:F>`;
      const kickoffRelative = `<t:${Math.floor(fixture.kickoffTime.getTime() / 1000)}:R>`;

      const embed = new EmbedBuilder()
        .setTitle(`⚔️ Match Prediction: ${fixture.homeTeam} vs ${fixture.awayTeam}`)
        .setDescription(`**Kickoff Time:** ${kickoffTimeFormatted} (${kickoffRelative})\n\nSelect the team you predict will win! Double voting is not allowed.`)
        .setColor(0x1d4ed8)
        .setFooter({ text: `Match ID: ${fixture.id}` });

      // Create buttons
      const btnHome = new ButtonBuilder()
        .setCustomId(`predict_${fixture.id}_HOME`)
        .setLabel(fixture.homeTeam)
        .setStyle(ButtonStyle.Primary);

      const btnDraw = new ButtonBuilder()
        .setCustomId(`predict_${fixture.id}_DRAW`)
        .setLabel('Draw')
        .setStyle(ButtonStyle.Secondary);

      const btnAway = new ButtonBuilder()
        .setCustomId(`predict_${fixture.id}_AWAY`)
        .setLabel(fixture.awayTeam)
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnHome, btnDraw, btnAway);

      // Post to Discord
      const message = await channel.send({
        embeds: [embed],
        components: [row]
      });

      // Save to database
      await prisma.matchPredictionPoll.create({
        data: {
          id: message.id,
          matchId: String(fixture.id),
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          kickoffTime: fixture.kickoffTime,
          channelId: channel.id,
          status: 'active'
        }
      });

      console.log(`[Polls Job] Posted poll for match ${fixture.homeTeam} vs ${fixture.awayTeam} (Msg ID: ${message.id}).`);
    }
  }

  /**
   * Job 3: Settles yesterday's prediction polls based on final results.
   */
  public async settlePollsJob(): Promise<void> {
    const yesterdayStr = getISTDateString(-1);
    console.log(`[Settle Job] Settling prediction polls for date ${yesterdayStr}...`);

    // Fetch active polls in the database
    const activePolls = await prisma.matchPredictionPoll.findMany({
      where: { status: 'active' }
    });

    if (activePolls.length === 0) {
      console.log('[Settle Job] No active prediction polls to settle.');
      return;
    }

    for (const poll of activePolls) {
      // Format the kickoff time to date string in Asia/Kolkata timezone
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const matchDateStr = formatter.format(poll.kickoffTime);

      try {
        console.log(`[Settle Job] Querying Gemini for result of ${poll.homeTeam} vs ${poll.awayTeam} on ${matchDateStr}...`);
        const result = await FootballService.getFixtureResult(poll.homeTeam, poll.awayTeam, matchDateStr);

        // Check if match is finished (Gemini returns status "FT")
        const isFinished = result.status === 'FT';
        if (!isFinished) {
          console.log(`[Settle Job] Match ${poll.homeTeam} vs ${poll.awayTeam} has not finished yet (Status: ${result.status}). Skipping.`);
          continue;
        }

        const winner = result.winner; // 'HOME', 'AWAY', or 'DRAW'
        if (!winner) {
          console.warn(`[Settle Job] Finished match ${poll.id} has no winner determined. Skipping.`);
          continue;
        }

        console.log(`[Settle Job] Settling match ${poll.homeTeam} vs ${poll.awayTeam}. Winner: ${winner}, Score: ${result.homeGoals} - ${result.awayGoals}`);

        // Find all predictions for this poll
        const predictions = await prisma.prediction.findMany({
          where: { pollId: poll.id },
          include: { user: true }
        });

        const winnersList: string[] = [];

        for (const pred of predictions) {
          const isCorrect = pred.predictedWinner === winner;
          if (isCorrect) {
            // Reward user
            await prisma.user.update({
              where: { id: pred.userId },
              data: {
                coins: { increment: 5 },
                totalPollWins: { increment: 1 }
              }
            });

            // Log transaction
            await prisma.coinTransaction.create({
              data: {
                userId: pred.userId,
                amount: 5,
                reason: 'prediction_win'
              }
            });

            winnersList.push(`<@${pred.userId}>`);
          }
        }

        // Update poll status in database
        await prisma.matchPredictionPoll.update({
          where: { id: poll.id },
          data: {
            status: 'settled',
            winner: winner
          }
        });

        // Post result to Discord channel
        const channel = await this.client.channels.fetch(poll.channelId);
        if (channel && channel instanceof TextChannel) {
          const resultText = winner === 'DRAW' ? 'Draw' : (winner === 'HOME' ? poll.homeTeam : poll.awayTeam);

          let announcement = `🔔 **Prediction Poll Settle:** **${poll.homeTeam} vs ${poll.awayTeam}**\n` +
            `• Final Score: ${result.homeGoals} - ${result.awayGoals}\n` +
            `• Winning Prediction: **${resultText}**\n\n`;

          if (winnersList.length > 0) {
            announcement += `🎉 **Congratulations to correct predictors (+5 FIFA W Coins):**\n${winnersList.join(', ')}`;
          } else {
            announcement += `😔 No users predicted this outcome correctly. Better luck next time!`;
          }

          await channel.send(announcement);
        }
      } catch (err) {
        console.error(`[Settle Job] Error settling poll ${poll.id} (${poll.homeTeam} vs ${poll.awayTeam}):`, err);
      }
    }
  }

  /**
   * Job 4: Finds top scores for today's quiz, awards daily winners, resets daily leaderboards, and posts podium.
   */
  public async calculateQuizWinnersJob(): Promise<void> {
    // Daily quiz is closing: clear all active quiz sessions to free memory and reset state
    activeQuizSessions.clear();
    console.log("[Quiz Winners] Cleared all active quiz sessions for the day.");

    const todayStr = getISTDateString(0);
    console.log(`[Quiz Winners] Calculating podium for today's quiz: ${todayStr}...`);

    // Find today's quiz
    const quiz = await prisma.quiz.findUnique({
      where: { date: todayStr }
    });

    if (!quiz) {
      console.warn(`[Quiz Winners] No quiz found in the database for today (${todayStr}).`);
      return;
    }

    // Fetch predictions channel to announce quiz winners (we post in predictions channel or a general updates channel if configured)
    const channelId = process.env.PREDICTIONS_CHANNEL_ID;
    if (!channelId) {
      console.warn('[Quiz Winners] PREDICTIONS_CHANNEL_ID is not configured. Cannot announce podium.');
      return;
    }

    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      console.error(`[Quiz Winners] Announcement channel with ID ${channelId} not found or is not a text channel.`);
      return;
    }

    // Fetch all participations for this quiz
    const participations = await prisma.quizParticipation.findMany({
      where: { quizId: quiz.id },
      include: { user: true },
      orderBy: [
        { score: 'desc' },
        { durationMs: 'asc' }
      ]
    });

    if (participations.length === 0) {
      console.log(`[Quiz Winners] No participations recorded for today's quiz (${todayStr}).`);
      await channel.send(`📊 **Daily Quiz Results - ${todayStr}**\nNo users participated in today's quiz. Use \`/quiz\` tomorrow to join and earn coins!`);
      return;
    }

    console.log(`[Quiz Winners] Found ${participations.length} participations. Distributing top rewards...`);

    // Define reward amounts
    const rewards = [
      { place: '1st', coins: 20, reason: 'quiz_daily_1st' },
      { place: '2nd', coins: 10, reason: 'quiz_daily_2nd' },
      { place: '3rd', coins: 5, reason: 'quiz_daily_3rd' }
    ];

    const podiumLines: string[] = [];

    for (let i = 0; i < Math.min(participations.length, 3); i++) {
      const part = participations[i];
      const reward = rewards[i];
      const timeInSec = (part.durationMs / 1000).toFixed(1);

      // Award coins
      await prisma.user.update({
        where: { id: part.userId },
        data: { coins: { increment: reward.coins } }
      });

      // Log transaction
      await prisma.coinTransaction.create({
        data: {
          userId: part.userId,
          amount: reward.coins,
          reason: reward.reason
        }
      });

    }

    // Build plain-text announcement with large headers for 1st and 2nd places
    const winner1 = participations[0];
    const time1 = (winner1.durationMs / 1000).toFixed(1);
    
    let announcement = `🎉✨ **DAILY QUIZ CHAMPIONS** ✨🎉\n\n`;
    announcement += `# 🥇 1st Place: <@${winner1.userId}>\n`;
    announcement += `*   **Quiz Mark:** \`${winner1.score}/10\`\n`;
    announcement += `*   **Time:** \`${time1}s\`\n`;
    announcement += `*   **Points Earned:** \`+20 F26 Coins\`\n\n`;

    if (participations.length > 1) {
      const winner2 = participations[1];
      const time2 = (winner2.durationMs / 1000).toFixed(1);
      announcement += `## 🥈 2nd Place: <@${winner2.userId}>\n`;
      announcement += `*   **Quiz Mark:** \`${winner2.score}/10\`\n`;
      announcement += `*   **Time:** \`${time2}s\`\n`;
      announcement += `*   **Points Earned:** \`+10 F26 Coins\`\n\n`;
    }

    announcement += `*Congratulations to today's champions! (Total participants: ${participations.length})*`;

    await channel.send({
      content: announcement
    });

    console.log('[Quiz Winners] Successfully distributed daily quiz podium rewards.');
  }
}
