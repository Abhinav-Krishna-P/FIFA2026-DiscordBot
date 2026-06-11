import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  Client,
  PermissionFlagsBits
} from 'discord.js';
import { SchedulerService } from '../../services/scheduler';
import { Command } from '../index';

export const forceQuizCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('force-generate-quiz')
    .setDescription("Admin: Force generation of today's quiz from yesterday's match statistics")
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
      await scheduler.generateQuizJob();
      
      await interaction.editReply({
        content: "✅ Successfully triggered daily quiz generation. Check the database or try running `/quiz` to take it!"
      });
    } catch (error) {
      console.error('Error forcing quiz generation:', error);
      await interaction.editReply({
        content: `❌ Failed to generate quiz: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
};
