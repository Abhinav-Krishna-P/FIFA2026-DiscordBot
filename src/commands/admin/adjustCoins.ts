import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  Client, 
  EmbedBuilder 
} from 'discord.js';
import { prisma } from '../../services/db';
import { Command } from '../index';

export const adjustCoinsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('adjust-coins')
    .setDescription("Admin: Add or remove FIFA W Coins from a user's balance")
    .addUserOption(option => 
      option
        .setName('user')
        .setDescription('The user whose balance you want to adjust')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('The number of coins to add (use negative to remove)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the adjustment')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    // Check for administrator permission
    if (!interaction.memberPermissions?.has('Administrator')) {
      await interaction.editReply({
        content: '❌ You do not have permission to run this command. (Requires Administrator)'
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const reason = interaction.options.getString('reason') || 'admin_adjust';

    try {
      // Fetch or create user in DB
      let dbUser = await prisma.user.findUnique({
        where: { id: targetUser.id }
      });

      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            id: targetUser.id,
            username: targetUser.username,
            coins: 0
          }
        });
      }

      // Update user coins
      const updatedUser = await prisma.user.update({
        where: { id: targetUser.id },
        data: {
          coins: { increment: amount }
        }
      });

      // Log transaction
      await prisma.coinTransaction.create({
        data: {
          userId: targetUser.id,
          amount: amount,
          reason: reason
        }
      });

      const actionText = amount >= 0 ? 'Added' : 'Removed';
      const absAmount = Math.abs(amount);

      const embed = new EmbedBuilder()
        .setTitle('💰 Coin Balance Adjusted')
        .setDescription(`Successfully adjusted the balance for <@${targetUser.id}>.`)
        .addFields(
          { name: 'Action', value: `${actionText} **${absAmount}** Coins`, inline: true },
          { name: 'New Balance', value: `**${updatedUser.coins}** Coins`, inline: true },
          { name: 'Reason', value: `\`${reason}\``, inline: false }
        )
        .setColor(amount >= 0 ? 0x10b981 : 0xef4444)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Notify the user in the server if the bot has permission
      try {
        if (interaction.channel && 'send' in interaction.channel) {
          await (interaction.channel as any).send({
            content: `🔔 <@${targetUser.id}>, your coin balance was adjusted by an administrator: **${amount >= 0 ? '+' : ''}${amount} FIFA W Coins** (Reason: \`${reason}\`). New balance: **${updatedUser.coins}**`
          });
        }
      } catch (err) {
        console.warn('Could not post announcement in current channel:', err);
      }
    } catch (err) {
      console.error('Error adjusting coins:', err);
      await interaction.editReply({
        content: `❌ Failed to adjust coins: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }
};
