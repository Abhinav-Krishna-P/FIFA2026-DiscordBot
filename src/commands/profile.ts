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

      // Calculate date ranges in Asia/Kolkata (IST) timezone for transaction checks
      const now = new Date();
      const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const diff = now.getTime() - istTime.getTime();

      // Today start (IST 12:00 AM)
      const todayIST = new Date(istTime);
      todayIST.setHours(0, 0, 0, 0);
      const startOfToday = new Date(todayIST.getTime() + diff);

      // Week start (Monday IST 12:00 AM)
      const weekIST = new Date(istTime);
      const day = weekIST.getDay();
      const diffDays = weekIST.getDate() - day + (day === 0 ? -6 : 1);
      weekIST.setDate(diffDays);
      weekIST.setHours(0, 0, 0, 0);
      const startOfWeek = new Date(weekIST.getTime() + diff);

      // Month start (1st day IST 12:00 AM)
      const monthIST = new Date(istTime);
      monthIST.setDate(1);
      monthIST.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(monthIST.getTime() + diff);

      // Fetch sum of earned coins (positive transactions) from CoinTransaction table
      const dailyTx = await prisma.coinTransaction.aggregate({
        _sum: { amount: true },
        where: {
          userId: targetUser.id,
          createdAt: { gte: startOfToday },
          amount: { gt: 0 }
        }
      });

      const weeklyTx = await prisma.coinTransaction.aggregate({
        _sum: { amount: true },
        where: {
          userId: targetUser.id,
          createdAt: { gte: startOfWeek },
          amount: { gt: 0 }
        }
      });

      const monthlyTx = await prisma.coinTransaction.aggregate({
        _sum: { amount: true },
        where: {
          userId: targetUser.id,
          createdAt: { gte: startOfMonth },
          amount: { gt: 0 }
        }
      });

      const dailyCoins = dailyTx._sum.amount || 0;
      const weeklyCoins = weeklyTx._sum.amount || 0;
      const monthlyCoins = monthlyTx._sum.amount || 0;

      // Calculate fastest completion time without displaying quiz score
      let fastestTimeStr = 'N/A';
      if (dbUser.quizParticipations.length > 0) {
        const fastestPart = [...dbUser.quizParticipations].sort((a, b) => a.durationMs - b.durationMs)[0];
        fastestTimeStr = `**${(fastestPart.durationMs / 1000).toFixed(1)}s**`;
      }

      // Format achievements list
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
            name: '📈 F26 Coins Earned', value:
              `• **Today:** **+${dailyCoins}** Coins\n` +
              `• **This Week:** **+${weeklyCoins}** Coins\n` +
              `• **This Month:** **+${monthlyCoins}** Coins`,
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
