import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder
} from 'discord.js';
import { prisma } from '../services/db';
import { Command } from './index';

export const coinsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('coins')
    .setDescription("Display a user's FIFA W Coin balance")
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user whose coins you want to check')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    const targetUser = interaction.options.getUser('user') || interaction.user;

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

    const embed = new EmbedBuilder()
      .setTitle(`💰 FIFA W Coins Balance`)
      .setDescription(`<@${targetUser.id}> currently has **${dbUser.coins}** FIFA W Coins!`)
      .setColor(0xeab308)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
