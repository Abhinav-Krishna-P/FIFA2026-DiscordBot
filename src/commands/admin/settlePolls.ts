import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  Client 
} from 'discord.js';
import { SchedulerService } from '../../services/scheduler';
import { Command } from '../index';

export const settlePollsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('settle-polls')
    .setDescription("Admin: Force prediction poll settlement and reward distribution for yesterday's matches"),

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
      await scheduler.settlePollsJob();
      
      await interaction.editReply({
        content: "✅ Successfully ran prediction poll settlement. Check the logs and announcements channel for results!"
      });
    } catch (error) {
      console.error('Error settling polls:', error);
      await interaction.editReply({
        content: `❌ Failed to settle polls: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
};
