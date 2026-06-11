import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder
} from 'discord.js';
import { prisma } from '../services/db';
import { getISTDateString } from '../utils/date';
import { Command } from './index';

export const profileCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Display a user's FIFA World Cup profile and stats")
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user whose profile you want to view')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
      // Fetch or create user in DB
      let dbUser = await prisma.user.findUnique({
        where: { id: targetUser.id },
        include: {
          achievements: true,
          quizParticipations: true
        }
      });

      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            id: targetUser.id,
            username: targetUser.username,
            coins: 0
          },
          include: {
            achievements: true,
            quizParticipations: true
          }
        });
      }

      // Calculate stats
      const todayStr = getISTDateString(0);

      // 1. Daily Quiz Score
      const todayQuiz = await prisma.quiz.findUnique({
        where: { date: todayStr }
      });
      let dailyScoreStr = 'Not taken yet';
      if (todayQuiz) {
        const todayPart = dbUser.quizParticipations.find(p => p.quizId === todayQuiz.id);
        if (todayPart) {
          const timeSec = (todayPart.durationMs / 1000).toFixed(1);
          dailyScoreStr = `**${todayPart.score}/10** in ${timeSec}s`;
        }
      }

      // 2. Weekly Quiz Score (since Monday)
      const now = new Date();
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      const weeklyScore = dbUser.quizParticipations
        .filter(p => p.startedAt >= startOfWeek)
        .reduce((sum, p) => sum + p.score, 0);

      // 3. Monthly Quiz Score (since 1st of month)
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const monthlyScore = dbUser.quizParticipations
        .filter(p => p.startedAt >= startOfMonth)
        .reduce((sum, p) => sum + p.score, 0);

      // 4. Fastest Quiz Completion
      let fastestTimeStr = 'N/A';
      if (dbUser.quizParticipations.length > 0) {
        const fastestPart = [...dbUser.quizParticipations].sort((a, b) => a.durationMs - b.durationMs)[0];
        fastestTimeStr = `**${(fastestPart.durationMs / 1000).toFixed(1)}s** (Score: ${fastestPart.score}/10)`;
      }

      // 5. Achievements
      let achievementsStr = 'No achievements unlocked yet.';
      if (dbUser.achievements.length > 0) {
        achievementsStr = dbUser.achievements
          .map(a => `🏆 **${a.name}**: ${a.description} (<t:${Math.floor(a.unlockedAt.getTime() / 1000)}:R>)`)
          .join('\n');
      }

      // Build profile embed
      const embed = new EmbedBuilder()
        .setTitle(`⚽ FIFA World Cup 2026 Profile - ${targetUser.username}`)
        .setColor(0x1d4ed8)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { name: '💰 FIFA W Coins', value: `**${dbUser.coins}** Coins`, inline: true },
          { name: '🔮 Poll Predictions Won', value: `**${dbUser.totalPollWins}** wins`, inline: true },
          { name: '📝 Quizzes Completed', value: `**${dbUser.totalQuizParticipation}** quizzes`, inline: true },

          {
            name: '📊 Quiz Scores', value:
              `• **Today's Quiz:** ${dailyScoreStr}\n` +
              `• **This Week's Total:** **${weeklyScore}** points\n` +
              `• **This Month's Total:** **${monthlyScore}** points`,
            inline: false
          },
          { name: '⚡ Personal Records', value: `• **Fastest Quiz Time:** ${fastestTimeStr}`, inline: false },
          { name: '🏆 Achievements', value: achievementsStr, inline: false }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error in profile command:', err);
      await interaction.editReply({
        content: '❌ An error occurred while loading this user\'s profile.'
      });
    }
  }
};
