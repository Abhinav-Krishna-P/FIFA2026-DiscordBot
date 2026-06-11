import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  Client,
  PermissionFlagsBits
} from 'discord.js';
import { SchedulerService } from '../../services/scheduler';
import { Command } from '../index';

export const forcePollsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('force-generate-polls')
    .setDescription("Admin: Force generation of today's match prediction polls on Discord")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    // Check for administrator permission
    if (!interaction.memberPermissions?.has('Administrator')) {
      await interaction.editReply({
        content: '❌ You do not have permission to run this command. (Requires Administrator)'
      });
      return;
    }

    try {
      const scheduler = new SchedulerService(client);
      await scheduler.generatePollsJob();
      
      await interaction.editReply({
        content: "✅ Successfully triggered prediction polls generation. Check the configured channel!"
      });
    } catch (error) {
      console.error('Error forcing polls generation:', error);
      await interaction.editReply({
        content: `❌ Failed to generate polls: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
};
