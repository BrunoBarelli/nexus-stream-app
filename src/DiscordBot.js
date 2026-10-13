import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InviteTargetType,
  ActivityType
} from 'discord.js';

export class DiscordBot {
  #client;
  #token;
  #clientId;
  #publicUrl;

  constructor({ token, clientId, publicUrl }) {
    this.#token = token;
    this.#clientId = clientId;
    this.#publicUrl = publicUrl || 'http://localhost:3000';
  }

  get isConfigured() {
    return Boolean(this.#token && this.#clientId);
  }

  async start() {
    if (!this.isConfigured) {
      console.log('\n[Discord Bot] Token ou Client ID ausentes no arquivo .env.');
      console.log('[Discord Bot] O servidor web da Atividade continua rodando normalmente.\n');
      return;
    }

    this.#client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
    });

    this.#client.once('ready', () => this.#onReady());
    this.#client.on('interactionCreate', (interaction) => this.#onInteraction(interaction));

    try {
      await this.#client.login(this.#token);
    } catch (err) {
      console.error('[Discord Bot] Falha ao fazer login com o TOKEN fornecido:', err.message);
    }
  }

  #buildCommands() {
    return [
      new SlashCommandBuilder()
        .setName('stream')
        .setDescription('Inicia o compartilhamento de tela no seu canal de voz'),
      new SlashCommandBuilder()
        .setName('painel')
        .setDescription('Abre o Painel de Transmissão para escolher a tela e qualidade'),
      new SlashCommandBuilder()
        .setName('ajuda')
        .setDescription('Como usar o Nexus Stream: 4K, 120 FPS e escudo anti-eco')
    ].map(c => c.toJSON());
  }

  async #onReady() {
    console.log(`[Discord Bot] Online: ${this.#client.user.tag}`);

    this.#client.user.setActivity('Nexus Stream 4K | /stream', { type: ActivityType.Playing });

    try {
      const rest = new REST({ version: '10' }).setToken(this.#token);
      const route = Routes.applicationCommands(this.#clientId);

      // Busca os comandos existentes para preservar o Entry Point command
      // (o Discord não permite removê-lo em um bulk update).
      const existing = await rest.get(route);
      const entryPoint = Array.isArray(existing)
        ? existing.find(c => c.type === 4)
        : null;

      const body = this.#buildCommands();
      if (entryPoint) body.push(entryPoint);

      await rest.put(route, { body });
      console.log('[Discord Bot] Comandos de barra registrados com sucesso!');
    } catch (error) {
      console.error('[Discord Bot] Erro ao registrar comandos:', error.message);
    }
  }

  async #onInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    try {
      if (interaction.commandName === 'stream') {
        await this.#handleStream(interaction);
      } else if (interaction.commandName === 'painel') {
        await this.#handlePainel(interaction);
      } else if (interaction.commandName === 'ajuda') {
        await this.#handleAjuda(interaction);
      }
    } catch (err) {
      console.error('[Discord Bot] Erro ao processar comando:', err.message);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Ocorreu um erro interno ao processar o comando.', ephemeral: true }).catch(() => {});
      }
    }
  }

  async #handleStream(interaction) {
    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: 'Voce precisa estar conectado em um **canal de voz** para abrir a transmissao!',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    const row = this.#buildPanelButtons();
    const embed = new EmbedBuilder()
      .setColor('#c026d3')
      .setTitle('Nexus Live // Transmissao Pronta!')
      .setDescription(
        `A transmissao esta pronta no canal **${voiceChannel.name}**!\n\n` +
        `**Resolucoes:** 720p, 1080p e 4K Ultra HD\n` +
        `**Taxa de Quadros:** 30 FPS, 60 FPS e 120 FPS\n` +
        `**Escudo Anti-Eco:** Somente audio do jogo, sem eco da chamada de voz\n` +
        `**Sem Nitro:** 100% Gratuito para todos assistirem`
      )
      .setTimestamp();

    try {
      const invite = await voiceChannel.createInvite({
        targetApplication: this.#clientId,
        targetType: InviteTargetType.EmbeddedApplication,
        maxAge: 86400,
        maxUses: 0
      });

      row.addComponents(
        new ButtonBuilder()
          .setLabel('Assistir no Canal de Voz')
          .setStyle(ButtonStyle.Link)
          .setURL(invite.url)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error('[Discord Bot] Erro ao gerar convite de atividade:', err.message);
      embed.setDescription('Clique nos botoes abaixo para abrir a transmissao e o painel de controle:');
      await interaction.editReply({ embeds: [embed], components: [this.#buildPanelButtons(true)] });
    }
  }

  #buildPanelButtons(withViewer = false) {
    const row = new ActionRowBuilder();
    if (withViewer) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel('Abrir Visualizador da Live')
          .setStyle(ButtonStyle.Link)
          .setURL(this.#publicUrl)
      );
    }
    row.addComponents(
      new ButtonBuilder()
        .setLabel('Abrir Painel do Transmissor')
        .setStyle(ButtonStyle.Link)
        .setURL(`${this.#publicUrl}/streamer`)
    );
    return row;
  }

  async #handlePainel(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#00f0ff')
      .setTitle('Seu Painel de Transmissao')
      .setDescription(`Acesse o painel abaixo para escolher sua tela, um jogo ou sua camera:\n\n**[Clique aqui para abrir o Painel](${this.#publicUrl}/streamer)**`)
      .setFooter({ text: 'Somente voce pode ver esta mensagem.' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  async #handleAjuda(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#5865f2')
      .setTitle('Guia Nexus Stream')
      .addFields(
        { name: '1. Como transmitir?', value: 'Entre em um canal de voz e digite `/stream` no chat. O bot enviara o botao para iniciar a atividade.' },
        { name: '2. Como funciona o Escudo Anti-Eco?', value: 'No painel do transmissor, selecione **"So do jogo"**. Ele isola o audio do jogo e impede que vozes voltem como eco.' },
        { name: '3. Camera Virtual / OBS Studio', value: 'Selecione **"Camera (OBS, placa)"** no painel para transmitir overlays e cenas do OBS.' }
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
